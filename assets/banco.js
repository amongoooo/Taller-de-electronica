// Banco común de las simulaciones de agua y electricidad: dos paneles con el mismo circuito,
// bomba y fuente enlazadas (interruptor, LED, perilla con su pantallita y medidor), manómetro/voltímetro y caudal/amperímetro
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
//   stateful,         true si la corriente cambia sola con el tiempo (un capacitor que se carga):
//                     esos cambios ya vienen suaves y no se toman como cambios del circuito
//   drawW(ctx, g, m), drawE(ctx, g, m)   dibujan el circuito de cada lado
// })
// b.showMeters({ V, I }) muestra u oculta cada medidor con sus puntas (para las páginas que van por pasos).
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
      segs: [], probe: { V: null, I: null }, pinned: { V: false, I: false }, show: { V: true, I: true } };
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
    // Switch arriba: agua o electricidad, o ambos (se recuerda en este navegador).
    const bar = document.querySelector('.sim-bar');
    Sim.viewSwitch();

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
    // Interruptor ON/OFF a la izquierda, con su LED; la perilla con su pantallita arriba (lo que marca la
    // perilla) y a la derecha el medidor de lo que en verdad sale (sube y baja con la inercia).
    const power = b.linkedButton({
      pos: g => [g.BX + 52, g.BY + 97], cls: 'sim-power',
      label: side => (st.on ? 'Apagar ' : 'Encender ') + (side === 'w' ? 'la bomba' : 'la fuente'),
      onClick: () => { st.on = !st.on; }
    });
    power.forEach(el => { el.innerHTML = Sim.SWITCH; });
    const syncPower = () => power.forEach(el => el.setAttribute('aria-pressed', String(st.on)));
    power.forEach(el => el.addEventListener('click', syncPower)); syncPower();
    b.linkedKnob({
      pos: g => [g.CX, g.BY + 100], min: 0, max: VMAX, step: 0.5, value: st.set,
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
      const segs = list.map(sg => {
        const comps = (sg.comps || []).map(c => { const d = project(sg.pts, ...c.at).d; return { d0: d - c.half, d1: d + c.half, dV: c.dV }; })
          .sort((a, c) => a.d0 - c.d0);
        const v = d => comps.reduce((u, c) => u - c.dV * Math.max(0, Math.min(1, (d - c.d0) / (c.d1 - c.d0))), sg.v0);
        return { ...sg, L: D.len(sg.pts), comps, v };
      });
      // Esquinas: puntos donde los tramos que llegan no siguen en línea recta. dir apunta hacia
      // adentro de la esquina (entre los brazos).
      const arms = new Map();
      segs.forEach(sg => sg.pts.forEach((pt, k) => {
        const key = Math.round(pt[0]) + ',' + Math.round(pt[1]);
        if (!arms.has(key)) arms.set(key, { x: pt[0], y: pt[1], u: [] });
        for (const j of [k - 1, k + 1]) {
          const q = sg.pts[j];
          if (!q) continue;
          const dx = q[0] - pt[0], dy = q[1] - pt[1], l = Math.hypot(dx, dy);
          if (l) arms.get(key).u.push([dx / l, dy / l]);
        }
      }));
      segs.corners = [];
      arms.forEach(c => {
        if (c.u.length < 2) return;
        const sx = c.u.reduce((a, u) => a + u[0], 0), sy = c.u.reduce((a, u) => a + u[1], 0), l = Math.hypot(sx, sy);
        if (l > 0.2) segs.corners.push({ x: c.x, y: c.y, dir: [sx / l, sy / l] });
      });
      return segs;
    };
    // Lleva un punto al lugar más cercano del circuito donde se puede poner una punta. Con corners,
    // cerca de una esquina (por fuera o por dentro) la punta se pega a la esquina.
    const snap = (segs, x, y, corners) => {
      let best = null, cn = null;
      if (corners) for (const c of segs.corners || []) if (Math.hypot(c.x - x, c.y - y) < 36 && (!cn || Math.hypot(c.x - x, c.y - y) < Math.hypot(cn.x - x, cn.y - y))) cn = c;
      segs.forEach((sg, k) => {
        if (sg.source) return;
        let { d } = project(sg.pts, x, y);
        if (cn) { const q = project(sg.pts, cn.x, cn.y); if (q.dist < 0.5) d = q.d; }
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
    // Al arrastrar una punta se levanta del circuito y deja de medir. Cerca de una línea un imán la
    // jala hacia ella: si se suelta ahí cae y se conecta; si se suelta lejos se queda en el suelo.
    //   lift:  mientras se arrastra, { x, y, n } (dónde va su contacto y su última orientación)
    //   floor: { x, y, n } donde quedó en el suelo
    //   drop:  { from, t } mientras cae a su lugar en el circuito
    //   click: segundos desde que se conectó (un anillo que se expande)
    const per = v => ({ V: [v, v], I: [v] });
    st.lift = per(null); st.floor = per(null); st.drop = per(null); st.click = per(9);
    const MAG = 60, DROP = 0.16, MORPH = 0.35, REEL = 0.9;
    const ease = u => u * u * (3 - 2 * u);
    // Recoger: reel va de 0 a 1 mientras una punta que quedó en el suelo entra a su medidor.
    st.reel = per(0);
    const connected = (kind, i) => st.placed[kind][i] && !st.lift[kind][i] && !st.floor[kind][i] && !st.drop[kind][i] && !st.reel[kind][i];
    const ready = kind => st.placed[kind].every((_, i) => connected(kind, i));
    // Medidores junto al controlador (ver los acomodos); los bornes arriba de cada uno.
    const meterAt = (g, kind) => g.meters[kind];
    const jack = (g, kind, i) => {
      const [x, y] = meterAt(g, kind);
      return [x + (NP[kind] === 1 ? 0 : i ? 22 : -22) * g.MK, y - 40 * g.MK];
    };
    const jackColor = (kind, i) => kind === 'I' ? PROBE.I : i ? C.ink : RED;

    // Cada punta toca el circuito de forma perpendicular, del lado donde estaba el puntero al ponerla o
    // arrastrarla (adentro o afuera del circuito); si no hay, del lado que mira hacia su medidor.
    // Devuelve el punto de contacto y la dirección n hacia afuera del cable.
    st.tipSide = { V: [null, null], I: [null] };
    const frame = (g, kind, i) => frameAt(g, kind, i, ...st.clamps[kind][i], st.tipSide[kind][i]);
    const frameAt = (g, kind, i, x, y, pref) => {
      let n = [0, 1];
      const p = st.segs.length && snap(st.segs, x, y);
      if (p) {
        const pts = st.segs[p.k].pts, L = st.segs[p.k].L;
        const a = D.pointAt(pts, Math.max(0, p.d - 3)), c = D.pointAt(pts, Math.min(L, p.d + 3));
        const tx = c[0] - a[0], ty = c[1] - a[1], s = Math.hypot(tx, ty) || 1;
        n = [-ty / s, tx / s];
        // en una esquina la punta va en diagonal, por fuera o por dentro
        const cn = (st.segs.corners || []).find(c => Math.hypot(c.x - p.x, c.y - p.y) < 0.5);
        if (cn) n = cn.dir;
        const [jx, jy] = jack(g, kind, i);
        const [sx, sy] = pref || [jx - x, jy - y];
        if (n[0] * sx + n[1] * sy < 0) n = [-n[0], -n[1]];
      }
      return { x, y, n };
    };
    // Largo de cada punta, del contacto a donde sale su cable o manguera.
    const tipLen = (side, kind) => kind === 'I' ? (side === 'w' ? Sim.PIPE + 12 : 30) : (side === 'w' ? Sim.PIPE + 10 : 46);
    // Refuerzo entre la punta y el cable (como el de los cables de verdad): un tramo más rígido que
    // no deja que el cable se doble justo al salir de la punta.
    const BOOT = 24;
    // Indicador: a qué distancia del contacto va el centro de su círculo.
    const PIN_D = 34;

    // Cada medidor recuerda si muestra sus cables o solo indicadores (tocando una punta se cambia),
    // también mientras se arrastran sus puntas. Se recuerda en este navegador. morph va de 0 (cables)
    // a 1 (indicadores) para pasar de uno a otro poco a poco.
    try { Object.assign(st.pinned, JSON.parse(localStorage.getItem('sim-pinned') || '{}')); } catch (e) {}
    st.morph = { V: [+st.pinned.V, +st.pinned.V], I: [+st.pinned.I] };   // de cada punta
    const savePinned = () => { try { localStorage.setItem('sim-pinned', JSON.stringify(st.pinned)); } catch (e) {} };
    const shown = (kind, i) => st.morph[kind][i] < 0.5 && !st.reel[kind][i];

    // Dónde se dibuja cada punta: contacto (x, y), dirección n hacia su cable y h, qué tan levantada va (0 a 1).
    // Levantada, el puntero sostiene su contacto (lift.x, lift.y; ox, oy es lo que le falta para
    // llegar bajo el puntero al empezar a arrastrar) y la punta gira para que su contacto mire a la
    // línea más cercana del circuito.
    const pose = (g, kind, i) => {
      const lf = st.lift[kind][i], fl = st.floor[kind][i], dr = st.drop[kind][i];
      if (lf) {
        const cx = lf.x + lf.ox, cy = lf.y + lf.oy;
        const p = st.segs.length && snap(st.segs, cx, cy, true);
        const a = p ? ease(Math.max(0, Math.min(1, 1 - (p.dist - 8) / (MAG - 8)))) : 0;
        if (!a) return { x: cx, y: cy, n: lf.n, h: 1 };
        const f = frameAt(g, kind, i, p.x, p.y, lf.n);
        const nx = lf.n[0] + (f.n[0] - lf.n[0]) * a, ny = lf.n[1] + (f.n[1] - lf.n[1]) * a, s = Math.hypot(nx, ny) || 1;
        return { x: cx + (p.x - cx) * a, y: cy + (p.y - cy) * a, n: [nx / s, ny / s], h: 1 - 0.6 * a, snap: p };
      }
      if (fl) return { x: fl.x, y: fl.y, n: fl.n, h: 0 };
      const f = frame(g, kind, i);
      if (!dr) return { ...f, h: 0 };
      const q = dr.from, u = ease(Math.min(1, dr.t / DROP));
      const nx = q.n[0] + (f.n[0] - q.n[0]) * u, ny = q.n[1] + (f.n[1] - q.n[1]) * u, s = Math.hypot(nx, ny) || 1;
      return { x: q.x + (f.x - q.x) * u, y: q.y + (f.y - q.y) * u, n: [nx / s, ny / s], h: q.h * (1 - u) };
    };
    // Al soltar una punta: si el imán la tenía, cae en la línea; si no, se queda en el suelo.
    const release = (kind, i) => {
      const lf = st.lift[kind][i];
      if (!lf) return;
      const q = pose(b.gw, kind, i);
      st.lift[kind][i] = null;
      if (q.snap) {
        st.clamps[kind][i] = [q.snap.x, q.snap.y];
        st.tipSide[kind][i] = lf.n;
        st.drop[kind][i] = { from: q, t: 0 };
      } else st.floor[kind][i] = { x: q.x, y: q.y, n: q.n };
      b.pw.replace(); b.pe.replace();
    };

    // Cables y mangueras con inercia: una cadena de puntos que va del final de la punta (sale recto)
    // al borne del medidor y se arrastra como sobre una mesa: no cuelga, el roce la frena y solo se
    // mueve donde la jalan. Se puede agarrar del cuerpo para acomodarlo; si hace falta, sale más
    // cable del medidor, y se queda donde se dejó.
    const NR = 24, ropes = { w: {}, e: {} };
    // Ajustes del cable (botón "Cables" de la barra), de 0 a 1: rigidez (qué tanto se resiste a
    // doblarse) e inercia (qué tanto sigue deslizándose al soltarlo). Se recuerdan en este navegador.
    const cable = { stiff: 0.3, inertia: 0.4 };
    try { Object.assign(cable, JSON.parse(localStorage.getItem('sim-cable') || '{}')); } catch (e) {}
    let held = null;   // punto del cable que se está arrastrando: { key, k, x, y }
    const ropeStep = (side, g, kind, i, dt) => {
      const key = kind + i;
      if (!st.placed[kind][i]) { delete ropes[side][key]; return; }
      if (st.reel[kind][i] && ropes[side][key]) return;   // mientras se recoge el cable no se mueve solo
      const f = pose(g, kind, i), L = tipLen(side, kind);
      // el refuerzo sale de la punta y se dobla solo un poquito (bootAng) hacia donde va el cable
      const old = ropes[side][key], ba = Math.atan2(f.n[1], f.n[0]) + (old ? old.bootAng : 0), bd = [Math.cos(ba), Math.sin(ba)];
      const A = [f.x + f.n[0] * L, f.y + f.n[1] * L], A2 = [A[0] + bd[0] * BOOT, A[1] + bd[1] * BOOT];
      const B = jack(g, kind, i), span = Math.hypot(B[0] - A2[0], B[1] - A2[1]);
      let r = ropes[side][key];
      if (!r) {   // recién puesta: el cable sale del borne en una sola curva suave (sin ondas)
        r = ropes[side][key] = [];
        r.len = span * 1.04 + 12; r.bootAng = 0;
        const s = span || 1, ux = (B[0] - A2[0]) / s, uy = (B[1] - A2[1]) / s;
        let px = -uy, py = ux;
        if (px * f.n[0] + py * f.n[1] < 0) { px = -px; py = -py; }   // la curva se abre hacia donde mira la punta
        const h = s * Math.sqrt(r.len / s - 1) * 2 / Math.PI;
        for (let k = 0; k < NR; k++) {
          const u = k / (NR - 1), o = h * Math.sin(Math.PI * u);
          const x = A2[0] + (B[0] - A2[0]) * u + px * o, y = A2[1] + (B[1] - A2[1]) * u + py * o;
          r.push({ x, y, px: x, py: y });
        }
      }
      const hk = held && held.key === key ? held.k : -1;
      // al jalarlo sale más cable del medidor: lo justo para que ningún lado quede estirado (si no,
      // al soltarlo regresaría como una liga)
      if (hk > 0) r.len = Math.max(r.len, Math.max(Math.hypot(held.x - A2[0], held.y - A2[1]) / hk, Math.hypot(B[0] - held.x, B[1] - held.y) / (NR - 1 - hk)) * (NR - 1) * 1.02);
      // Recoger tensa el cable de una punta conectada: el medidor jala lo que sobra poco a poco
      // (tenso, ya no deja la holgura de siempre hasta que se vuelva a mover)
      if (hk > 0 || st.lift[kind][i]) r.taut = false;
      const slack = r.taut || r.tense > 0 ? span * 1.005 + 2 : span * 1.04 + 12;
      if (r.tense > 0) { r.tense -= dt; r.taut = true; r.len += (slack - r.len) * (1 - Math.exp(-dt * 7)); }
      r.len = Math.max(r.len, slack);
      const rest = r.len / (NR - 1);
      // roce: sin inercia casi toda la velocidad se pierde en un instante; con inercia sigue deslizándose.
      // Un cable rígido roza más (pesa más), así no se queda temblando.
      const fr = Math.pow(Math.exp(Math.log(1e-4) * (1 - cable.inertia) + Math.log(0.6) * cable.inertia), Math.min(dt, 1 / 30)) * (1 - 0.5 * cable.stiff);
      const bend = 2 * rest * cable.stiff * 0.97;   // distancia mínima entre puntos a dos de distancia
      for (const q of r) {
        const vx = (q.x - q.px) * fr, vy = (q.y - q.py) * fr;
        q.px = q.x; q.py = q.y; q.x += vx; q.y += vy;
      }
      const fixed = k => k === 0 || k === NR - 1 || k === hk;
      for (let it = 0; it < 30; it++) {
        r[0].x = A2[0]; r[0].y = A2[1]; r[NR - 1].x = B[0]; r[NR - 1].y = B[1];
        if (hk > 0) { r[hk].x = held.x; r[hk].y = held.y; }
        // justo después del refuerzo el cable apenas tiende a seguir su dirección; luego es libre
        if (hk !== 1) {
          const q = r[1], t = Math.min(rest, 14);
          q.x += (A2[0] + bd[0] * t - q.x) * 0.2; q.y += (A2[1] + bd[1] * t - q.y) * 0.2;
        }
        for (let k = 1; k < NR; k++) {
          const a = r[k - 1], c = r[k], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d <= rest) continue;   // se dobla pero no se estira
          const wa = fixed(k - 1) ? 0 : 1, wc = fixed(k) ? 0 : 1;
          if (!wa && !wc) continue;
          const e = (d - rest) / d / (wa + wc);
          a.x += dx * e * wa; a.y += dy * e * wa;
          c.x -= dx * e * wc; c.y -= dy * e * wc;
        }
        // rigidez: dos puntos separados por uno no se pueden acercar demasiado, así no se dobla en seco
        for (let k = 2; k < NR; k++) {
          const a = r[k - 2], c = r[k], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d >= bend) continue;
          const wa = fixed(k - 2) ? 0 : 1, wc = fixed(k) ? 0 : 1;
          if (!wa && !wc) continue;
          const e = 0.5 * (d - bend) / d / (wa + wc);
          a.x += dx * e * wa; a.y += dy * e * wa;
          c.x -= dx * e * wc; c.y -= dy * e * wc;
        }
      }
      // un cable rígido no hace ondas chicas: cada punto se acerca apenas a la línea de sus vecinos
      // (poco, para que no se encoja como liga; el roce en reposo lo detiene)
      const sm = 0.08 * cable.stiff;
      if (sm) for (let k = 2; k < NR - 1; k++) {
        if (k === hk) continue;
        const q = r[k];
        q.x += ((r[k - 1].x + r[k + 1].x) / 2 - q.x) * sm; q.y += ((r[k - 1].y + r[k + 1].y) / 2 - q.y) * sm;
      }
      // el refuerzo sigue un poco al cable: hasta unos 17° de la dirección de la punta
      {
        const base = Math.atan2(f.n[1], f.n[0]), want = Math.atan2(r[2].y - A[1], r[2].x - A[0]);
        const d = Math.atan2(Math.sin(want - base), Math.cos(want - base));
        const target = Math.max(-0.3, Math.min(0.3, d * 0.35));
        r.bootAng += (target - r.bootAng) * (1 - Math.exp(-dt * 12));
      }
      // roce en reposo: un punto que apenas se movería se queda quieto, como un cable pesado sobre la
      // mesa; solo se mueve si lo jalan con ganas (más rígido, más pesado)
      const still = 0.15 + 0.35 * cable.stiff;
      for (let k = 1; k < NR - 1; k++) {
        const q = r[k];
        if (k !== hk && !(r.tense > 0) && Math.hypot(q.x - q.px, q.y - q.py) < still) { q.x = q.px; q.y = q.py; }
      }
      r.A = A;
    };
    // Botón "Cables" en la barra con un panelito de dos deslizadores.
    {
      const wrap = document.createElement('span'), btn = document.createElement('button'), pop = document.createElement('div');
      wrap.className = 'sim-cable';
      btn.type = 'button'; btn.className = 'sim-cable-btn'; btn.textContent = 'Cables';
      btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'simCablePop');
      pop.className = 'sim-cable-pop'; pop.id = 'simCablePop'; pop.hidden = true;
      [['stiff', 'Rigidez', 'flojo', 'rígido'], ['inertia', 'Inercia', 'se frena', 'se desliza']].forEach(([k, name, lo, hi]) => {
        const row = document.createElement('label'), inp = document.createElement('input');
        inp.type = 'range'; inp.min = 0; inp.max = 1; inp.step = 0.05; inp.value = cable[k];
        inp.addEventListener('input', () => {
          cable[k] = +inp.value;
          try { localStorage.setItem('sim-cable', JSON.stringify(cable)); } catch (e) {}
        });
        row.innerHTML = `<span class="name">${name}</span><span class="lo">${lo}</span>`;
        row.appendChild(inp);
        row.insertAdjacentHTML('beforeend', `<span class="hi">${hi}</span>`);
        pop.appendChild(row);
      });
      const show = v => { pop.hidden = !v; btn.setAttribute('aria-expanded', String(v)); };
      btn.addEventListener('click', () => show(pop.hidden));
      document.addEventListener('pointerdown', e => { if (!wrap.contains(e.target)) show(false); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') show(false); });
      wrap.append(btn, pop);
      bar.querySelector('.ctl').appendChild(wrap);
    }
    // Botón "Recoger": como una aspiradora, los medidores jalan sus cables (o mangueras). Las puntas
    // conectadas se quedan donde están y su cable se tensa; las que quedaron en el suelo entran al
    // medidor. Para volver a ponerlas se toca el medidor.
    const reelBtn = document.createElement('button');
    reelBtn.type = 'button'; reelBtn.className = 'sim-cable-btn sim-reel-btn';
    reelBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M20 12a8 8 0 0 0-8-8"/></svg><span class="lbl">Recoger</span>';
    reelBtn.setAttribute('aria-label', 'Recoger los cables y mangueras: tensa los conectados y guarda en su medidor los que están en el suelo');
    const syncReel = () => { reelBtn.disabled = !['V', 'I'].some(k => st.show[k] && st.placed[k].some(Boolean)); };
    reelBtn.addEventListener('click', () => {
      if (st.placing) setPlacing(null);
      ['V', 'I'].forEach(k => {
        if (!st.show[k]) return;
        for (let i = 0; i < NP[k]; i++) {
          if (!st.placed[k][i] || st.lift[k][i]) continue;
          if (st.floor[k][i]) { if (!st.reel[k][i]) st.reel[k][i] = 1e-6; }
          else ['w', 'e'].forEach(side => { const r = ropes[side][k + i]; if (r) r.tense = 0.8; });
        }
      });
      syncs.forEach(f => f());
    });
    bar.querySelector('.ctl').appendChild(reelBtn);
    syncReel();
    // Agarrar un cable del cuerpo: el punto más cercano sigue al puntero (en los dos paneles).
    const nearRope = (side, x, y) => {
      let best = null;
      for (const key in ropes[side]) {
        if (!st.show[key[0]] || !shown(key[0], +key[1])) continue;
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
    // El mismo recorrido como lista de puntos (las curvas en pasos cortos), para la raya de la manguera.
    const ropePoints = r => {
      const q = [r.A, [r[0].x, r[0].y]];
      let p0 = q[1];
      for (let k = 1; k < NR - 1; k++) {
        const c = [r[k].x, r[k].y], p1 = [(r[k].x + r[k + 1].x) / 2, (r[k].y + r[k + 1].y) / 2];
        for (let t = 0.25; t <= 1; t += 0.25) {
          const u = 1 - t;
          q.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
        }
        p0 = p1;
      }
      q.push([r[NR - 1].x, r[NR - 1].y]);
      return q;
    };
    const ropePath = (ctx, r) => {
      ctx.beginPath(); ctx.moveTo(r.A[0], r.A[1]); ctx.lineTo(r[0].x, r[0].y);
      for (let k = 1; k < NR - 1; k++) ctx.quadraticCurveTo(r[k].x, r[k].y, (r[k].x + r[k + 1].x) / 2, (r[k].y + r[k + 1].y) / 2);
      ctx.lineTo(r[NR - 1].x, r[NR - 1].y);
    };

    // Cada punta se arrastra (o se mueve con las flechas por el cable). Los dos paneles comparten
    // las puntas, igual que la bomba y la fuente.
    // (cx, cy): dónde está el puntero, para saber de qué lado del cable va la punta.
    const moveClamp = (kind, i, x, y, cx, cy) => {
      const p = snap(st.segs, x, y, true);
      if (!p) return;
      st.clamps[kind][i] = [p.x, p.y];
      if (cx !== undefined && Math.hypot(cx - p.x, cy - p.y) > 3) st.tipSide[kind][i] = [cx - p.x, cy - p.y];
      b.pw.replace(); b.pe.replace();
    };
    const tipName = (kind, i, side) => kind === 'I'
      ? (side === 'w' ? 'Turbinita del medidor de caudal' : 'Pinza del amperímetro')
      : `${side === 'w' ? 'Manguera' : 'Punta'} ${i ? 'negra' : 'roja'} ${side === 'w' ? 'del manómetro' : 'del voltímetro'}`;
    ['V', 'I'].forEach(kind => [0, 1].slice(0, NP[kind]).forEach(i => ['w', 'e'].forEach(side => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'sim-clamp';
      el.setAttribute('aria-label', `${tipName(kind, i, side)}: arrástrala o usa las flechas para moverla; tócala para cambiar entre cable e indicador`);
      b.place(side, el, g => {
        const f = pose(g, kind, i), m = ease(st.morph[kind][i]);
        const L = (kind === 'I' ? 0 : tipLen(side, kind) * 0.55) * (1 - m) + PIN_D * m;
        return [f.x + f.n[0] * L, f.y + f.n[1] * L];
      });
      const p = panel(side);
      const toDrawing = e => {
        const r = p.box.getBoundingClientRect();
        return [(e.clientX - r.left - p.ox) / p.scale, (e.clientY - r.top - p.oy) / p.scale];
      };
      // Arrastrar levanta la punta (como cable o como indicador, según esté el medidor); tocarla sin
      // arrastrar cambia el medidor entre cables e indicadores, para limpiar el diagrama.
      let down = null, dragged = false;
      el.addEventListener('pointerdown', e => {
        el.setPointerCapture(e.pointerId); el.focus(); down = [e.clientX, e.clientY]; dragged = false; e.preventDefault();
      });
      el.addEventListener('pointermove', e => {
        if (!el.hasPointerCapture(e.pointerId)) return;
        if (!dragged && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) return;
        const [x, y] = toDrawing(e);
        if (!dragged) {   // el contacto se desliza hasta quedar bajo el puntero
          const q = pose(geo(side), kind, i);
          st.lift[kind][i] = { x, y, n: q.n, ox: q.x - x, oy: q.y - y };
          st.floor[kind][i] = st.drop[kind][i] = null;
        }
        dragged = true;
        Object.assign(st.lift[kind][i], { x, y });
        b.pw.replace(); b.pe.replace();
      });
      const up = () => release(kind, i);
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      el.addEventListener('click', () => {
        if (!dragged) { st.pinned[kind] = !st.pinned[kind]; savePinned(); b.pw.replace(); b.pe.replace(); }
        dragged = false;
      });
      el.addEventListener('keydown', e => {
        const step = { ArrowUp: [0, -12], ArrowDown: [0, 12], ArrowLeft: [-12, 0], ArrowRight: [12, 0] }[e.key];
        if (!step) return;
        const fl = st.floor[kind][i], [x, y] = fl ? [fl.x, fl.y] : st.clamps[kind][i];
        st.floor[kind][i] = st.drop[kind][i] = null;
        moveClamp(kind, i, x + step[0], y + step[1]);
        e.preventDefault();
      });
      const sync = () => { el.hidden = !st.placed[kind][i] || !st.show[kind] || st.reel[kind][i] > 0; };
      syncs.push(sync); sync();
    })));

    // Tocar un medidor quita sus puntas del circuito y lo prepara para conectarse: el siguiente toque
    // pone la punta roja (+) y el siguiente la negra (−); el amperímetro solo necesita un toque para su
    // pinza. Si una punta está guardada en el medidor, solo se pone esa. Tocar el medidor otra vez o
    // Esc cancela y las puntas regresan a donde estaban.
    st.placing = null;
    const setPlacing = v => {
      if (st.placing && (!v || !v.prev)) st.placed[st.placing.kind] = st.placing.prev.slice();
      if (v && !v.prev) {
        v.prev = st.placed[v.kind].slice();
        v.todo = v.prev.some(Boolean) && !v.prev.every(Boolean) ? v.prev.map((p, i) => p ? -1 : i).filter(i => i >= 0) : st.placed[v.kind].map((_, i) => i);
        v.i = v.todo[0];
        v.todo.forEach(i => { st.placed[v.kind][i] = false; st.reel[v.kind][i] = 0; ['lift', 'floor', 'drop'].forEach(k => { st[k][v.kind][i] = null; }); });
        syncReel();
      }
      st.placing = v;
      [b.pw, b.pe].forEach(p => p.box.classList.toggle('placing', !!v));
      syncs.forEach(f => f());
      b.pw.replace(); b.pe.replace();
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
      syncs.push(() => { el.hidden = !st.show[kind]; });
    }));
    b.showMeters = show => {
      Object.assign(st.show, show);
      syncReel();
      if (st.placing && !st.show[st.placing.kind]) setPlacing(null);
      syncs.forEach(f => f());
      b.pw.replace(); b.pe.replace();
    };
    let swallow = false;
    [b.pw, b.pe].forEach(p => {
      p.box.addEventListener('pointerdown', e => {
        if (!st.placing || e.target.closest('.sim-meter-hit')) return;
        const r = p.box.getBoundingClientRect();
        const { kind, i } = st.placing;
        const x = (e.clientX - r.left - p.ox) / p.scale, y = (e.clientY - r.top - p.oy) / p.scale;
        moveClamp(kind, i, x, y, x, y);
        st.placed[kind][i] = true; st.click[kind][i] = 0;
        const next = st.placing.todo[st.placing.todo.indexOf(i) + 1];
        if (next !== undefined) { st.placing.i = next; syncs.forEach(f => f()); }
        else { st.placing.prev = st.placed[kind].slice(); setPlacing(null); }
        swallow = true; e.preventDefault(); e.stopPropagation();
      }, true);
      p.box.addEventListener('click', e => { if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); } }, true);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.placing) setPlacing(null); });

    // ---------- dibujo común ----------
    const controllerBox = (ctx, g, title, fill, scale, lcd) => {
      if (g.mode !== 'lateral') { ctx.fillStyle = C.ink; ctx.fillRect(g.PX - 14, g.BOT + 30, 28, 18); }   // cuello hacia el circuito
      D.roundRect(ctx, g.BX, g.BY, g.BW, g.BH, 14, fill, C.ink, 2.5);
      D.text(ctx, title, g.BX + 18, g.BY + 24, C.ink, { align: 'left', size: 15 });
      D.knobScale(ctx, g.CX, g.BY + 100, 36, scale);
      D.lcd(ctx, g.CX, g.BY + 34, 104, 32, ...lcd);   // lo que marca la perilla, aunque esté apagada
      D.led(ctx, g.BX + 100, g.BY + 97, st.v > 0.05 ? 1 : 0);   // detecta presión desde 0.5 kPa (0.05 V)
    };
    const knobScales = (ctx, g) => b.knobs.forEach(k => {
      const [x, y] = k.pos(g);
      D.knobScale(ctx, x, y, 36, k.scale(g.side), k.ticks);
      if (k.caption) D.text(ctx, k.caption(g.side), x, y + 58, C.muted, { size: 14 });
    });

    // Cables (o mangueras con agua) de un medidor. Se dibujan antes que el circuito, el controlador
    // y los medidores, así que siempre pasan por debajo de ellos; solo las puntas van encima.
    // Al cambiar a indicadores el cable se desvanece; al recogerlo solo se dibuja lo que falta por
    // entrar al medidor.
    const drawCables = (ctx, g, kind) => {
      if (!st.show[kind]) return;
      const side = g.side;
      ctx.save();
      for (let i = 0; i < NP[kind]; i++) {
        const r = ropes[side][kind + i], m = ease(st.morph[kind][i]);
        if (!r || !r.A || !st.placed[kind][i] || m >= 1) continue;
        ctx.globalAlpha = 1 - m;
        const rp = st.reel[kind][i] ? reelPose(side, kind, i) : null;
        if (st.reel[kind][i] && !rp) continue;
        const pts = rp ? rp.rest : null;
        if (side === 'w' && kind === 'V') { D.hose(ctx, pts || ropePoints(r), jackColor(kind, i)); continue; }   // con la raya de su borne
        if (pts) { ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); }
        else ropePath(ctx, r);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        {
          ctx.lineWidth = 6; ctx.strokeStyle = C.card; ctx.stroke();
          ctx.lineWidth = 3; ctx.strokeStyle = jackColor(kind, i); ctx.stroke();
        }
      }
      ctx.restore();
    };
    // Mientras se recoge: la punta va por el mismo recorrido del cable hacia el medidor. Devuelve su
    // pose y lo que queda del cable (rest), o null si ya entró.
    const reelPose = (side, kind, i) => {
      const r = ropes[side][kind + i];
      if (!r || !r.A) return null;
      const pts = ropePoints(r);
      let s = ease(st.reel[kind][i]) * D.len(pts);
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], c = pts[k], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (s > l || !l) { s -= l; continue; }
        const tx = (c[0] - a[0]) / l, ty = (c[1] - a[1]) / l, x = a[0] + tx * s, y = a[1] + ty * s, L = tipLen(side, kind);
        if (k === pts.length - 1 && l - s < 2) return null;
        return { x: x - tx * L, y: y - ty * L, n: [tx, ty], h: 0, rest: [[x, y], ...pts.slice(k)] };
      }
      return null;
    };
    // Las puntas de cada medidor en el circuito, con su refuerzo (o indicadores si se ocultaron los cables).
    // Una punta levantada se ve más grande y con sombra; al conectarse sale un anillo de su color.
    const drawTips = (ctx, g, kind) => {
      if (!st.show[kind]) return;
      for (let i = 0; i < NP[kind]; i++) {
        if (!st.placed[kind][i]) continue;
        const m = ease(st.morph[kind][i]);
        const q = st.reel[kind][i] ? reelPose(g.side, kind, i) : pose(g, kind, i), col = jackColor(kind, i);
        if (!q) continue;
        const live = connected(kind, i), u = st.click[kind][i] / 0.4;
        if (u < 1) { ctx.globalAlpha = 1 - u; D.circle(ctx, q.x, q.y, 8 + 26 * u, null, col, 3); ctx.globalAlpha = 1; }
        ctx.save(); ctx.translate(q.x, q.y);
        if (q.h > 0) {
          ctx.scale(1 + 0.12 * q.h, 1 + 0.12 * q.h);
          ctx.shadowColor = 'rgba(21,33,42,0.4)'; ctx.shadowBlur = 12 * q.h; ctx.shadowOffsetX = 4 * q.h; ctx.shadowOffsetY = 9 * q.h;
        }
        if (m < 1) {
          ctx.save(); ctx.globalAlpha = 1 - m; ctx.rotate(Math.atan2(q.n[1], q.n[0])); ctx.scale(1 - 0.4 * m, 1 - 0.4 * m);
          if (kind === 'V') (g.side === 'w' ? hoseTip : pen)(ctx, col);
          else (g.side === 'w' ? turbine : clampOn)(ctx, live);
          const rope = !st.reel[kind][i] && ropes[g.side][kind + i], tl = tipLen(g.side, kind);
          if (rope) { ctx.translate(tl, 0); ctx.rotate(rope.bootAng); ctx.translate(-tl, 0); }
          boot(ctx, tl, g.side === 'w' && kind === 'V' ? [8, 8.5] : [5, 3.2],
            g.side === 'w' && kind === 'V' ? '#9aa6af' : kind === 'I' ? PROBE.I : col);
          ctx.restore();
        }
        if (m > 0) pin(ctx, q.n, col, kind, m, live);
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
    const turbine = (ctx, live) => {
      const P = Sim.PIPE, w = live ? Math.min(st.probe.I.value, 60) * 0.5 : 0;
      D.circle(ctx, 0, 0, P - 2, null, PROBE.I, 2);
      D.rotor(ctx, 0, 0, P - 4, live ? st.turb : 0, w, 4, PROBE.I);
      D.circle(ctx, 0, 0, 3, PROBE.I);
      D.roundRect(ctx, P, -5, 12, 10, 2.5, C.ink);
    };
    // Medidor con sus bornes.
    const drawProbe = (ctx, g, kind, label, text, unit, color) => {
      if (!st.show[kind]) return;
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
    // Refuerzo a lo largo de +x desde x0 (donde termina la punta), del ancho h[0] al h[1]: funda
    // del color de la punta con anillos, que se angosta hacia el cable.
    const boot = (ctx, x0, [h0, h1], col) => {
      const x1 = x0 + BOOT;
      ctx.beginPath();
      ctx.moveTo(x0 - 1, -h0); ctx.lineTo(x1 - 3, -h1); ctx.quadraticCurveTo(x1, -h1, x1, 0);
      ctx.quadraticCurveTo(x1, h1, x1 - 3, h1); ctx.lineTo(x0 - 1, h0); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.ink; ctx.stroke();
      ctx.strokeStyle = col === C.ink ? 'rgba(255,255,255,0.45)' : 'rgba(21,33,42,0.45)'; ctx.lineWidth = 1.5;
      for (let k = 1; k <= 3; k++) {
        const x = x0 + BOOT * k / 4, h = h0 + (h1 - h0) * k / 4 - 1;
        ctx.beginPath(); ctx.moveTo(x, -h); ctx.lineTo(x, h); ctx.stroke();
      }
    };
    // Indicador (con el contacto en el origen): anillo que abraza el cable y, unido por un palito, un
    // círculo grande del color de la punta con + o − (A en la pinza), con halo para verse de lejos.
    // m de 0 a 1: el palito crece y el círculo aparece con un pequeño rebote. Sin conectar, el
    // anillo va punteado.
    const pin = (ctx, n, col, kind, m, live) => {
      const bx = n[0] * PIN_D * m, by = n[1] * PIN_D * m, k = m - 1, pop = 1 + 2.7 * k * k * k + 1.7 * k * k;
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * Math.min(1, m * 2);
      D.line(ctx, [[0, 0], [bx, by]], 6, C.card);
      D.line(ctx, [[0, 0], [bx, by]], 3, col);
      if (!live) ctx.setLineDash([3, 3]);
      D.circle(ctx, 0, 0, 7, C.card, col, 3.5);
      ctx.setLineDash([]);
      ctx.save(); ctx.translate(bx, by); ctx.scale(pop, pop);
      const a1 = ctx.globalAlpha;
      ctx.globalAlpha = a1 * 0.22; D.circle(ctx, 0, 0, 21, col); ctx.globalAlpha = a1;
      ctx.save(); ctx.shadowColor = 'rgba(21,33,42,0.35)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      D.circle(ctx, 0, 0, 16, C.card); ctx.restore();
      D.circle(ctx, 0, 0, 14, col);
      D.circle(ctx, 0, 0, 16, null, C.ink, 1.5);
      D.text(ctx, kind === 'I' ? 'A' : col === RED ? '+' : '−', 0, 1, '#fff', { size: 20, weight: 800 });
      ctx.restore();
      ctx.globalAlpha = a0;
    };
    const probeText = (kind, scale, width, d) => ready(kind) ? digits(st.probe[kind].value * scale, width, d) : ' ----';

    function drawWater() {
      const g = b.gw, m = st.m, ctx = b.pw.begin();
      drawCables(ctx, g, 'I'); drawCables(ctx, g, 'V');
      o.drawW(ctx, g, m);
      knobScales(ctx, g);
      D.speedLegend(ctx, ...g.LEG);
      controllerBox(ctx, g, 'BOMBA', C.metal, [['0', 0], ['120', 1]], [digits(st.set * KPA_PER_V, 3, 0), 'kPa']);
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
      drawCables(ctx, g, 'I'); drawCables(ctx, g, 'V');
      o.drawE(ctx, g, m);
      knobScales(ctx, g);
      controllerBox(ctx, g, 'FUENTE', C['charge-soft'], [['0', 0], ['12', 1]], [digits(st.set, 2, 1), 'V']);
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
      if (smooth.raw && !o.stateful) {
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
    // Transiciones de las puntas: cable ⇄ indicador, recoger o sacar el cable y la caída al conectarse.
    const animate = dt => {
      let moved = false;
      for (const kind of ['V', 'I']) {
        for (let i = 0; i < NP[kind]; i++) {
          // al recoger una punta del suelo primero se vuelve cable y luego entra al medidor
          const m0 = st.morph[kind][i], r0 = st.reel[kind][i];
          st.morph[kind][i] = st.pinned[kind] && !r0 ? Math.min(1, m0 + dt / MORPH) : Math.max(0, m0 - dt / MORPH);
          if (r0 && !st.morph[kind][i]) st.reel[kind][i] = Math.min(1, r0 + dt / REEL);
          if (st.reel[kind][i] >= 1) {   // ya entró: queda guardada hasta que se vuelva a poner
            st.reel[kind][i] = 0; st.placed[kind][i] = false; st.floor[kind][i] = null;
            syncs.forEach(f => f()); syncReel();
          }
          if (st.morph[kind][i] !== m0 || st.reel[kind][i] !== r0) moved = true;
          const dr = st.drop[kind][i], lf = st.lift[kind][i];
          st.click[kind][i] += dt;
          // levantada, la punta gira poco a poco para que su contacto mire a la línea más cercana
          if (lf) { const k = Math.exp(-dt * 18); lf.ox *= k; lf.oy *= k; moved = true; }
          const cx = lf && lf.x + lf.ox, cy = lf && lf.y + lf.oy;
          const p = lf && st.segs.length && snap(st.segs, cx, cy, true);
          if (p && p.dist > 1) {
            const a0 = Math.atan2(lf.n[1], lf.n[0]), a1 = Math.atan2(cy - p.y, cx - p.x);
            const d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)), an = a0 + d * (1 - Math.exp(-dt * 14));
            if (Math.abs(d) > 1e-3) { lf.n = [Math.cos(an), Math.sin(an)]; moved = true; }
          }
          if (dr && (dr.t += dt) >= DROP) { st.drop[kind][i] = null; st.click[kind][i] = 0; }
          if (dr) moved = true;
        }
      }
      if (moved) { b.pw.replace(); b.pe.replace(); }
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
      st.nPa.step(connected('V', 0) ? st.probe.V.va / VMAX : 0, tn, dt);
      st.nPb.step(connected('V', 1) ? st.probe.V.vb / VMAX : 0, tn, dt);
      st.turb += Math.min(st.probe.I.value, 60) * 0.5 * dt;
      animate(dt);
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
