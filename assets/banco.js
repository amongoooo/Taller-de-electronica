// Banco común de las simulaciones de agua y electricidad: dos paneles con el mismo circuito,
// bomba y fuente enlazadas (botón, LED, perilla y medidor), manómetro/voltímetro y caudal/amperímetro
// abajo junto al controlador: el voltímetro con dos puntas (mangueras en el agua) entre dos puntos del
// circuito y el amperímetro con una pinza (turbinita en el agua) en un punto, con cables que cuelgan,
// e inercia. Cada página solo agrega su parte del circuito.
//
// Sim.bench({
//   iFull,            mA a escala completa en los medidores de corriente y caudal
//   flowSpeed,        rapidez de las partículas en la tubería normal, por cada mA
//   v0,               voltaje inicial de la perilla
//   layout(g),        se llama cuando cambia el tamaño de un panel (g.side es 'w' o 'e')
//   model(V),         devuelve { I } (mA totales) y lo que la página necesite para dibujar
//   circuit(g, m, V), tramos del circuito sin contar la fuente, para las puntas (ver más abajo);
//                     si falta, es una sola vuelta con todo el voltaje en el centro de arriba
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
      rpm: 0, omega: 0, rotor: 0, nV: Sim.needle(), nS: Sim.needle(), nVm: Sim.needle(), nIm: Sim.needle(), nPa: Sim.needle(), nPb: Sim.needle(), turb: 0,
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

    // Una resistencia que se ajusta pellizcando: agarrando el borde del tramo angosto (o las marcas de
    // la resistencia) con un dedo o el ratón el borde sigue al puntero; con dos dedos, el ancho es la
    // separación entre ellos. Más angosto = más resistencia. half(R) da el medio ancho del tramo y
    // fromHalf(h) la resistencia para un medio ancho; set(R) la cambia. Devuelve { drag } para
    // saber si se está agarrando (las marcas se pintan de azul).
    b.pinch = ({ pos, get, set, half, fromHalf, label, text }) => {
      const pr = { drag: false };
      // flechas y rueda: un poco más ancho o angosto (lo que haga falta para que cambie el valor)
      const nudge = f => {
        for (let k = 1; k <= 8; k++) { const R = fromHalf(half(get()) + f * k); if (R !== get()) return set(R); }
      };
      ['w', 'e'].forEach(side => {
        const el = document.createElement('div');
        el.className = 'sim-pinch'; el.tabIndex = 0; el.setAttribute('role', 'slider');
        el.setAttribute('aria-label', label(side));
        b.place(side, el, pos);
        const p = panel(side), pts = new Map();
        const toY = e => (e.clientY - p.box.getBoundingClientRect().top - p.oy) / p.scale;
        const update = () => {
          const ys = [...pts.values()];
          const h = ys.length > 1 ? Math.abs(ys[0] - ys[1]) / 2 - 9 : Math.abs(ys[0] - pos(geo(side))[1]) - 14;
          set(fromHalf(h));
        };
        el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, toY(e)); pr.drag = true; update(); e.preventDefault(); });
        el.addEventListener('pointermove', e => { if (pts.has(e.pointerId)) { pts.set(e.pointerId, toY(e)); update(); } });
        const up = e => { pts.delete(e.pointerId); if (!pts.size) pr.drag = false; };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
        el.addEventListener('wheel', e => { e.preventDefault(); nudge(e.deltaY < 0 ? -1 : 1); }, { passive: false });
        el.addEventListener('keydown', e => {
          const f = { ArrowUp: -1, ArrowRight: -1, ArrowDown: 1, ArrowLeft: 1 }[e.key];
          if (f) { nudge(f); e.preventDefault(); }
        });
        setInterval(() => el.setAttribute('aria-valuetext', text(get())), 500);
      });
      return pr;
    };
    // Marcas arriba y abajo del tramo (o de la resistencia), a la distancia del borde h.
    b.grips = (ctx, x, y, h, active) => {
      const col = active ? C.water : C.muted;
      for (const sgn of [-1, 1]) {
        const yy = y + sgn * (h + 9);
        D.roundRect(ctx, x - 16, yy - 3, 32, 6, 3, col);
        D.arrow(ctx, x + 24, yy, sgn * Math.PI / 2, 5, col);
      }
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

    // ---------- puntas: los medidores se conectan al circuito ----------
    // El circuito son tramos de cable (o tubería) que se unen en sus puntas. Cada tramo lleva
    // { pts, I (mA en el sentido del recorrido), v0 (voltaje al inicio), comps: [{ at: [x, y], half, dV }] }:
    // en cada componente el voltaje baja dV a lo largo de su ancho; en el cable no cambia.
    // Las puntas no se pueden poner encima de un componente ni de la fuente.
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
    // Lleva un punto al lugar más cercano del circuito donde se puede poner una punta.
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
    // Lectura de cada medidor. El voltímetro (o manómetro) marca voltaje(rojo) − voltaje(negro) y
    // guarda el voltaje de cada punta para las columnas de agua. El amperímetro es una pinza (o una
    // turbinita en la tubería) en un solo punto: marca la corriente que pasa por ahí.
    const measure = segs => {
      const [A, B] = st.clamps.V.map(([x, y]) => snap(segs, x, y)), [P] = st.clamps.I.map(([x, y]) => snap(segs, x, y));
      st.clamps.V = [[A.x, A.y], [B.x, B.y]]; st.clamps.I = [[P.x, P.y]];
      const va = segs[A.k].v(A.d), vb = segs[B.k].v(B.d);
      return {
        V: { value: va - vb, va, vb },
        I: { value: Math.abs(segs[P.k].I) }
      };
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

    st.clamps = {
      V: [[b.gw.X0, b.gw.MY], [b.gw.X1, b.gw.MY]],
      I: [[b.gw.X1 - 60, b.gw.BOT]]
    };
    const syncs = [];   // muestran u ocultan los botones de las puntas
    // Cuántas puntas lleva cada medidor: el voltímetro dos (roja y negra), el amperímetro una pinza.
    const NP = { V: 2, I: 1 };
    // placed: qué puntas están puestas en el circuito (al tocar el medidor se quitan hasta ponerlas de nuevo).
    st.placed = { V: [true, true], I: [true] };
    const ready = kind => st.placed[kind].every(Boolean);
    // Medidores junto al controlador (ver los acomodos); los bornes arriba de cada uno.
    const meterAt = (g, kind) => g.meters[kind];
    const jack = (g, kind, i) => {
      const [x, y] = meterAt(g, kind);
      return [x + (NP[kind] === 1 ? 0 : i ? 22 : -22) * g.MK, y - 40 * g.MK];
    };
    const jackColor = (kind, i) => kind === 'I' ? PROBE.I : i ? C.ink : RED;

    // Cada punta toca el circuito de forma perpendicular, del lado que mira hacia su medidor.
    // Devuelve el punto de contacto y la dirección n hacia afuera del cable.
    const frame = (g, kind, i) => {
      const [x, y] = st.clamps[kind][i];
      let n = [0, 1];
      const p = st.segs.length && snap(st.segs, x, y);
      if (p) {
        const pts = st.segs[p.k].pts, L = st.segs[p.k].L;
        const a = D.pointAt(pts, Math.max(0, p.d - 3)), c = D.pointAt(pts, Math.min(L, p.d + 3));
        const tx = c[0] - a[0], ty = c[1] - a[1], s = Math.hypot(tx, ty) || 1;
        n = [-ty / s, tx / s];
        const [jx, jy] = jack(g, kind, i);
        if (n[0] * (jx - x) + n[1] * (jy - y) < 0) n = [-n[0], -n[1]];
      }
      return { x, y, n };
    };
    // Largo de cada punta, del contacto a donde sale su cable o manguera.
    const tipLen = (side, kind) => kind === 'I' ? (side === 'w' ? Sim.PIPE + 12 : 30) : (side === 'w' ? Sim.PIPE + 10 : 46);

    // Cables y mangueras con inercia: una cadena de puntos que va del final de la punta (sale recto)
    // al borne del medidor y se arrastra como sobre una mesa: no cuelga, el roce la frena y solo se
    // mueve donde la jalan. Se puede agarrar del cuerpo para acomodarlo; si hace falta, sale más
    // cable del medidor, y se queda donde se dejó.
    const NR = 24, ropes = { w: {}, e: {} };
    let held = null;   // punto del cable que se está arrastrando: { key, k, x, y }
    const ropeStep = (side, g, kind, i, dt) => {
      const key = kind + i;
      if (!st.placed[kind][i]) { delete ropes[side][key]; return; }
      const f = frame(g, kind, i), L = tipLen(side, kind);
      const A = [f.x + f.n[0] * L, f.y + f.n[1] * L], A2 = [A[0] + f.n[0] * 16, A[1] + f.n[1] * 16];
      const B = jack(g, kind, i), span = Math.hypot(B[0] - A2[0], B[1] - A2[1]);
      let r = ropes[side][key];
      if (!r) {   // recién puesta: el cable sale del borne en línea recta
        r = ropes[side][key] = [];
        for (let k = 0; k < NR; k++) {
          const u = k / (NR - 1), x = A2[0] + (B[0] - A2[0]) * u, y = A2[1] + (B[1] - A2[1]) * u;
          r.push({ x, y, px: x, py: y });
        }
        r.len = span * 1.1 + 24;
      }
      const hk = held && held.key === key ? held.k : -1;
      if (hk > 0) r.len = Math.max(r.len, (Math.hypot(held.x - A2[0], held.y - A2[1]) + Math.hypot(B[0] - held.x, B[1] - held.y)) * 1.04);
      r.len = Math.max(r.len, span * 1.04 + 12);
      const rest = r.len / (NR - 1);
      const fr = Math.pow(0.02, Math.min(dt, 1 / 30));   // roce: casi toda la velocidad se pierde en un instante
      for (const q of r) {
        const vx = (q.x - q.px) * fr, vy = (q.y - q.py) * fr;
        q.px = q.x; q.py = q.y; q.x += vx; q.y += vy;
      }
      const fixed = k => k === 0 || k === NR - 1 || k === hk;
      for (let it = 0; it < 30; it++) {
        r[0].x = A2[0]; r[0].y = A2[1]; r[NR - 1].x = B[0]; r[NR - 1].y = B[1];
        if (hk > 0) { r[hk].x = held.x; r[hk].y = held.y; }
        for (let k = 1; k < NR; k++) {
          const a = r[k - 1], c = r[k], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d <= rest) continue;   // se dobla pero no se estira
          const wa = fixed(k - 1) ? 0 : 1, wc = fixed(k) ? 0 : 1;
          if (!wa && !wc) continue;
          const e = (d - rest) / d / (wa + wc);
          a.x += dx * e * wa; a.y += dy * e * wa;
          c.x -= dx * e * wc; c.y -= dy * e * wc;
        }
      }
      r.A = A;
    };
    // Agarrar un cable del cuerpo: el punto más cercano sigue al puntero (en los dos paneles).
    const nearRope = (side, x, y) => {
      let best = null;
      for (const key in ropes[side]) {
        if (st.pinned[key[0]]) continue;
        ropes[side][key].forEach((q, k) => {
          if (k < 2 || k > NR - 2) return;
          const d = Math.hypot(q.x - x, q.y - y);
          if (d < 16 && (!best || d < best.d)) best = { key, k, d };
        });
      }
      return best;
    };
    [['w', b.pw], ['e', b.pe]].forEach(([side, p]) => {
      const toDrawing = e => {
        const r = p.box.getBoundingClientRect();
        return [(e.clientX - r.left - p.ox) / p.scale, (e.clientY - r.top - p.oy) / p.scale];
      };
      p.canvas.addEventListener('pointerdown', e => {
        if (st.placing) return;
        const [x, y] = toDrawing(e), n = nearRope(side, x, y);
        if (!n) return;
        held = { key: n.key, k: n.k, x, y };
        p.canvas.setPointerCapture(e.pointerId); p.canvas.style.cursor = 'grabbing'; e.preventDefault();
      });
      p.canvas.addEventListener('pointermove', e => {
        const [x, y] = toDrawing(e);
        if (held && p.canvas.hasPointerCapture(e.pointerId)) { held.x = x; held.y = y; return; }
        if (!st.placing) p.canvas.style.cursor = nearRope(side, x, y) ? 'grab' : '';
      });
      const up = () => { held = null; p.canvas.style.cursor = ''; };
      p.canvas.addEventListener('pointerup', up); p.canvas.addEventListener('pointercancel', up);
    });
    const ropePath = (ctx, r) => {
      ctx.beginPath(); ctx.moveTo(r.A[0], r.A[1]); ctx.lineTo(r[0].x, r[0].y);
      for (let k = 1; k < NR - 1; k++) ctx.quadraticCurveTo(r[k].x, r[k].y, (r[k].x + r[k + 1].x) / 2, (r[k].y + r[k + 1].y) / 2);
      ctx.lineTo(r[NR - 1].x, r[NR - 1].y);
    };

    // Cada punta se arrastra (o se mueve con las flechas por el cable). Los dos paneles comparten
    // las puntas, igual que la bomba y la fuente.
    const moveClamp = (kind, i, x, y) => {
      const p = snap(st.segs, x, y);
      if (!p) return;
      st.clamps[kind][i] = [p.x, p.y];
      b.pw.replace(); b.pe.replace();
    };
    const tipName = (kind, i, side) => kind === 'I'
      ? (side === 'w' ? 'Turbinita del medidor de caudal' : 'Pinza del amperímetro')
      : `${side === 'w' ? 'Manguera' : 'Punta'} ${i ? 'negra' : 'roja'} ${side === 'w' ? 'del manómetro' : 'del voltímetro'}`;
    ['V', 'I'].forEach(kind => [0, 1].slice(0, NP[kind]).forEach(i => ['w', 'e'].forEach(side => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'sim-clamp';
      el.setAttribute('aria-label', `${tipName(kind, i, side)}: arrástrala o usa las flechas para moverla; tócala para mostrar u ocultar su cable`);
      b.place(side, el, g => {
        const f = frame(g, kind, i), L = kind === 'I' || st.pinned[kind] ? 0 : tipLen(side, kind) * 0.55;
        return [f.x + f.n[0] * L, f.y + f.n[1] * L];
      });
      const p = panel(side);
      const toDrawing = e => {
        const r = p.box.getBoundingClientRect();
        return [(e.clientX - r.left - p.ox) / p.scale, (e.clientY - r.top - p.oy) / p.scale];
      };
      // Arrastrar mueve la punta (y siempre la muestra con su cable y su región); tocarla sin
      // arrastrar la convierte en un pin pequeño para limpiar el diagrama, o la vuelve a mostrar.
      let down = null, dragged = false, grab = [0, 0];
      el.addEventListener('pointerdown', e => {
        el.setPointerCapture(e.pointerId); el.focus(); down = [e.clientX, e.clientY]; dragged = false; e.preventDefault();
        const [x, y] = toDrawing(e), [cx, cy] = st.clamps[kind][i];
        grab = [cx - x, cy - y];   // se agarra del cuerpo pero se mueve el contacto
      });
      el.addEventListener('pointermove', e => {
        if (!el.hasPointerCapture(e.pointerId)) return;
        if (!dragged && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) return;
        dragged = true; st.pinned[kind] = false;
        const [x, y] = toDrawing(e);
        moveClamp(kind, i, x + grab[0], y + grab[1]);
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
      const sync = () => { el.hidden = !st.placed[kind][i]; };
      syncs.push(sync); sync();
    })));

    // Tocar un medidor quita sus puntas del circuito y lo prepara para conectarse: el siguiente toque
    // pone la punta roja (+) y el siguiente la negra (−); el amperímetro solo necesita un toque para su
    // pinza. Tocar el medidor otra vez o Esc cancela y las puntas regresan a donde estaban.
    st.placing = null;
    const setPlacing = v => {
      if (!v && st.placing) st.placed[st.placing.kind] = st.placed[st.placing.kind].map(() => true);
      if (v && v.i === 0) st.placed[v.kind] = st.placed[v.kind].map(() => false);
      st.placing = v;
      [b.pw, b.pe].forEach(p => p.box.classList.toggle('placing', !!v));
      syncs.forEach(f => f());
    };
    ['V', 'I'].forEach(kind => ['w', 'e'].forEach(side => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'sim-meter-hit';
      const name = kind === 'V' ? (side === 'w' ? 'el manómetro' : 'el voltímetro') : (side === 'w' ? 'el medidor de caudal' : 'el amperímetro');
      el.setAttribute('aria-label', kind === 'V'
        ? `Conectar ${name}: luego toca el circuito para la ${side === 'w' ? 'manguera' : 'punta'} roja (+) y después para la negra (−)`
        : `Conectar ${name}: luego toca el circuito para poner ${side === 'w' ? 'la turbinita' : 'la pinza'}`);
      b.place(side, el, g => { const [x, y] = meterAt(g, kind); return [x, y + 18 * g.MK]; });
      el.addEventListener('click', () => setPlacing(st.placing && st.placing.kind === kind ? null : { kind, i: 0 }));
    }));
    let swallow = false;
    [b.pw, b.pe].forEach(p => {
      p.box.addEventListener('pointerdown', e => {
        if (!st.placing || e.target.closest('.sim-meter-hit')) return;
        const r = p.box.getBoundingClientRect();
        const { kind, i } = st.placing;
        st.pinned[kind] = false;
        moveClamp(kind, i, (e.clientX - r.left - p.ox) / p.scale, (e.clientY - r.top - p.oy) / p.scale);
        st.placed[kind][i] = true;
        if (i + 1 < NP[kind]) { st.placing = { kind, i: i + 1 }; syncs.forEach(f => f()); }
        else setPlacing(null);
        swallow = true; e.preventDefault(); e.stopPropagation();
      }, true);
      p.box.addEventListener('click', e => { if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); } }, true);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.placing) setPlacing(null); });

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

    // Cables (o mangueras con agua) de un medidor. Se dibujan antes que el controlador y los
    // medidores, así que pasan por detrás de ellos.
    const drawCables = (ctx, g, kind) => {
      if (st.pinned[kind]) return;
      const side = g.side;
      for (let i = 0; i < NP[kind]; i++) {
        const r = ropes[side][kind + i];
        if (!r || !st.placed[kind][i]) continue;
        ropePath(ctx, r);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (side === 'w' && kind === 'V') {   // manguera translúcida del color de su borne, con agua adentro
          ctx.lineWidth = 12; ctx.strokeStyle = C.card; ctx.stroke();
          ctx.globalAlpha = 0.55; ctx.lineWidth = 10; ctx.strokeStyle = jackColor(kind, i); ctx.stroke(); ctx.globalAlpha = 1;
          ctx.lineWidth = 4.5; ctx.strokeStyle = C.water; ctx.stroke();
        } else {
          ctx.lineWidth = 6; ctx.strokeStyle = C.card; ctx.stroke();
          ctx.lineWidth = 3; ctx.strokeStyle = jackColor(kind, i); ctx.stroke();
        }
      }
    };
    // Las puntas de cada medidor en el circuito (o pins pequeños si se ocultaron).
    const drawTips = (ctx, g, kind) => {
      for (let i = 0; i < NP[kind]; i++) {
        if (!st.placed[kind][i]) continue;
        const f = frame(g, kind, i), col = jackColor(kind, i);
        if (st.pinned[kind]) { pin(ctx, f.x, f.y, col, kind); continue; }
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.atan2(f.n[1], f.n[0]));
        if (kind === 'V') (g.side === 'w' ? hoseTip : pen)(ctx, col);
        else (g.side === 'w' ? turbine : clampOn)(ctx);
        ctx.restore();
      }
    };
    // Punta de multímetro a lo largo de +x, con la punta metálica tocando el cable en el origen.
    const pen = (ctx, col) => {
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(12, -2.5); ctx.lineTo(12, 2.5); ctx.closePath();
      ctx.fillStyle = '#9aa6af'; ctx.fill();
      D.roundRect(ctx, 12, -4, 6, 8, 1.5, C.ink);
      D.roundRect(ctx, 17, -7, 8, 14, 2, col, C.ink, 1.5);                  // guarda para los dedos
      D.roundRect(ctx, 24, -5.5, 18, 11, 3, col, C.ink, 1.5);
      D.roundRect(ctx, 41, -3.5, 6, 7, 1.5, C.ink);
    };
    // Conector de la manguera en la pared del tubo.
    const hoseTip = (ctx, col) => {
      const P = Sim.PIPE;
      D.roundRect(ctx, P + 2, -7, 10, 14, 2.5, '#9aa6af', col, 2.5);
      D.line(ctx, [[P + 2, 0], [P + 12, 0]], 4, C.water);
    };
    // Pinza del amperímetro: abraza el cable sin cortarlo.
    const clampOn = ctx => {
      ctx.lineWidth = 5; ctx.strokeStyle = PROBE.I; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, 11, 0.35, 2 * Math.PI - 0.35); ctx.stroke();
      D.roundRect(ctx, 11, -5, 20, 10, 3, C.ink);
    };
    // Turbinita dentro de la tubería; gira con el agua que pasa por ese punto.
    const turbine = ctx => {
      const P = Sim.PIPE, w = Math.min(st.probe.I.value, 60) * 0.5;
      D.circle(ctx, 0, 0, P - 2, null, PROBE.I, 2);
      D.rotor(ctx, 0, 0, P - 4, st.turb, w, 4, PROBE.I);
      D.circle(ctx, 0, 0, 3, PROBE.I);
      D.roundRect(ctx, P, -5, 12, 10, 2.5, C.ink);
    };
    // Medidor con sus bornes.
    const drawProbe = (ctx, g, kind, label, text, unit, color) => {
      const [x, y] = meterAt(g, kind), needle = kind === 'V' ? st.nVm : st.nIm;
      ctx.save(); ctx.translate(x, y); ctx.scale(g.MK, g.MK);
      const placing = st.placing && st.placing.kind === kind;
      if (placing) {   // borde del color del medidor mientras espera dónde conectarse
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
        ctx.globalAlpha = 0.35 + 0.4 * pulse;
        D.roundRect(ctx, -66, -46, 132, 126, 14, null, PROBE[kind], 6);
        ctx.globalAlpha = 1;
      }
      if (kind === 'V' && g.side === 'w') columns(ctx, text, unit);
      else D.meter(ctx, 0, 0, { r: 30, frac: needle.x, color, lcdW: 108, text, unit });
      if (placing) {
        const water = g.side === 'w';
        D.text(ctx, 'toca el circuito para', 0, 92, PROBE[kind], { size: 12 });
        if (kind === 'I') D.text(ctx, water ? 'poner la turbinita' : 'poner la pinza', 0, 108, PROBE.I, { size: 13 });
        else D.text(ctx, `la ${water ? 'manguera' : 'punta'} ${st.placing.i ? 'negra (−)' : 'roja (+)'}`, 0, 108, st.placing.i ? C.ink : RED, { size: 13 });
      } else D.text(ctx, label, 0, 92, PROBE[kind], { size: 15 });
      ctx.restore();
      for (let i = 0; i < NP[kind]; i++) {
        const [jx, jy] = jack(g, kind, i);
        D.circle(ctx, jx, jy, 6, jackColor(kind, i), C.ink, 1.5);
      }
    };
    // Manómetro de dos columnas: cada manguera llena la suya según la presión en su punto; la
    // diferencia de alturas es lo que marca.
    const columns = (ctx, text, unit) => {
      D.roundRect(ctx, -62, -40, 124, 116, 10, C.metal, C.ink, 2);
      const top = -26, h = 62;
      [[-22, st.nPa.x, RED], [22, st.nPb.x, C.ink]].forEach(([cx, f, col]) => {
        D.roundRect(ctx, cx - 10, top, 20, h, 5, C.card, col, 2);
        const lv = Math.max(0, Math.min(1, f)) * (h - 4);
        if (lv > 0.5) D.roundRect(ctx, cx - 8, top + h - 2 - lv, 16, lv, 3, C.water);
      });
      const ya = top + h - 2 - Math.max(0, Math.min(1, st.nPa.x)) * (h - 4), yb = top + h - 2 - Math.max(0, Math.min(1, st.nPb.x)) * (h - 4);
      if (ready('V') && Math.abs(ya - yb) > 2) {
        D.line(ctx, [[-12, ya], [12, ya]], 1.5, PROBE.V); D.line(ctx, [[-12, yb], [12, yb]], 1.5, PROBE.V);
        D.line(ctx, [[0, ya], [0, yb]], 2, PROBE.V);
      }
      D.lcd(ctx, 0, 54, 108, 30, text, unit);
    };
    // Pin: gota pequeña clavada en el punto: + o − en las puntas del voltímetro, A en la pinza.
    const pin = (ctx, x, y, col, kind) => {
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-3, -6, -9, -10, -9, -17); ctx.arc(0, -17, 9, Math.PI, 0); ctx.bezierCurveTo(9, -10, 3, -6, 0, 0);
      ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.card; ctx.stroke();
      D.text(ctx, kind === 'I' ? 'A' : col === RED ? '+' : '−', 0, -17, '#fff', { size: 13 });
      ctx.restore();
    };
    const probeText = (kind, scale, width, d) => ready(kind) ? digits(st.probe[kind].value * scale, width, d) : ' ----';

    function drawWater() {
      const g = b.gw, m = st.m, ctx = b.pw.begin();
      o.drawW(ctx, g, m);
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
      drawTips(ctx, g, 'I'); drawTips(ctx, g, 'V');
    }
    function drawElectric() {
      const g = b.ge, m = st.m, ctx = b.pe.begin();
      o.drawE(ctx, g, m);
      knobScales(ctx, g);
      drawCables(ctx, g, 'I'); drawCables(ctx, g, 'V');
      controllerBox(ctx, g, 'FUENTE', C['charge-soft'], [['0', 0], ['6', 0.5], ['12', 1]], 'voltaje (V)');
      D.meter(ctx, g.BX + g.BW - 70, g.BY + 52, { r: 30, frac: st.nV.x, color: C.charge, lcdW: 104,
        text: digits(st.v, 2, 2), unit: 'V' });
      D.source(ctx, g.PX, g.BOT);
      drawProbe(ctx, g, 'I', 'amperímetro',
        probeText('I', 1, 2, 2), 'mA', C.charge);
      drawProbe(ctx, g, 'V', 'voltímetro', probeText('V', 1, 2, 2), 'V', C.charge);
      drawTips(ctx, g, 'I'); drawTips(ctx, g, 'V');
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
      st.nVm.step(ready('V') ? st.probe.V.value / VMAX : 0, tn, dt);
      st.nIm.step(ready('I') ? st.probe.I.value / iFull : 0, tn, dt);
      st.nPa.step(st.placed.V[0] ? st.probe.V.va / VMAX : 0, tn, dt);
      st.nPb.step(st.placed.V[1] ? st.probe.V.vb / VMAX : 0, tn, dt);
      st.turb += Math.min(st.probe.I.value, 60) * 0.5 * dt;
      for (const [side, g] of [['w', b.gw], ['e', b.ge]]) for (const kind of ['V', 'I']) for (let i = 0; i < NP[kind]; i++) ropeStep(side, g, kind, i, dt);
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
