// Banco común de las simulaciones de agua y electricidad: dos paneles con el mismo circuito,
// bomba y fuente enlazadas (botón, LED, perilla y medidor), manómetro/voltímetro y caudal/amperímetro
// abajo junto al controlador, cada uno con dos caimanes que se arrastran a dos puntos del circuito,
// e inercia. Cada página solo agrega su parte del circuito.
//
// Sim.bench({
//   iFull,            mA a escala completa en los medidores de corriente y caudal
//   flowSpeed,        rapidez de las partículas en la tubería normal, por cada mA
//   v0,               voltaje inicial de la perilla
//   layout(g),        se llama cuando cambia el tamaño de un panel (g.side es 'w' o 'e')
//   model(V),         devuelve { I } (mA totales) y lo que la página necesite para dibujar
//   circuit(g, m, V), tramos del circuito sin contar la fuente, para los caimanes (ver más abajo);
//                     si falta, es una sola vuelta con todo el voltaje en el centro de arriba
//   clamps(g),        dónde empiezan los caimanes: { V: [rojo, negro], I: [rojo, negro] }
//   step(dt, m),      avanza lo que se mueve (partículas, ruedas)
//   drawW(ctx, g, m), drawE(ctx, g, m)   dibujan el circuito de cada lado
// })
(() => {
  const { C, draw: D, fmt, digits } = Sim;
  const VMAX = 12, KPA_PER_V = 10, MLS_PER_MA = 10, RPM_PER_MA = 100;
  const SRC = 40;   // medio ancho de la bomba (y de la fuente) sobre el cable de abajo
  const PROBE = { V: '#8b5cf6', I: '#0ea371' };   // color de cada medidor y de la región que mide
  const RED = '#d6392b';

  Sim.bench = o => {
    const iFull = o.iFull || 12, flowSpeed = o.flowSpeed || 12;
    const st = { on: false, set: o.v0 ?? 6, v: 0, tau: 1, level: Sim.ramp(), m: { I: 0 },
      rpm: 0, omega: 0, rotor: 0, nV: Sim.needle(), nS: Sim.needle(), nVm: Sim.needle(), nIm: Sim.needle(),
      segs: [], probe: { V: null, I: null }, pinned: { V: false, I: false } };
    const b = { st, VMAX, KPA_PER_V, MLS_PER_MA, SRC, iFull, flowSpeed, knobs: [] };

    // Tres acomodos del mismo circuito (siempre de x = 180 a 640, para que cada página dibuje igual):
    //   ancho:   la computadora; medidores a los lados del controlador, abajo del circuito.
    //   alto:    celular vertical; controlador abajo y los dos medidores, más grandes, en una fila debajo.
    //   lateral: celular horizontal; medidores y controlador en una columna a la derecha del circuito.
    // En el celular solo se ve de x0 a x0 + W, sin márgenes de sobra, para que todo salga más grande.
    const MODES = {
      ancho: { W: 800, x0: 0, hMin: 610, hMax: 1060 },
      alto: { W: 540, x0: 130, hMin: 840, hMax: 1300 },
      lateral: { W: 1040, x0: 110, hMin: 450, hMax: 620 }
    };
    const size = (w, h) => {
      const fit = m => {
        const H = Math.round(Math.max(m.hMin, Math.min(m.hMax, m.W * h / w)));
        return { H, s: Math.min(w / m.W, h / H) };
      };
      let mode = 'ancho', best = fit(MODES.ancho);
      // solo si en el acomodo ancho todo se vería chico
      if (best.s < 0.75) for (const k of ['alto', 'lateral']) {
        const f = fit(MODES[k]);
        if (f.s > best.s * 1.08) { mode = k; best = f; }
      }
      return [MODES[mode].W, best.H, MODES[mode].x0, mode];
    };
    const geometry = (side, W, H, mode = 'ancho') => {
      const g = { side, W, H, mode, X0: 180, X1: 640, PX: 400, TOP: 140, BW: 430, BH: 152, MK: 1 };
      if (mode === 'lateral') {
        g.BOT = H - 64;
        g.BX = 700; g.MK = 1.25;
        const my = 40 + 40 * g.MK;
        g.meters = { V: [g.BX + 105, my], I: [g.BX + g.BW - 105, my] };
        g.BY = my + 116 * g.MK;
        g.LEG = [g.BX + 140, Math.min(H - 22, g.BY + g.BH + 28), 150];
      } else if (mode === 'alto') {
        g.BOT = H - 444;
        g.BX = g.PX - 215; g.BY = g.BOT + 46; g.MK = 1.35;
        const my = g.BY + g.BH + 34 + 40 * g.MK;
        g.meters = { V: [g.PX - 135, my], I: [g.PX + 135, my] };
        g.LEG = [505, 24, 150];
      } else {
        g.BOT = H - 214;
        g.BX = g.PX - 215; g.BY = g.BOT + 46;
        g.meters = { V: [g.BX / 2, g.BY + 40], I: [(g.BX + g.BW + W) / 2, g.BY + 40] };
        g.LEG = [600, 46, 160];
      }
      g.CX = g.BX + g.BW / 2;   // centro del controlador (perilla)
      g.MIDY = (g.TOP + g.BOT) / 2;
      g.MY = g.TOP + 0.62 * (g.BOT - g.TOP);
      g.loop = D.rect(g.X0, g.TOP, g.X1, g.BOT);   // sube por la izquierda, cruza arriba, baja y regresa por abajo
      return g;
    };
    // Selector arriba para ver solo el agua, ambas o solo la electricidad (se recuerda en este navegador).
    const stage = document.querySelector('.sim-stage'), bar = document.querySelector('.sim-bar');
    const views = [['w', 'Agua'], ['both', 'Ambas'], ['e', 'Electricidad']];
    const seg = document.createElement('div');
    seg.className = 'sim-seg'; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'Qué circuito ver');
    const setView = v => {
      stage.dataset.view = v;
      seg.querySelectorAll('button').forEach(el => el.setAttribute('aria-checked', String(el.dataset.v === v)));
      try { localStorage.setItem('sim-view', v); } catch (e) {}
    };
    views.forEach(([v, t]) => {
      const el = document.createElement('button');
      el.type = 'button'; el.dataset.v = v; el.textContent = t; el.setAttribute('role', 'radio');
      el.addEventListener('click', () => setView(v));
      seg.appendChild(el);
    });
    bar.insertBefore(seg, bar.querySelector('.ctl'));
    let saved = 'both';
    try { saved = localStorage.getItem('sim-view') || 'both'; } catch (e) {}
    setView(views.some(([v]) => v === saved) ? saved : 'both');

    b.pw = Sim.panel(document.getElementById('pw'), size);
    b.pe = Sim.panel(document.getElementById('pe'), size);
    b.pw.mirror = b.pe; b.pe.mirror = b.pw;
    const relayout = (side, W, H, mode) => {
      const g = geometry(side, W, H, mode);
      Sim.compact = mode !== 'ancho';
      if (side === 'w') b.gw = g; else b.ge = g;
      o.layout && o.layout(g);
    };
    b.pw.onLayout = (W, H, mode) => relayout('w', W, H, mode);
    b.pe.onLayout = (W, H, mode) => relayout('e', W, H, mode);
    b.pw.refit(); b.pe.refit();
    b.pw.onLayout(b.pw.W, b.pw.H, b.pw.mode); b.pe.onLayout(b.pe.W, b.pe.H, b.pe.mode);
    const panel = side => side === 'w' ? b.pw : b.pe;
    const geo = side => side === 'w' ? b.gw : b.ge;

    // ---------- ayudas para controles ----------
    // Agrega un elemento a la capa de controles de un lado; pos(g) da su lugar en el dibujo.
    b.place = (side, el, pos) => {
      panel(side).box.querySelector('.sim-layer').appendChild(el);
      panel(side).at(el, () => pos(geo(side)));
      return el;
    };
    // Un botón en cada lado que hacen lo mismo. text(side) da su texto; b.refresh() lo actualiza.
    const buttons = [];
    b.linkedButton = ({ pos, text, label, onClick, cls = 'sim-btn small', hidden }) => {
      const pair = ['w', 'e'].map(side => {
        const el = document.createElement('button');
        el.type = 'button'; el.className = cls;
        el.addEventListener('click', () => { onClick(); b.refresh(); });
        return b.place(side, el, pos);
      });
      buttons.push({ pair, text, label, hidden });
      b.refresh();
      return pair;
    };
    b.refresh = () => {
      buttons.forEach(({ pair, text, label, hidden }) => pair.forEach((el, k) => {
        const side = k ? 'e' : 'w';
        if (text) el.textContent = text(side);
        if (label) el.setAttribute('aria-label', label(side));
        if (hidden) el.hidden = hidden();
      }));
      b.pw.replace(); b.pe.replace();
    };
    // Una perilla en cada lado, enlazadas. scale(side) da las marcas [texto, fracción]; caption(side) su nombre.
    b.linkedKnob = ({ pos, min, max, step, value, label, format, scale, caption, ticks = 12, onInput }) => {
      const ks = {};
      ['w', 'e'].forEach(side => {
        const el = b.place(side, document.createElement('div'), pos);
        ks[side] = Sim.knob(el, { min, max, step, value, label: label(side), format: v => format(v, side),
          onInput: v => { onInput(v); const other = ks[side === 'w' ? 'e' : 'w']; if (other) other.set(v, true); } });
      });
      b.knobs.push({ pos, scale, caption, ticks });
      return ks;
    };

    // ---------- controlador: bomba y fuente enlazadas ----------
    const power = b.linkedButton({
      pos: g => [g.BX + 58, g.BY + 92], cls: 'sim-power',
      label: side => (st.on ? 'Apagar ' : 'Encender ') + (side === 'w' ? 'la bomba' : 'la fuente'),
      onClick: () => { st.on = !st.on; }
    });
    const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>';
    const syncPower = () => power.forEach(el => { el.innerHTML = icon; el.setAttribute('aria-pressed', String(st.on)); });
    power.forEach(el => el.addEventListener('click', syncPower)); syncPower();
    b.linkedKnob({
      pos: g => [g.CX, g.BY + 80], min: 0, max: VMAX, step: 0.5, value: st.set,
      label: side => side === 'w' ? 'Presión de la bomba' : 'Voltaje de la fuente',
      format: (v, side) => side === 'w' ? Math.round(v * KPA_PER_V) + ' kPa' : fmt(v) + ' V',
      scale: side => side === 'w' ? [['0', 0], ['60', 0.5], ['120', 1]] : [['0', 0], ['6', 0.5], ['12', 1]],
      caption: side => side === 'w' ? 'presión (kPa)' : 'voltaje (V)',
      onInput: v => { st.set = v; }
    });
    b.knobs.pop();   // la escala de esta perilla la dibuja la caja del controlador

    const inercia = document.getElementById('inercia'), oIn = document.getElementById('oInercia');
    const setTau = () => { st.tau = +inercia.value; oIn.textContent = st.tau ? fmt(st.tau) + ' s' : 'sin'; };
    inercia.addEventListener('input', setTau); setTau();

    // ---------- caimanes: los medidores se conectan entre dos puntos del circuito ----------
    // El circuito son tramos de cable (o tubería) que se unen en sus puntas. Cada tramo lleva
    // { pts, I (mA en el sentido del recorrido), v0 (voltaje al inicio), comps: [{ at: [x, y], half, dV }] }:
    // en cada componente el voltaje baja dV a lo largo de su ancho; en el cable no cambia.
    // Los caimanes no se pueden poner encima de un componente ni de la fuente.
    b.loopPts = g => [[g.PX - SRC, g.BOT], [g.X0, g.BOT], [g.X0, g.TOP], [g.X1, g.TOP], [g.X1, g.BOT], [g.PX + SRC, g.BOT]];
    const project = (pts, x, y) => {
      let best = null, d0 = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], s = Math.hypot(bx - ax, by - ay);
        const t = s ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (s * s))) : 0;
        const px = ax + (bx - ax) * t, py = ay + (by - ay) * t, dist = Math.hypot(x - px, y - py);
        if (!best || dist < best.dist) best = { d: d0 + t * s, dist };
        d0 += s;
      }
      return best;
    };
    const subPath = (pts, d0, d1) => {
      const lo = Math.min(d0, d1), hi = Math.max(d0, d1), out = [D.pointAt(pts, lo)];
      let d = 0;
      for (let i = 1; i < pts.length; i++) {
        d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (d > lo && d < hi) out.push(pts[i]);
      }
      out.push(D.pointAt(pts, hi));
      return out;
    };
    const buildSegs = (g, m, V) => {
      const list = o.circuit ? o.circuit(g, m, V)
        : [{ pts: b.loopPts(g), I: m.I, v0: V, comps: [{ at: [g.PX, g.TOP], half: 46, dV: V }] }];
      list.push({ pts: [[g.PX + SRC, g.BOT], [g.PX - SRC, g.BOT]], I: m.I, v0: 0, comps: [], source: true });
      return list.map(sg => {
        const comps = (sg.comps || []).map(c => { const d = project(sg.pts, ...c.at).d; return { d0: d - c.half, d1: d + c.half, dV: c.dV }; })
          .sort((a, c) => a.d0 - c.d0);
        const v = d => comps.reduce((u, c) => u - c.dV * Math.max(0, Math.min(1, (d - c.d0) / (c.d1 - c.d0))), sg.v0);
        return { ...sg, L: D.len(sg.pts), comps, v };
      });
    };
    // Lleva un punto al lugar más cercano del circuito donde se puede poner un caimán.
    const snap = (segs, x, y) => {
      let best = null;
      segs.forEach((sg, k) => {
        if (sg.source) return;
        let { d } = project(sg.pts, x, y);
        for (const c of sg.comps) if (d > c.d0 - 8 && d < c.d1 + 8) d = d - c.d0 < c.d1 - d ? c.d0 - 8 : c.d1 + 8;
        d = Math.max(0, Math.min(sg.L, d));
        const p = D.pointAt(sg.pts, d), dist = Math.hypot(p[0] - x, p[1] - y);
        if (!best || dist < best.dist) best = { k, d, x: p[0], y: p[1], dist };
      });
      return best;
    };
    // Camino más corto por el circuito entre dos caimanes, sin pasar por la fuente.
    // Devuelve los pedazos [{ k, d0, d1 }] que forman la región entre ellos.
    const route = (segs, A, B) => {
      const key = p => Math.round(p[0]) + ',' + Math.round(p[1]);
      const ends = sg => [key(sg.pts[0]), key(sg.pts[sg.pts.length - 1])];
      const cost = sg => sg.L + (sg.source ? 1e6 : 0);
      const dijkstra = start => {
        const dist = { [start]: 0 }, prev = {}, done = new Set();
        for (;;) {
          let u = null;
          for (const n in dist) if (!done.has(n) && (u === null || dist[n] < dist[u])) u = n;
          if (u === null) return { dist, prev };
          done.add(u);
          segs.forEach((sg, k) => {
            const [e0, e1] = ends(sg);
            [[e0, e1], [e1, e0]].forEach(([from, to]) => {
              if (from !== u) return;
              const nd = dist[u] + cost(sg);
              if (dist[to] === undefined || nd < dist[to]) { dist[to] = nd; prev[to] = { k, from }; }
            });
          });
        }
      };
      const sa = segs[A.k], sb = segs[B.k];
      let best = A.k === B.k ? { c: Math.abs(A.d - B.d), pieces: [{ k: A.k, d0: A.d, d1: B.d }] } : null;
      [[0, A.d], [1, sa.L - A.d]].forEach(([ia, ca]) => {
        const start = ends(sa)[ia], { dist, prev } = dijkstra(start);
        [[0, B.d], [1, sb.L - B.d]].forEach(([ib, cb]) => {
          const end = ends(sb)[ib];
          if (dist[end] === undefined) return;
          const c = ca + dist[end] + cb;
          if (best && c >= best.c) return;
          const mid = [];
          for (let n = end; n !== start; n = prev[n].from) {
            const { k, from } = prev[n], sg = segs[k];
            mid.unshift(ends(sg)[0] === from ? { k, d0: 0, d1: sg.L } : { k, d0: sg.L, d1: 0 });
          }
          best = { c, pieces: [{ k: A.k, d0: A.d, d1: ia ? sa.L : 0 }, ...mid, { k: B.k, d0: ib ? sb.L : 0, d1: B.d }] };
        });
      });
      return best ? best.pieces.filter(p => Math.abs(p.d1 - p.d0) > 0.5) : [];
    };
    // Lectura de cada medidor. El voltímetro marca voltaje(rojo) − voltaje(negro).
    // El amperímetro marca la corriente que pasa por la región del rojo al negro; si en la región
    // la corriente no es la misma en todos lados (cruza un nodo), no hay una sola lectura.
    const measure = segs => {
      const res = {};
      for (const kind of ['V', 'I']) {
        const [A, B] = st.clamps[kind].map(([x, y]) => snap(segs, x, y));
        st.clamps[kind] = [[A.x, A.y], [B.x, B.y]];
        const pieces = route(segs, A, B);
        let value;
        if (kind === 'V') value = segs[A.k].v(A.d) - segs[B.k].v(B.d);
        else {
          const Is = pieces.map(p => segs[p.k].I * Math.sign(p.d1 - p.d0));
          value = Is.length ? Is[0] : 0;
          if (Is.some(I => Math.abs(I - value) > Math.max(0.02, 0.01 * Math.abs(value)))) value = null;
        }
        res[kind] = { value, pieces: pieces.map(p => subPath(segs[p.k].pts, p.d0, p.d1)) };
      }
      return res;
    };

    // Donde un tramo tiene voltaje pero no le pasa corriente (un LED que no enciende, un interruptor
    // abierto), las partículas vibran sin avanzar: la presión empuja pero el agua no se puede mover.
    Sim.shake = (x, y) => {
      let best = null;
      for (const sg of st.segs) {
        const p = project(sg.pts, x, y);
        if (!best || p.dist < best.dist) best = { ...p, sg };
      }
      // la vibración aparece poco a poco mientras la corriente se apaga con la inercia
      if (!best || best.dist > 30) return 0;
      const still = Math.max(0, 1 - Math.abs(best.sg.I) / 2);
      if (!still) return 0;
      const v = best.sg.source ? 0 : best.sg.v(best.d);
      return v > 0.05 ? still * (0.5 + 2.2 * v / VMAX) : 0;
    };

    st.clamps = o.clamps ? o.clamps(b.gw) : {
      V: [[b.gw.X0, b.gw.MY], [b.gw.X1, b.gw.MY]],
      I: [[b.gw.X1 - 40, b.gw.BOT], [b.gw.X1 - 110, b.gw.BOT]]
    };
    // Medidores junto al controlador (ver los acomodos); las bornes (rojo y negro) arriba de cada uno.
    const meterAt = (g, kind) => g.meters[kind];
    const jack = (g, kind, i) => { const [x, y] = meterAt(g, kind); return [x + (i ? 22 : -22) * g.MK, y - 40 * g.MK]; };

    // Cada caimán se arrastra (o se mueve con las flechas por el cable). Los dos paneles comparten
    // los caimanes, igual que la bomba y la fuente.
    const moveClamp = (kind, i, x, y) => {
      const p = snap(st.segs, x, y);
      if (!p) return;
      st.clamps[kind][i] = [p.x, p.y];
      b.pw.replace(); b.pe.replace();
    };
    ['V', 'I'].forEach(kind => [0, 1].forEach(i => ['w', 'e'].forEach(side => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'sim-clamp';
      const meter = kind === 'V' ? (side === 'w' ? 'del manómetro' : 'del voltímetro') : (side === 'w' ? 'del medidor de caudal' : 'del amperímetro');
      el.setAttribute('aria-label', `Caimán ${i ? 'negro' : 'rojo'} ${meter}: arrástralo o usa las flechas para moverlo; tócalo para mostrar u ocultar su cable`);
      b.place(side, el, () => st.clamps[kind][i]);
      const p = panel(side);
      const toDrawing = e => {
        const r = p.box.getBoundingClientRect();
        return [(e.clientX - r.left - p.ox) / p.scale, (e.clientY - r.top - p.oy) / p.scale];
      };
      // Arrastrar mueve el caimán (y siempre lo muestra con su cable y su región); tocarlo sin
      // arrastrar lo convierte en un pin pequeño para limpiar el diagrama, o lo vuelve a mostrar.
      let down = null, dragged = false;
      el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); el.focus(); down = [e.clientX, e.clientY]; dragged = false; e.preventDefault(); });
      el.addEventListener('pointermove', e => {
        if (!el.hasPointerCapture(e.pointerId)) return;
        if (!dragged && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) return;
        dragged = true; st.pinned[kind] = false;
        moveClamp(kind, i, ...toDrawing(e));
      });
      el.addEventListener('click', () => { if (!dragged) st.pinned[kind] = !st.pinned[kind]; dragged = false; });
      el.addEventListener('keydown', e => {
        const step = { ArrowUp: [0, -12], ArrowDown: [0, 12], ArrowLeft: [-12, 0], ArrowRight: [12, 0] }[e.key];
        if (!step) return;
        const [x, y] = st.clamps[kind][i];
        st.pinned[kind] = false;
        moveClamp(kind, i, x + step[0], y + step[1]);
        e.preventDefault();
      });
    })));

    // ---------- dibujo común ----------
    const controllerBox = (ctx, g, title, fill, scale, caption) => {
      if (g.mode !== 'lateral') { ctx.fillStyle = C.ink; ctx.fillRect(g.PX - 14, g.BOT + 30, 28, 18); }   // cuello hacia el circuito
      D.roundRect(ctx, g.BX, g.BY, g.BW, g.BH, 14, fill, C.ink, 2.5);
      D.text(ctx, title, g.BX + 18, g.BY + 24, C.ink, { align: 'left', size: 15 });
      D.knobScale(ctx, g.CX, g.BY + 80, 36, scale);
      D.text(ctx, caption, g.CX, g.BY + 138, C.muted, { size: 14 });
      D.led(ctx, g.BX + 108, g.BY + 92, st.v > 0.05 ? 1 : 0);   // detecta presión desde 0.5 kPa (0.05 V)
    };
    const knobScales = (ctx, g) => b.knobs.forEach(k => {
      const [x, y] = k.pos(g);
      D.knobScale(ctx, x, y, 36, k.scale(g.side), k.ticks);
      if (k.caption) D.text(ctx, k.caption(g.side), x, y + 58, C.muted, { size: 14 });
    });

    // Región entre los caimanes: una franja translúcida del color del medidor, debajo de los caimanes.
    const drawRegions = (ctx, w) => {
      ctx.globalAlpha = 0.32;
      for (const kind of ['I', 'V']) if (!st.pinned[kind]) for (const pts of st.probe[kind].pieces) D.line(ctx, pts, kind === 'V' ? w + 8 : w, PROBE[kind]);
      ctx.globalAlpha = 1;
    };
    // Cables de un medidor, de cada borne a su caimán. Se dibujan antes que el controlador y los
    // medidores, así que pasan por detrás de ellos (en el celular cruzan el controlador).
    const drawCables = (ctx, g, kind) => {
      if (st.pinned[kind]) return;
      [0, 1].forEach(i => {
        const [jx, jy] = jack(g, kind, i), [cx, cy] = st.clamps[kind][i];
        ctx.beginPath(); ctx.moveTo(jx, jy);
        if (g.mode === 'lateral') ctx.bezierCurveTo(jx, jy - 50, cx + 120, cy + 40, cx, cy + 14);
        else ctx.bezierCurveTo(jx, jy - 70, cx + (cx < g.PX ? -1 : 1) * 10, cy + 80, cx, cy + 14);
        ctx.lineCap = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = C.card; ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = i ? C.ink : RED; ctx.stroke();
      });
    };
    // Medidor con sus dos bornes y sus caimanes.
    const drawProbe = (ctx, g, kind, label, text, unit, color) => {
      const [x, y] = meterAt(g, kind), needle = kind === 'V' ? st.nVm : st.nIm;
      ctx.save(); ctx.translate(x, y); ctx.scale(g.MK, g.MK);
      D.meter(ctx, 0, 0, { r: 30, frac: needle.x, color, lcdW: 108, text, unit });
      D.text(ctx, label, 0, 92, PROBE[kind], { size: 15 });
      if (st.probe[kind].value === null) D.text(ctx, 'la región cruza un nodo', 0, 110, C.danger, { size: 12 });
      ctx.restore();
      [0, 1].forEach(i => {
        const [jx, jy] = jack(g, kind, i), [cx, cy] = st.clamps[kind][i];
        const col = i ? C.ink : RED;
        D.circle(ctx, jx, jy, 6, col, C.ink, 1.5);
        if (st.pinned[kind]) pin(ctx, cx, cy, col, kind);
        else clamp(ctx, cx, cy, col);
      });
    };
    // Pin: gota pequeña clavada en el punto, con la letra del medidor (V o A).
    const pin = (ctx, x, y, col, kind) => {
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-3, -6, -9, -10, -9, -17); ctx.arc(0, -17, 9, Math.PI, 0); ctx.bezierCurveTo(9, -10, 3, -6, 0, 0);
      ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.card; ctx.stroke();
      D.text(ctx, kind === 'V' ? 'V' : 'A', 0, -17, '#fff', { size: 11 });
      ctx.restore();
    };
    // Caimán: cuerpo con dos mandíbulas que muerden el cable en (x, y).
    const clamp = (ctx, x, y, col) => {
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-6, -7); ctx.lineTo(6, -7); ctx.lineTo(9, 0);
      ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.card; ctx.stroke();
      D.roundRect(ctx, -6, 6, 12, 14, 3, col, C.card, 1.5);
      ctx.lineWidth = 1.5; ctx.strokeStyle = C.card;
      for (const dx of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(dx, -7); ctx.lineTo(dx, -3); ctx.stroke(); }
      ctx.restore();
    };
    const probeText = (kind, scale, width, d) => {
      const v = st.probe[kind].value;
      return v === null ? ' ----' : digits(v * scale, width, d);
    };

    function drawWater() {
      const g = b.gw, m = st.m, ctx = b.pw.begin();
      o.drawW(ctx, g, m);
      drawRegions(ctx, 2 * Sim.PIPE + 22);
      knobScales(ctx, g);
      D.speedLegend(ctx, ...g.LEG);
      drawCables(ctx, g, 'I'); drawCables(ctx, g, 'V');
      controllerBox(ctx, g, 'BOMBA', C.metal, [['0', 0], ['60', 0.5], ['120', 1]], 'presión (kPa)');
      D.meter(ctx, g.BX + g.BW - 70, g.BY + 52, { r: 30, frac: st.nS.x, color: C.water, lcdW: 104,
        text: digits(st.rpm, 4, 0), unit: 'rpm' });
      D.pump(ctx, g.PX, g.BOT, st.rotor, st.omega);
      drawProbe(ctx, g, 'I', 'caudal',
        probeText('I', MLS_PER_MA, 3, 1), 'mL/s', C.water);
      drawProbe(ctx, g, 'V', 'presión', probeText('V', KPA_PER_V, 3, 1), 'kPa', C.water);
    }
    function drawElectric() {
      const g = b.ge, m = st.m, ctx = b.pe.begin();
      o.drawE(ctx, g, m);
      drawRegions(ctx, 22);
      knobScales(ctx, g);
      drawCables(ctx, g, 'I'); drawCables(ctx, g, 'V');
      controllerBox(ctx, g, 'FUENTE', C['charge-soft'], [['0', 0], ['6', 0.5], ['12', 1]], 'voltaje (V)');
      D.meter(ctx, g.BX + g.BW - 70, g.BY + 52, { r: 30, frac: st.nV.x, color: C.charge, lcdW: 104,
        text: digits(st.v, 2, 2), unit: 'V' });
      D.source(ctx, g.PX, g.BOT);
      drawProbe(ctx, g, 'I', 'amperímetro',
        probeText('I', 1, 2, 2), 'mA', C.charge);
      drawProbe(ctx, g, 'V', 'voltímetro', probeText('V', 1, 2, 2), 'V', C.charge);
    }

    // ---------- animación ----------
    // La inercia es el tiempo que tarda todo en arrancar o detenerse por completo.
    // También los cambios bruscos del circuito (abrir una válvula, romper o cambiar una rueda, pasar a
    // paralelo): la corriente va de su valor anterior al nuevo en el tiempo de la inercia, con curva suave.
    // Los cambios por la perilla o el encendido ya vienen suaves por el voltaje y pasan sin más.
    const flat = m => [m.I, ...(m.branch || [])];
    const smooth = { raw: null, vPrev: 0, off: null, from: null, t: 0 };
    const inertia = V => {
      const m = o.model(V), now = flat(m);
      if (smooth.raw) {
        const before = flat(o.model(smooth.vPrev));   // el circuito de ahora con el voltaje de antes
        if (before.length !== smooth.raw.length || before.some((x, k) => Math.abs(x - smooth.raw[k]) > 1e-6)) {
          // hubo un cambio en el circuito: arranca desde lo que se veía
          const shown = smooth.raw.map((x, k) => x + (smooth.off ? smooth.off[k] || 0 : 0));
          smooth.from = now.map((x, k) => (shown[k] ?? shown[0]) - x);
          smooth.t = 0;
        }
      }
      smooth.raw = now; smooth.vPrev = V;
      if (smooth.from) {
        const u = st.tau > 0 ? Math.min(1, smooth.t / st.tau) : 1;
        const k = 1 - u * u * (3 - 2 * u);
        smooth.off = smooth.from.map(x => x * k);
        if (u >= 1) smooth.from = smooth.off = null;
      }
      if (!smooth.off) return m;
      const out = { ...m, I: Math.max(0, m.I + smooth.off[0]) };
      if (m.branch) out.branch = m.branch.map((x, k) => Math.max(0, x + smooth.off[k + 1]));
      return out;
    };
    b.start = () => Sim.run(dt => {
      st.v = st.level.step(st.on ? st.set : 0, st.tau, dt);
      smooth.t += dt;
      st.m = inertia(st.v);
      const tn = Math.min(0.15, st.tau * 0.15);                    // las agujas apenas se atrasan
      st.nV.step(st.v / VMAX, tn, dt);
      st.segs = buildSegs(b.gw, st.m, st.v);
      const before = JSON.stringify(st.clamps);
      st.probe = measure(st.segs);
      if (JSON.stringify(st.clamps) !== before) { b.pw.replace(); b.pe.replace(); }
      st.nVm.step(st.probe.V.value / VMAX, tn, dt);
      st.nIm.step((st.probe.I.value || 0) / iFull, tn, dt);
      st.rpm = st.m.I * RPM_PER_MA;                                // 10 rpm por cada mL/s
      st.nS.step(st.rpm / (iFull * RPM_PER_MA), tn, dt);
      st.omega = -st.rpm / 60 * 2 * Math.PI;                       // rad/s, a la velocidad real
      st.rotor += st.omega * dt;
      o.step && o.step(dt, st.m);
      drawWater(); drawElectric();
    });
    return b;
  };
})();
