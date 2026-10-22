// Generador de funciones y osciloscopio (Sim.scope), lo común a las páginas del osciloscopio. En el agua, el
// generador es una bomba que cambia de sentido (bomba de vaivén) y el osciloscopio es un registrador que dibuja
// la presión en un papel. No usa banco.js porque aquí la fuente no es fija: la señal cambia más rápido de lo que
// se dibuja. Cada cuadro se integra el circuito en pasos pequeños (con la solución exacta del capacitor) y se
// guarda lo que marca cada canal; el osciloscopio dibuja de lo guardado.
//
// Cada página da su circuito (como banco.js con Sim.bench):
//   preset    los valores del taller al abrir: generador (wave, fi, amp, off), R, Cap, filt, escalas (vi, ti),
//             ch2 y las puntas (probe: canal 1, caimán de tierra, canal 2; pw: en qué cable va cada una, 0 si
//             se omite; side: de qué lado del cable, −1 afuera y 1 adentro)
//   places    dónde va cada componente: { clave: [x, y, 'h' acostado o 'v' parado, opciones] }. La clase sale de
//             la primera letra de la clave: R resistencia (tramo angosto), L LED (rueda), D diodo (válvula de
//             retención), C capacitor (tanque). Opciones: dir (−1: el diodo conduce hacia la izquierda), ref
//             (su nombre corto, como D1), tag ('below': la etiqueta abajo; 'right': la de uno parado a
//             su derecha, si no a su izquierda), lim(st): hasta dónde llega la de uno parado, turn: false (sin
//             «Girar»)
//   wires     cables donde se ponen las puntas y de donde sale el voltaje de cada punto para el color: { pts,
//             seq: [nodo, componente, nodo, …], probe: false (solo para el color), when(st) (si existe ahora),
//             half: { C: st => … } (lo que abarca un componente en ese cable, si no es lo de siempre) }
//   branches  las ramas del agua (Sim.stream), cada una con su corriente: [{ pts, br, dc }] (dc: dónde queda
//             el centro del tramo angosto, si lo tiene)
//   dots      dónde se unen los cables (puntos en la electricidad)
//   solve(e, h, st) → { I (mA del generador), i: { rama: mA }, v: { nodo: V } (0 en el borne −), VR (V en la
//             resistencia), diodes: { clave: [V, mA] } }; puede guardar el voltaje del capacitor en st.vc
//   ifull     mA de la punta de la escala de color de la corriente
//   rValues   valores de la resistencia; burn: la resistencia se puede quemar; filter: el capacitor se pone y
//             se quita desde su tarjeta
(() => {
  const { C, draw: D, fmt } = Sim;
  const RPM_PER_MA = 100;
  const SRC = 40, DIV = 40;          // medio ancho del generador sobre el cable; tamaño de una división
  const KW = 20;                     // rapidez del agua (y de las cargas) por cada mA
  const RED = '#d6392b', PURPLE = '#8b5cf6';
  // Color de cada canal en el papel y en la pantalla: el 1 morado, como todo voltaje; el 2 rosa.
  const CH = [{ paper: PURPLE, lcd: '#c4b0ff' }, { paper: '#d6337f', lcd: '#ff8fc8' }];
  // Frecuencias de 0.1 Hz a 1 kHz, diez pasos por década.
  const E10 = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
  const freqAt = i => E10[i % 10] * Math.pow(10, Math.floor(i / 10) - 1);
  const VDIV = [0.5, 1, 2, 5];
  const TDIV = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];   // ms por división
  const frac = x => x - Math.floor(x);
  const clamp01 = x => Math.max(0, Math.min(1, x));
  // Formas de onda en función de la fase (en vueltas); todas empiezan en 0 subiendo.
  const WAVES = {
    sine: p => Math.sin(2 * Math.PI * p),
    square: p => frac(p) < 0.5 ? 1 : -1,
    tri: p => 4 * Math.abs(frac(p + 0.75) - 0.5) - 1
  };
  // Capacitores del taller, de 10 nF a 100 µF (serie E3: 10, 22, 47…), en µF. Desde 1 µF son
  // electrolíticos: tienen polaridad (la placa curva es la −).
  const CVALUES = Sim.series(0.01, 100, [1, 2.2, 4.7]);
  const capText = c => c < 1 ? fmt(Math.round(c * 1000), 0) + ' nF' : fmt(c, c % 1 ? 1 : 0) + ' µF';
  const POL = 1;   // µF: desde aquí son electrolíticos
  // Diodo 1N4007 con caída fija: no conduce hasta 0,7 V y, ya conduciendo, a esa caída solo se suma lo que cae
  // en su resistencia interna (unos 0,25 Ω: llega a unos 0,95 V con 1 A, como en su hoja de datos). En inverso
  // no conduce (su fuga es de nanoamperes) y aguanta 1000 V, mucho más de lo que da el generador.
  const VF = 0.7, RD = 0.25;
  // Radio del tanque (capacitor): 17 a 30, crece con la capacidad.
  const rcOf = c => 17 + 13 * Math.log(c / 0.01) / Math.log(100 / 0.01);

  // ---------- acomodo ----------
  // El circuito y el generador siempre en el mismo lugar; el osciloscopio abajo (alto) o a la derecha (ancho).
  const CIRC = { X0: 80, X1: 560, PX: 320, TOP: 80, BOT: 280, XR: 230, XL: 410 };
  const { X0, X1, PX, TOP, BOT } = CIRC, MIDY = (TOP + BOT) / 2;
  // Recorrido de siempre: del borne + del generador, por todo el circuito, al otro borne.
  const PATH = [[PX - SRC, BOT], [X0, BOT], [X0, TOP], [X1, TOP], [X1, BOT], [PX + SRC, BOT]];
  Sim.scope = o => {
    const MODES = { alto: { W: 640, H: 1000 }, ancho: { W: 1250, H: 570 } };
    // Lugar para el selector del color de las partículas y su escala: en el alto, una franja de BAND arriba del
    // circuito (el dibujo empieza en y = −BAND); en el ancho, arriba del osciloscopio, que baja un poco.
    const BAND = 110;
    const bandOf = k => k === 'alto' ? BAND : 0;
    const size = (w, h) => {
      let best = null;
      for (const k in MODES) { const s = Math.min(w / MODES[k].W, h / (MODES[k].H + bandOf(k))); if (!best || s > best.s) best = { k, s }; }
      const { W, H } = MODES[best.k], c = Math.min(w / W, h / H) < 0.75 ? '-c' : '';
      return [W, H + bandOf(best.k), 0, best.k + c, -bandOf(best.k)];
    };
    const geometry = (side, mode) => {
      const g = { side, mode, ...CIRC, GX: 40, GY: CIRC.BOT + 46, GW: 560, GH: 200, SW: 580, SH: 420 };
      if (mode.startsWith('alto')) { g.SX = 30; g.SY = g.GY + g.GH + 30; } else { g.SX = 640; g.SY = 150; }
      g.MIDY = (g.TOP + g.BOT) / 2;
      g.scr = [g.SX + 20, g.SY + 46, 10 * DIV, 8 * DIV];
      g.jacks = [[g.SX + 60, g.SY + 396], [g.SX + 110, g.SY + 396], [g.SX + 210, g.SY + 396]];
      return g;
    };

    // Resistencias de la serie E12 (las de la página); calor (Sim.heat): la resistencia es de ¼ W; cada diodo
    // aguanta 1 A promedio, con ~1 V de caída ~1 W, y su unión llega a 150 °C.
    const rh = Sim.heat(Sim.HEAT.res), dh = {};
    const PLACES = o.places, kind = k => k[0];
    for (const k in PLACES) if (kind(k) === 'D') dh[k] = Sim.heat({ pMax: 1, tMax: 150, tau: 4 });
    const popt = k => PLACES[k][3] || {};

    const st = { on: false, ramp: Sim.ramp(), level: 0, tau: 1, fi: 10, amp: 6, off: 0, wave: 'sine',
      led: true, R: 470, color: 'rojo', rev: false, Cap: 0.1, filt: false, drev: false, vc: 0, rb: false, rbT: 0,
      ph: 0, T: 0, vi: 2, ti: 8, trig: true, ch2: false, probe: [300, 980, 640], pw: [0, 0, 0], side: [-1, -1, 1], last: [0, 0],
      q: {}, flow: {}, dOn: {},
      rotor: 0, rotorOm: 0, wheel: 0, wheelOm: 0, glow: 0, shut: 0, shake: 0,
      frames: [], sweep: { ts: 0, done: [] }, traces: [], beam: null, stat: null };
    const p0 = o.preset;
    Object.assign(st, p0, { probe: [...p0.probe], pw: p0.pw ? [...p0.pw] : [0, 0, 0], side: [...p0.side] });
    for (const k in dh) st.dOn[k] = 0;

    // ---------- cables: dónde se ponen las puntas y el voltaje de cada punto ----------
    const HALF = { R: 46, L: 30, D: 30, C: 30 };
    const project = (pts, x, y) => {
      let best = null, d0 = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], s = Math.hypot(bx - ax, by - ay);
        const t = s ? clamp01(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (s * s)) : 0;
        const dist = Math.hypot(x - ax - (bx - ax) * t, y - ay - (by - ay) * t);
        if (!best || dist < best.dist) best = { d: d0 + t * s, dist };
        d0 += s;
      }
      return best;
    };
    // Cada cable: sus nodos (en orden) y lo que abarca cada componente (en distancia por el cable).
    const WIRES = o.wires.map(w => {
      const nodes = w.seq.filter((x, i) => i % 2 === 0), comps = w.seq.filter((x, i) => i % 2);
      const at = comps.map(k => project(w.pts, PLACES[k][0], PLACES[k][1]).d);
      return { ...w, L: D.len(w.pts), nodes, comps,
        span: () => comps.map((k, i) => { const r = w.half && w.half[k] ? w.half[k](st) : HALF[kind(k)]; return [at[i] - r, at[i] + r]; }) };
    });
    const live = w => !w.when || w.when(st);
    // Voltaje en el punto d del cable: el de su nodo, o de un nodo al otro por lo largo de cada componente.
    const vOn = (w, d, v, spans = w.span()) => {
      let x = v[w.nodes[0]];
      for (let i = 0; i < spans.length; i++) x -= (v[w.nodes[i]] - v[w.nodes[i + 1]]) * clamp01((d - spans[i][0]) / (spans[i][1] - spans[i][0]));
      return x;
    };
    // Las puntas no se pueden poner encima de un componente ni del generador.
    const snapD = (wi, d) => {
      const w = WIRES[wi], sp = w.span().filter((c, i) => kind(w.comps[i]) !== 'L' || st.led);
      for (const [a, b] of sp) if (d > a - 8 && d < b + 8) d = d - a < b - d ? a - 8 : b + 8;
      return Math.max(10, Math.min(w.L - 10, d));
    };
    const nearWire = (x, y, probe) => {
      let best = null;
      WIRES.forEach((w, i) => {
        if (!live(w) || (probe && w.probe === false)) return;
        const p = project(w.pts, x, y);
        if (!best || p.dist < best.dist) best = { ...p, w: i };
      });
      return best;
    };

    // ---------- lo que marca el osciloscopio ----------
    // Cada cuadro guarda, paso por paso, lo que marca cada canal (a: canal 1, b: canal 2, contra el caimán de
    // tierra), su mínimo, su máximo y su promedio, y la fase del generador al empezar (para el disparo).
    const frames = st.frames;
    const frameAt = t => {
      let lo = 0, hi = frames.length - 1;
      if (hi < 0) return null;
      if (t <= frames[0].t0) return 0;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (frames[m].t0 <= t) lo = m; else hi = m - 1; }
      return lo;
    };
    const valAt = (ch, t) => {
      const i = frameAt(t);
      if (i === null) return 0;
      const F = frames[i], v = ch ? F.b : F.a;
      if (!v) return (F.mn[ch] + F.mx[ch]) / 2;
      const u = Math.max(0, Math.min(F.n, (t - F.t0) / F.h)), k = Math.min(F.n - 1, Math.floor(u));
      return v[k] + (v[k + 1] - v[k]) * (u - k);
    };
    // Mínimo y máximo entre ta y tb (cuando en una columna de la pantalla caben varios ciclos).
    const bandAt = (ch, ta, tb) => {
      let lo = Infinity, hi = -Infinity;
      for (let i = frameAt(ta) ?? frames.length; i < frames.length && frames[i].t0 < tb; i++) {
        const F = frames[i], v = ch ? F.b : F.a, t1 = F.t0 + F.n * F.h;
        if (!v || (ta <= F.t0 && tb >= t1)) { lo = Math.min(lo, F.mn[ch]); hi = Math.max(hi, F.mx[ch]); continue; }
        const k0 = Math.max(0, Math.floor((ta - F.t0) / F.h)), k1 = Math.min(F.n, Math.ceil((tb - F.t0) / F.h));
        const step = Math.max(1, Math.floor((k1 - k0) / 160));
        for (let k = k0; k <= k1; k += step) { lo = Math.min(lo, v[k]); hi = Math.max(hi, v[k]); }
      }
      return lo <= hi ? [lo, hi] : [0, 0];
    };
    // Lecturas de cada canal: máximo, mínimo y promedio de los últimos ciclos completos (al menos 0,1 s).
    const stats = () => {
      const f = freqAt(st.fi), W = Math.ceil(Math.max(0.1, 1 / f) * f - 1e-9) / f, out = [0, 1].map(() => ({ mn: Infinity, mx: -Infinity, sum: 0, dur: 0 }));
      for (let i = frames.length - 1; i >= 0; i--) {
        const F = frames[i], dur = F.n * F.h, t0 = st.T - W;
        if (F.t0 + dur <= t0) break;
        if (F.t0 >= t0 || !F.a) {
          out.forEach((o, ch) => { o.mn = Math.min(o.mn, F.mn[ch]); o.mx = Math.max(o.mx, F.mx[ch]); o.sum += F.sm[ch]; o.dur += dur; });
          continue;
        }
        // el cuadro más viejo solo desde donde empieza la ventana, para que sean ciclos completos
        const k0 = Math.min(F.n - 1, Math.ceil((t0 - F.t0) / F.h));
        [F.a, F.b].forEach((v, ch) => {
          const o = out[ch];
          for (let k = k0; k <= F.n; k++) { o.mn = Math.min(o.mn, v[k]); o.mx = Math.max(o.mx, v[k]); if (k > k0) o.sum += (v[k - 1] + v[k]) / 2 * F.h; }
          o.dur += (F.n - k0) * F.h;
        });
      }
      return out.map(o => o.dur ? { mn: o.mn, mx: o.mx, mean: o.sum / o.dur } : { mn: 0, mx: 0, mean: 0 });
    };

    // Barrido: el haz cruza la pantalla en 10 divisiones. El disparo toma la sincronía del generador (su salida
    // SYNC, como en el taller): cada barrido empieza cuando la onda del generador empieza su ciclo, y la imagen se
    // queda quieta. Sin disparo empieza donde caiga y la imagen brinca.
    const sweepS = () => 10 * TDIV[st.ti] / 1000;
    const nextStart = (E, S) => {
      const i = frameAt(E), F = i === null ? null : frames[i];
      if (st.trig && F) return E + frac(-(F.ph0 + F.f * (E - F.t0))) / F.f;
      return E + S * (0.05 + 0.3 * Math.random());
    };
    const resetSweep = () => { st.sweep = { ts: st.T, done: [] }; };
    // Puntos de la traza del canal ch (x de 0 a 1 en la pantalla, valor en V) de un barrido entre tA y tB.
    const COLS = 200;
    const build = (ch, ts, S, tA, tB) => {
      const pts = [], dc = S / COLS;
      for (let j = 0; j < COLS; j++) {
        let ta = ts + j * dc, tb = ta + dc;
        if (tb <= tA) continue;
        if (ta >= tB) break;
        ta = Math.max(ta, tA); tb = Math.min(tb, tB);
        const i = frameAt(ta), f = i === null ? 1 : frames[i].f, xa = (ta - ts) / S, xb = (tb - ts) / S;
        if ((tb - ta) * f > 0.34) {   // varios ciclos en una columna: se ve como una banda
          const [lo, hi] = bandAt(ch, ta, tb);
          if (j % 2) pts.push([xa, hi], [xb, lo]); else pts.push([xa, lo], [xb, hi]);
        } else pts.push([xa, valAt(ch, ta)], [(xa + xb) / 2, valAt(ch, (ta + tb) / 2)]);
      }
      if (tB < ts + S && tB > tA) pts.push([(tB - ts) / S, valAt(ch, tB)]);
      return pts;
    };
    const trace = (ts, S, tA, tB, a) => ({ pts: [build(0, ts, S, tA, tB), st.ch2 ? build(1, ts, S, tA, tB) : []], a });
    const updateScope = () => {
      const S = sweepS(), sw = st.sweep;
      if (st.T - (sw.ts + S) > 8 * S) sw.ts = st.T - 3 * S;   // barridos muy rápidos: solo importan los últimos
      for (let n = 0; sw.ts + S <= st.T && n < 20; n++) {
        sw.done.push(sw.ts); if (sw.done.length > 4) sw.done.shift();
        sw.ts = nextStart(sw.ts + S, S);
      }
      st.traces = []; st.beam = null;
      const last = sw.done[sw.done.length - 1];
      if (S > 0.3) {   // barrido lento: se ve el haz avanzar; lo que falta del barrido anterior queda tenue
        if (sw.ts <= st.T) {
          const u = (st.T - sw.ts) / S;
          if (last !== undefined) st.traces.push(trace(last, S, last + u * S, last + S, 0.3));
          const tr = trace(sw.ts, S, sw.ts, st.T, 1);
          st.traces.push(tr);
          st.beam = tr.pts.map(p => p.length ? p[p.length - 1] : null);
        } else if (last !== undefined) st.traces.push(trace(last, S, last, last + S, 1));
      } else sw.done.forEach((ts, k) => st.traces.push(trace(ts, S, ts, ts + S, [0.18, 0.3, 0.5, 1][k + 4 - sw.done.length])));
      st.stat = stats();
    };

    // ---------- animación del circuito ----------
    // Se integra con pasos pequeños: al menos 64 por ciclo del generador y 40 por división de la pantalla. El
    // agua (y las cargas) de cada rama avanza lo que pasó en el cuadro, aunque la señal vaya y venga muchas veces.
    let dense = 0;   // cuántos valores guardados hay (para no guardar de más)
    const FAST = 5, VS = 10;
    st.avg = { on: false, v: {}, i: {} };
    const advance = dt => {
      st.level = st.ramp.step(st.on ? 1 : 0, st.tau, dt);
      const f = freqAt(st.fi), S = sweepS();
      const n = Math.max(1, Math.min(4000, Math.ceil(Math.max(dt * f * 64, dt * 400 / S)))), h = dt / n;
      const at = [0, 1, 2].map(k => { const w = WIRES[st.pw[k]]; return { w, d: st.probe[k], sp: w.span() }; });
      const a = new Float32Array(n + 1), b = new Float32Array(n + 1);
      a[0] = st.last[0]; b[0] = st.last[1];
      let qa = 0, peak = 0, last = 0, back = 0, ER = 0, se = 0;
      const qi = {}, ai = {}, sv = {}, ED = {}, on = {};
      for (const k in dh) { ED[k] = 0; on[k] = 0; }
      for (let k = 0; k < n; k++) {
        const e = st.level * (st.amp * WAVES[st.wave](st.ph + f * h * (k + 1)) + st.off);
        const m = o.solve(e, h, st);
        qa += Math.abs(m.I) * h; peak = Math.max(peak, Math.abs(m.I)); last = m.I;
        for (const br in m.i) { qi[br] = (qi[br] || 0) + m.i[br] * h; ai[br] = (ai[br] || 0) + Math.abs(m.i[br]) * h; }
        for (const nd in m.v) sv[nd] = (sv[nd] || 0) + m.v[nd] * h;
        se += e * h;
        if (e < -0.05) back += h;
        ER += m.VR * m.VR / st.R * h;
        for (const d in m.diodes || {}) {
          const [vd, id] = m.diodes[d];
          if (id > 1e-3 || id < -1e-3) on[d] += h;
          ED[d] += vd * id / 1000 * h;
        }
        const vg = vOn(at[1].w, at[1].d, m.v, at[1].sp);
        a[k + 1] = vOn(at[0].w, at[0].d, m.v, at[0].sp) - vg; b[k + 1] = vOn(at[2].w, at[2].d, m.v, at[2].sp) - vg;
      }
      const F = { t0: st.T, h, n, a, b, f, ph0: st.ph, mn: [Infinity, Infinity], mx: [-Infinity, -Infinity], sm: [0, 0] };
      [a, b].forEach((v, ch) => {
        let mn = v[0], mx = v[0], sm = 0;
        for (let k = 1; k <= n; k++) { const x = v[k]; if (x < mn) mn = x; if (x > mx) mx = x; sm += (v[k - 1] + x) / 2 * h; }
        F.mn[ch] = mn; F.mx[ch] = mx; F.sm[ch] = sm;
      });
      frames.push(F); dense += n + 1;
      st.last = [a[n], b[n]];
      st.ph = frac(st.ph + f * dt);
      st.T += dt;
      // Se guarda lo de los últimos 30 s; los valores paso por paso solo lo que puede pedir la pantalla.
      while (frames.length > 2 && frames[1].t0 < st.T - 30) { const G = frames.shift(); if (G.a) dense -= G.n + 1; }
      const keep = st.T - (6 * S + 1);
      for (const G of frames) {
        if (G.t0 >= keep && dense < 3e6) break;
        if (G === F) break;
        if (G.a) { dense -= G.n + 1; G.a = G.b = null; }
      }
      // Calor: la potencia promedio del cuadro.
      if (rh.step(ER / dt, dt) && o.burn) { st.rb = true; st.rbT = 0; }
      for (const d in dh) dh[d].step(ED[d] / dt, dt);
      if (st.rb) st.rbT += dt;
      // Con la presión al revés la compuerta de la rueda se cierra; se avisa cuando pasa la mayor parte del tiempo.
      st.shut += (back / dt - st.shut) * Math.min(1, dt / 0.12);
      for (const d in dh) st.dOn[d] += (on[d] / dt - st.dOn[d]) * Math.min(1, dt / 0.06);   // cuánto del tiempo conduce cada diodo
      const sgn = last < 0 ? -1 : 1, rad = RPM_PER_MA / 60 * 2 * Math.PI, wrad = Sim.WHEEL_RPM_PER_MA / 60 * 2 * Math.PI;
      // El agua de cada rama avanza lo que pasó; su rapidez (para el color): la de la rama del generador,
      // lo que pasa sin importar el sentido; la de las demás, lo que avanzó en el cuadro.
      for (const br in qi) {
        st.q[br] = (st.q[br] || 0) + qi[br] * KW;
        st.flow[br] = (br === 's' ? qa : Math.abs(qi[br])) / dt * KW;
      }
      // Para el color de las partículas: lo de este cuadro en promedio y, si la señal va rápido (FAST Hz o más),
      // el promedio de los últimos ciclos (una constante de tiempo de un cuarto de segundo), porque el ojo ya no
      // sigue el cambio. La corriente, sin signo (el color es cuánta pasa).
      const av = st.avg, ta = f >= FAST ? 0.25 : 0, lag = (x, y) => Sim.lag(x || 0, y, ta, dt);
      av.on = f >= FAST;
      for (const nd in sv) av.v[nd] = lag(av.v[nd], sv[nd] / dt);
      for (const br in ai) av.i[br] = lag(av.i[br], (br === 's' ? qa : ai[br]) / dt);
      st.rotor -= (qi.s || 0) * rad; st.rotorOm = -sgn * qa / dt * rad;
      st.wheel -= (qi.s || 0) * wrad; st.wheelOm = -qa / dt * wrad;
      st.glow = qa / dt;   // el ojo ve el promedio: arriba de unos 20 Hz el LED ya no parpadea
      // Si la señal va y viene muy rápido el agua casi no avanza: solo vibra.
      const vib = clamp01((f - 3) / 9);
      st.shake = vib * Math.min(1, peak / 8) * 2.2;
    };
    Sim.shake = () => st.shake;

    // ---------- color de las partículas ----------
    // Presión (voltaje) en cada punto, de −10 a 10 V (la señal va y viene: 0 V queda a la mitad de la escala), y
    // caudal (corriente) de la rama, de 0 a lo más que pasa en el circuito con los valores del taller.
    Sim.field = (x, y) => {
      let best = null;
      for (const b of branches) { const p = project(b.pts, x, y); if (!best || p.dist < best.dist) best = { ...p, b }; }
      if (!best) return [0.5, 0];
      const av = st.avg, wn = nearWire(x, y, false);
      const v = wn && Object.keys(av.v).length ? vOn(WIRES[wn.w], wn.d, av.v) : 0;
      return [(v + VS) / (2 * VS), (av.i[best.b.br] || 0) / o.ifull];
    };

    // ---------- paneles ----------
    // El agua va por tramos (Sim.stream), uno por rama, cada uno con su corriente.
    const panels = {}, geos = {};
    let branches = [];
    const HN = () => 8 - 5 * Math.log(st.R / 470) / Math.log(10000 / 470);   // medio ancho del tramo angosto: más angosto, más resistencia
    const rebuild = () => {
      branches = o.branches(st).map(b => ({ ...b, s: Sim.stream(b.pts, b.dc === undefined ? undefined : Sim.narrowProfile(b.dc, HN())) }));
    };
    rebuild();
    const pw = Sim.panel(document.getElementById('pw'), size), pe = Sim.panel(document.getElementById('pe'), size);
    pw.mirror = pe; pe.mirror = pw; panels.w = pw; panels.e = pe;
    const relayout = (side, mode) => {
      geos[side] = geometry(side, mode);
      Sim.compact = mode.endsWith('-c');
    };
    pw.onLayout = (W, H, mode) => { relayout('w', mode); rebuild(); };
    pe.onLayout = (W, H, mode) => relayout('e', mode);
    pw.refit(); pe.refit();
    relayout('w', pw.mode); relayout('e', pe.mode); rebuild();

    // Switch arriba: agua o electricidad, o ambos (se recuerda en este navegador).
    Sim.viewSwitch();
    // Color de las partículas: el selector con su escala, arriba a la derecha del circuito (en el ancho, arriba del
    // osciloscopio). Con la señal rápida la escala dice que el color es el promedio.
    const colorEnds = side => {
      const [v, i] = side === 'w' ? ['psi', 'mL/s'] : ['V', 'mA'], pre = st.avg.on ? 'prom. ' : '';
      return { v: ['lento', 'rápido'], p: [pre + '−' + VS + ' ' + v, VS + ' ' + v], q: [pre + '0', o.ifull + ' ' + i] }[Sim.shownColorMode()];
    };
    const syncColors = Sim.colorPicker(panels, { top: true, ends: colorEnds,
      spot: side => { const g = geos[side]; return g.mode.startsWith('alto') ? [g.X1 + 50, 4 - BAND] : [g.SX + g.SW, 4]; } });
    let colorKey = '';
    const inercia = document.getElementById('inercia'), oIn = document.getElementById('oInercia');
    Sim.snapRange(inercia, { magnet: 0.5 });   // pasa de 0,1 en 0,1 s y se engancha en 0, 0,5, 1… s
    const setTau = () => { st.tau = +inercia.value; oIn.textContent = st.tau ? fmt(st.tau) + ' s' : 'sin'; };
    inercia.addEventListener('input', setTau); setTau();

    // ---------- controles (uno en cada panel, enlazados) ----------
    const place = (side, el, pos) => {
      panels[side].box.querySelector('.sim-layer').appendChild(el);
      panels[side].at(el, () => pos(geos[side]));
      return el;
    };
    // act: la acción del control (los del osciloscopio son de Medir). side: también va en la columna de
    // controles, en la sección de su acción (y mientras la columna se ve, sale del dibujo). hidden(): si no se ve.
    const buttons = [];
    const shownSide = () => Sim.view === 'w' ? 'w' : 'e';
    const refresh = () => {
      buttons.forEach(({ pair, text, label, attrs, hidden, extra }) => {
        pair.forEach((el, k) => {
          const side = k ? 'e' : 'w';
          if (text) el.textContent = text(side);
          if (label) el.setAttribute('aria-label', label(side));
          if (attrs) for (const [a, v] of Object.entries(attrs())) el.setAttribute(a, v);
          if (hidden) el.hidden = hidden();
        });
        if (extra) extra.textContent = text(shownSide());
      });
      pw.replace(); pe.replace();
    };
    Sim.onView(() => refresh());
    const linkedButton = ({ pos, text, label, attrs, hidden, onClick, cls = 'sim-btn small', html, act, side: dup }) => {
      const pair = ['w', 'e'].map(side => {
        const el = document.createElement('button');
        el.type = 'button'; el.className = cls + (dup ? ' side-dup' : '');
        if (act) el.dataset.act = act;
        if (html) el.innerHTML = html;
        el.addEventListener('click', () => { onClick(); refresh(); });
        return place(side, el, pos);
      });
      const extra = dup && Sim.side ? Sim.side.button(act, '', () => { onClick(); refresh(); }) : null;
      buttons.push({ pair, text, label, attrs, hidden, extra });
      return pair;
    };
    const linkedKnob = ({ pos, min, max, step, magnet, value, label, format, onInput, act }) => {
      const ks = {};
      ['w', 'e'].forEach(side => {
        const el = place(side, document.createElement('div'), pos);
        if (act) el.dataset.act = act;
        ks[side] = Sim.knob(el, { min, max, step, magnet, value, label: label(side), format: v => format(v, side),
          onInput: v => { onInput(v); ks[side === 'w' ? 'e' : 'w'].set(v, true); } });
      });
      return ks;
    };
    const unitV = side => side === 'w' ? 'psi' : 'V';   // 1 psi por volt: mismos números
    const val = (v, side, d = 1) => fmt(v, d) + ' ' + unitV(side);
    const fText = f => f >= 1000 ? fmt(f / 1000, 0) + ' kHz' : fmt(f, f < 1 ? 1 : f < 10 && f % 1 ? 1 : 0) + ' Hz';
    const tText = ms => ms >= 1000 ? fmt(ms / 1000, 0) + ' s' : fmt(ms, ms < 1 ? 1 : 0) + ' ms';
    const ohm = R => R >= 1000 ? (R / 1000).toLocaleString('es-MX') + ' kΩ' : R + ' Ω';

    // Generador
    linkedButton({
      pos: g => [g.GX + 44, g.GY + 110], cls: 'sim-power',
      html: Sim.SWITCH,
      label: side => (st.on ? 'Apagar ' : 'Encender ') + (side === 'w' ? 'la bomba' : 'el generador'),
      attrs: () => ({ 'aria-pressed': String(st.on) }),
      onClick: () => { st.on = !st.on; }
    });
    const ICON = {
      sine: 'M2 12C5 1 9 1 12 12S19 23 22 12',
      square: 'M2 17V7h5v10h5V7h5v10h5',
      tri: 'M2 12l5-7 10 14 5-7'
    };
    // Teclas de la forma de onda: la elegida se queda hundida, con su lucecita.
    const WAVEK = ['sine', 'square', 'tri'], waveAt = (g, k) => [g.GX + 125, g.GY + 66 + 44 * k];
    WAVEK.forEach((w, k) => linkedButton({
      pos: g => waveAt(g, k), cls: 'sim-wave',
      label: () => 'Onda ' + ['senoidal', 'cuadrada', 'triangular'][k],
      attrs: () => ({ role: 'radio', 'aria-checked': String(st.wave === w) }),
      onClick: () => { st.wave = w; }
    }));
    linkedKnob({
      pos: g => [g.GX + 245, g.GY + 112], min: 0, max: 40, step: 1, value: st.fi,
      label: () => 'Frecuencia', format: v => fText(freqAt(v)),
      onInput: v => { st.fi = v; }
    });
    linkedKnob({
      pos: g => [g.GX + 365, g.GY + 112], min: 0, max: 10, step: 0.5, magnet: 1, value: st.amp,
      label: () => 'Amplitud', format: val, onInput: v => { st.amp = v; }
    });
    linkedKnob({
      pos: g => [g.GX + 485, g.GY + 112], min: -5, max: 5, step: 0.5, magnet: 1, value: st.off,
      label: side => side === 'w' ? 'Presión base (offset)' : 'Offset', format: val, onInput: v => { st.off = v; }
    });

    // Componentes: tocarlos abre su tarjeta, como en las demás páginas.
    const setR = R => { st.R = R; rebuild(); };
    const rMenu = Sim.resistorMenu({ values: o.rValues, get: () => st.R, set: setR, format: ohm, heat: rh, broken: () => st.rb,
      actions: side => [{ text: side === 'w' ? 'Poner un tramo nuevo' : 'Poner una nueva', primary: true, hidden: () => !st.rb,
        onClick: () => { st.rb = false; rh.reset(); } }] });
    const capMenu = side => ({
      title: side === 'w' ? 'Tanque con membrana' : 'Capacitor',
      rows: [{ label: side === 'w' ? 'Tamaño (capacidad)' : 'Capacidad', values: CVALUES, get: () => st.Cap,
        set: c => { st.Cap = c; }, format: capText },
        ...(o.filter ? [{ actions: [{ text: () => (st.filt ? 'Quitar ' : 'Poner ') + (side === 'w' ? 'el tanque' : 'el capacitor'),
          danger: true, onClick: () => { st.filt = !st.filt; st.vc = 0; rebuild(); refresh(); } }] }] : [])]
    });
    const diodeMenu = k => side => ({
      title: (side === 'w' ? 'Válvula de retención' : 'Diodo 1N4007') + (popt(k).ref ? ' ' + popt(k).ref : ''),
      rows: [Sim.powerRow(dh[k], side, { what: 'led' }),
        ...(popt(k).turn === false ? [] : [{ actions: [{ text: side === 'w' ? 'Girar la válvula' : 'Girar el diodo', onClick: () => { st.drev = !st.drev; } }] }])]
    });
    const KINDS = {
      R: { label: side => side === 'w' ? 'Tramo angosto' : 'Resistencia', menu: () => rMenu },
      L: { label: side => side === 'w' ? 'Rueda' : 'LED',
        menu: () => Sim.ledMenu({ get: () => st.color, set: id => { st.color = id; }, actions: side => [
          { text: side === 'w' ? 'Girar la rueda' : 'Girar el LED', hidden: () => !st.led, onClick: () => { st.rev = !st.rev; } },
          { text: () => (st.led ? 'Quitar ' : 'Poner ') + (side === 'w' ? 'la rueda' : 'el LED'), danger: true,
            onClick: () => { st.led = !st.led; st.probe = st.probe.map((d, j) => snapD(st.pw[j], d)); } }] }) },
      D: { label: side => side === 'w' ? 'Válvula de retención' : 'Diodo', menu: diodeMenu },
      C: { label: side => side === 'w' ? 'Tanque con membrana' : 'Capacitor', menu: () => capMenu }
    };
    const parts = {};
    for (const k in PLACES) {
      const K = KINDS[kind(k)], ref = popt(k).ref, pt = parts[k] = {
        label: side => K.label(side) + (ref ? ' ' + ref : ''), menu: K.menu(k) };
      pt.els = linkedButton({ cls: 'sim-hit', pos: () => PLACES[k], label: pt.label, attrs: () => ({ 'aria-haspopup': 'dialog' }), onClick: () => {} });
      pt.els.forEach((el, i) => el.addEventListener('click', () => Sim.menu.toggle(el, pt.menu(i ? 'e' : 'w'))));
      pt.open = () => pt.els.some(el => Sim.menu.isOpen(el));
      if (Sim.side) Sim.side.part({ anchor: () => pt.els[shownSide() === 'w' ? 0 : 1], menu: () => pt.menu(shownSide()) });
    }

    // Osciloscopio
    linkedKnob({
      pos: g => [g.SX + 500, g.SY + 110], min: 0, max: VDIV.length - 1, step: 1, value: st.vi, act: 'med',
      label: side => side === 'w' ? 'Presión por división' : 'Volts por división',
      format: (v, side) => val(VDIV[v], side) + ' por división', onInput: v => { st.vi = v; }
    });
    linkedKnob({
      pos: g => [g.SX + 500, g.SY + 262], min: 0, max: TDIV.length - 1, step: 1, value: st.ti, act: 'med',
      label: () => 'Tiempo por división', format: v => tText(TDIV[v]) + ' por división',
      onInput: v => { st.ti = v; resetSweep(); }
    });
    // Tecla TRIG (disparo): hundida y con su lucecita mientras la imagen se queda quieta.
    const trigAt = g => [g.SX + 500, g.SY + 392];   // en el renglón de los bornes
    linkedButton({
      pos: trigAt, act: 'med', cls: 'sim-trig',
      label: () => st.trig ? 'Disparo (TRIG): quitarlo; la imagen deja de quedarse quieta' : 'Disparo (TRIG): ponerlo para que la imagen se quede quieta',
      attrs: () => ({ 'aria-pressed': String(st.trig) }),
      onClick: () => { st.trig = !st.trig; }
    });
    // Tecla CH2: prende el canal 2 (su punta sale del borne rosa); con su lucecita mientras se ve.
    const ch2At = g => [g.SX + 270, g.SY + 392];
    linkedButton({
      pos: ch2At, act: 'med', cls: 'sim-trig',
      label: () => st.ch2 ? 'Canal 2 (CH2): apagarlo' : 'Canal 2 (CH2): prenderlo para ver dos señales a la vez',
      attrs: () => ({ 'aria-pressed': String(st.ch2) }),
      onClick: () => { st.ch2 = !st.ch2; }
    });

    // ---------- puntas: la del canal 1 (roja), el caimán de tierra (negro) y la del canal 2 (rosa) ----------
    const frame = k => {
      const [x, y, tx, ty] = D.frameAt(WIRES[st.pw[k]].pts, st.probe[k]), s = st.side[k];
      return { x, y, n: [-ty * s, tx * s] };
    };
    const tipLen = side => side === 'w' ? Sim.PIPE + 12 : 46;
    const tipName = (k, side) => side === 'w'
      ? ['Manguera roja del registrador (canal 1)', 'Manguera negra del registrador', 'Manguera rosa del registrador (canal 2)'][k]
      : ['Punta del canal 1 del osciloscopio', 'Caimán de tierra del osciloscopio', 'Punta del canal 2 del osciloscopio'][k];
    const tipEls = [[], [], []];
    [0, 1, 2].forEach(k => ['w', 'e'].forEach(side => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'sim-clamp';
      el.setAttribute('aria-label', `${tipName(k, side)}: arrástrala o usa las flechas para moverla por el circuito`);
      place(side, el, () => { const f = frame(k), L = tipLen(side) * 0.55; return [f.x + f.n[0] * L, f.y + f.n[1] * L]; });
      tipEls[k].push(el);
      const p = panels[side];
      const toDrawing = e => {
        const r = p.box.getBoundingClientRect();
        return [(e.clientX - r.left - p.ox) / p.scale, (e.clientY - r.top - p.oy) / p.scale];
      };
      el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); el.focus(); e.preventDefault(); });
      el.addEventListener('pointermove', e => {
        if (!el.hasPointerCapture(e.pointerId)) return;
        const [x, y] = toDrawing(e), nw = nearWire(x, y, true);
        st.pw[k] = nw.w; st.probe[k] = snapD(nw.w, nw.d);
        // la punta queda del lado del cable donde está el puntero (adentro o afuera del circuito)
        const [px, py, tx, ty] = D.frameAt(WIRES[nw.w].pts, st.probe[k]), dot = (x - px) * -ty + (y - py) * tx;
        if (Math.hypot(x - px, y - py) > 3) st.side[k] = dot < 0 ? -1 : 1;
        pw.replace(); pe.replace();
      });
      el.addEventListener('keydown', e => {
        const d = { ArrowUp: 12, ArrowRight: 12, ArrowDown: -12, ArrowLeft: -12 }[e.key];
        if (!d) return;
        st.probe[k] = snapD(st.pw[k], st.probe[k] + d); pw.replace(); pe.replace();
        e.preventDefault();
      });
    }));
    buttons.push({ pair: tipEls[2], hidden: () => !st.ch2 });

    // ---------- dibujo ----------
    const pen = (ctx, col) => {
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(12, -2.5); ctx.lineTo(12, 2.5); ctx.closePath();
      ctx.fillStyle = '#9aa6af'; ctx.fill();
      D.roundRect(ctx, 12, -4, 6, 8, 1.5, C.ink);
      D.roundRect(ctx, 17, -7, 8, 14, 2, col, C.ink, 1.5);
      D.roundRect(ctx, 24, -5.5, 18, 11, 3, col, C.ink, 1.5);
      D.roundRect(ctx, 41, -3.5, 6, 7, 1.5, C.ink);
    };
    // Caimán de tierra: dos quijadas que muerden el cable.
    const gator = ctx => {
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.moveTo(1, -1.5); ctx.lineTo(20, -9); ctx.lineTo(20, -2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(1, 1.5); ctx.lineTo(20, 9); ctx.lineTo(20, 2); ctx.closePath(); ctx.fill();
      D.roundRect(ctx, 18, -8, 28, 16, 4, C.ink);
    };
    const hoseTip = (ctx, col) => {
      const P = Sim.PIPE;
      D.roundRect(ctx, P + 2, -7, 10, 14, 2.5, '#9aa6af', col, 2.5);
      D.line(ctx, [[P + 2, 0], [P + 12, 0]], 4, C.water);
    };
    // Papel del registrador (más oscuro en el modo oscuro) y su cuadrícula.
    const paper = () => C.dark ? '#262420' : '#fffdf5';
    const grid = mid => C.dark ? (mid ? '#5c5444' : '#3a362d') : (mid ? '#d6c7a6' : '#ece2cc');
    const tipColor = k => k === 2 ? CH[1].paper : k ? C.neg : RED;
    const tips = () => st.ch2 ? [0, 1, 2] : [0, 1];
    const drawCables = (ctx, g) => tips().forEach(k => {
      const f = frame(k), L = tipLen(g.side), [jx, jy] = g.jacks[k];
      const ax = f.x + f.n[0] * L, ay = f.y + f.n[1] * L;
      const c1 = [ax + f.n[0] * 90, ay + f.n[1] * 90], c2 = [jx, jy + 110];
      if (g.side === 'w') {   // manguera con la raya de su borne, por la misma curva en pasos cortos
        const pts = [];
        for (let s = 0; s <= 24; s++) {
          const t = s / 24, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
          pts.push([a * ax + b * c1[0] + c * c2[0] + d * jx, a * ay + b * c1[1] + c * c2[1] + d * jy]);
        }
        D.hose(ctx, pts, tipColor(k));
      } else {
        ctx.beginPath(); ctx.moveTo(ax, ay);
        ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], jx, jy);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = 6; ctx.strokeStyle = C.card; ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = tipColor(k); ctx.stroke();
      }
    });
    const drawTips = (ctx, g) => tips().forEach(k => {
      const f = frame(k);
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.atan2(f.n[1], f.n[0]));
      if (g.side === 'w') hoseTip(ctx, tipColor(k)); else if (k === 1) gator(ctx); else pen(ctx, tipColor(k));
      ctx.restore();
    });
    // Símbolo del generador en el cable de abajo: círculo con una onda.
    const genSymbol = (ctx, x, y) => {
      ctx.fillStyle = C.card; ctx.fillRect(x - SRC, y - 30, 2 * SRC, 60);
      D.line(ctx, [[x - SRC, y], [x - 26, y]], 4, C.ink); D.line(ctx, [[x + 26, y], [x + SRC, y]], 4, C.ink);
      D.circle(ctx, x, y, 26, C.card, C.ink, 3);
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const u = i / 24; ctx.lineTo(x - 15 + 30 * u, y - 9 * Math.sin(2 * Math.PI * u)); }
      ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.lineCap = 'round'; ctx.stroke();
      D.text(ctx, '+', x - 34, y - 30, C.ink, { size: 18 });
    };
    const drawGen = (ctx, g) => {
      const w = g.side === 'w', x = g.GX, y = g.GY;
      ctx.fillStyle = C.ink; ctx.fillRect(g.PX - 14, g.BOT + 26, 28, 22);   // cuello hacia el circuito
      D.chassis(ctx, x, y, g.GW, g.GH, w, w ? 'BOMBA DE VAIVÉN' : 'GENERADOR DE FUNCIONES');
      WAVEK.forEach((wv, k) => {   // teclas de la forma de onda, con su dibujo
        const [kx, ky] = waveAt(g, k), on = st.wave === wv ? 1 : 0;
        D.key(ctx, kx, ky, 40, 30, on, false, on);
        ctx.save(); ctx.translate(kx - 10, ky - 10 + on * 1.5); ctx.scale(20 / 24, 20 / 24);
        ctx.lineWidth = 2.4; ctx.strokeStyle = '#1b242c'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(new Path2D(ICON[wv]));
        ctx.restore();
      });
      D.led(ctx, x + 84, y + 110, st.level > 0.02 ? 1 : 0);
      const f = freqAt(st.fi), txt = f < 10 ? f.toFixed(2) : f < 100 ? f.toFixed(1) : f.toFixed(0);
      D.lcd(ctx, x + 470, y + 28, 150, 30, txt.padStart(5, ' '), 'Hz');
      const scales = [
        [245, [['0.1', 0], ['1', 0.25], ['10', 0.5], ['100', 0.75], ['1k', 1]], ['frecuencia (Hz)', 'frec. (Hz)', 'Hz'], 8],
        [365, [['0', 0], ['5', 0.5], ['10', 1]], [`amplitud (${unitV(g.side)})`, `ampl. (${unitV(g.side)})`], 12],
        [485, [['-5', 0], ['0', 0.5], ['5', 1]], [`offset (${unitV(g.side)})`, 'offset'], 12]
      ];
      scales.forEach(([dx, labels, cap, ticks]) => {
        D.knobCaption(ctx, cap, x + dx, D.knobScale(ctx, x + dx, y + 112, 36, labels, ticks), 112);   // si no cabe entre las perillas, más corto
      });
    };
    const drawScope = (ctx, g) => {
      const w = g.side === 'w', [sx, sy, sw, sh] = g.scr, cy = sy + sh / 2, vdiv = VDIV[st.vi];
      D.chassis(ctx, g.SX, g.SY, g.SW, g.SH, w, w ? 'REGISTRADOR DE PRESIÓN' : 'OSCILOSCOPIO');
      for (const [at, on] of [[trigAt(g), st.trig], [ch2At(g), st.ch2]]) D.key(ctx, at[0], at[1], 44, 28, on ? 1 : 0, false, on ? 1 : 0);
      { const [tx, ty] = trigAt(g); D.text(ctx, 'TRIG', tx, ty - 14 - Sim.px(14, ctx) * 0.6, C.muted, { size: 14 }); }   // su nombre arriba, impreso en el chasis
      // Pantalla (en el agua, papel cuadriculado)
      const ink = ch => w ? CH[ch].paper : CH[ch].lcd;
      D.roundRect(ctx, sx - 4, sy - 4, sw + 8, sh + 8, 6, w ? paper() : Sim.LCD.bg, C.ink, 2);
      ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) D.line(ctx, [[sx + i * DIV, sy], [sx + i * DIV, sy + sh]], i === 5 ? 1.6 : 1, w ? grid(i === 5) : `rgba(142, 247, 166, ${i === 5 ? 0.35 : 0.14})`, 'butt');
      for (let i = 0; i <= 8; i++) D.line(ctx, [[sx, sy + i * DIV], [sx + sw, sy + i * DIV]], i === 4 ? 1.6 : 1, w ? grid(i === 4) : `rgba(142, 247, 166, ${i === 4 ? 0.35 : 0.14})`, 'butt');
      const Y = v => cy - v / vdiv * DIV;
      for (const ch of st.ch2 ? [1, 0] : [0]) {   // el canal 1 encima
        for (const tr of st.traces) {
          const pts = tr.pts[ch];
          if (pts.length < 2) continue;
          ctx.beginPath();
          pts.forEach(([u, v], i) => { const X = sx + u * sw, yy = Math.max(sy - 10, Math.min(sy + sh + 10, Y(v))); i ? ctx.lineTo(X, yy) : ctx.moveTo(X, yy); });
          ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          if (!w) { ctx.globalAlpha = 0.25 * tr.a; ctx.lineWidth = 6; ctx.strokeStyle = ink(ch); ctx.stroke(); }
          ctx.globalAlpha = tr.a; ctx.lineWidth = w ? 2.2 : 2.4; ctx.strokeStyle = ink(ch); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        const bm = st.beam && st.beam[ch];
        if (bm) {
          const X = sx + bm[0] * sw, yy = Y(bm[1]);
          if (w) {   // la plumilla del registrador
            D.line(ctx, [[X, yy], [X + 14, yy - 22]], 4, C.ink);
            D.circle(ctx, X, yy, 3, ink(ch));
          } else { ctx.globalAlpha = 0.35; D.circle(ctx, X, yy, 7, ink(ch)); ctx.globalAlpha = 1; D.circle(ctx, X, yy, 3.5, '#efe9ff'); }
        }
      }
      ctx.restore();
      // Marca del cero (tierra) a la izquierda.
      const y0 = Math.max(sy, Math.min(sy + sh, cy));
      D.arrow(ctx, sx - 2, y0, 0, 6, w ? C.muted : Sim.LCD.on);
      // Lecturas: escalas y frecuencia arriba; abajo, de cada canal en su color: máximo, promedio y pico a pico.
      // Cada lectura lleva un fondo del color de la pantalla para que la traza no la tape.
      const u = unitV(g.side), opt = { size: 14, font: Sim.MONO, weight: 500 }, txt = w ? C.muted : Sim.LCD.on;
      const read = (t, x, y, align, col = txt) => {
        D.text(ctx, t, -999, -999, col, { ...opt, align });   // solo para fijar la letra y medir
        const tw = ctx.measureText(t).width, x0 = align === 'left' ? x : align === 'right' ? x - tw : x - tw / 2;
        const th = Sim.px(14, ctx) * 1.25;
        ctx.globalAlpha = 0.85; D.roundRect(ctx, x0 - 4, y - th / 2, tw + 8, th, 4, w ? paper() : Sim.LCD.bg); ctx.globalAlpha = 1;
        D.text(ctx, t, x, y, col, { ...opt, align });
        return th;
      };
      const s1 = st.stat && st.stat[0], live = s1 && (s1.mx - s1.mn > 0.05 || (st.ch2 && st.stat[1].mx - st.stat[1].mn > 0.05));
      read(`${fmt(vdiv, vdiv < 1 ? 1 : 0)} ${u}/div`, sx + 8, sy + 14, 'left');
      read(live ? `f ${fText(freqAt(st.fi))}` : 'f --', sx + sw / 2, sy + 14, 'center');
      read(`${tText(TDIV[st.ti])}/div`, sx + sw - 8, sy + 14, 'right');
      const lh = Sim.px(14, ctx) * 1.35;
      (st.ch2 ? [1, 0] : [0]).forEach((ch, row) => {
        const s = st.stat ? st.stat[ch] : { mn: 0, mx: 0, mean: 0 }, y = sy + sh - 14 - (st.ch2 && ch === 1 ? lh : 0);
        const z = v => Math.abs(v) < 0.05 ? 0 : v, col = w ? CH[ch].paper : CH[ch].lcd;
        read(`${st.ch2 ? ch + 1 + ' ' : ''}máx ${fmt(z(s.mx), 1)} ${u}`, sx + 8, y, 'left', col);
        read(`prom ${fmt(z(s.mean), 1)} ${u}`, sx + sw / 2, y, 'center', col);   // promedio: negativo si la señal está abajo del cero
        read(`pp ${fmt(z(s.mx - s.mn), 1)} ${u}`, sx + sw - 8, y, 'right', col);
      });
      // Perillas y bornes
      D.knobCaption(ctx, `${u}/div`, g.SX + 500, D.knobScale(ctx, g.SX + 500, g.SY + 110, 36, VDIV.map((v, i) => [String(fmt(v, v < 1 ? 1 : 0)), i / (VDIV.length - 1)]), VDIV.length - 1));
      D.knobCaption(ctx, ['tiempo/div', 's/div'], g.SX + 500, D.knobScale(ctx, g.SX + 500, g.SY + 262, 36, [['1 ms', 0.1], ['10 ms', 0.4], ['1 s', 1]], TDIV.length - 1), 110);
      g.jacks.forEach(([jx, jy], k2) => D.circle(ctx, jx, jy, 8, tipColor(k2), C.ink, 1.5));
      D.text(ctx, w ? '1' : 'CH1', g.SX + 44, g.SY + 396, C.muted, { size: 14, align: 'right' });
      D.text(ctx, w ? '2' : 'CH2', g.SX + 194, g.SY + 396, C.muted, { size: 14, align: 'right' });
    };

    // ---------- componentes ----------
    // Capacitor: tanque con una membrana elástica que no deja pasar el agua: se estira según el voltaje (la
    // presión) que aguanta y empuja de regreso. Su tamaño crece con la capacidad. o: 'h' (la corriente entra por
    // la izquierda) o 'v' (entra por arriba). En la electricidad, dos placas; desde 1 µF, electrolítico: la placa −
    // curva y un + del lado positivo.
    const capRev = () => st.Cap >= POL && st.vc < -1;   // electrolítico al revés (más de 1 V)
    const tank = (ctx, x, y, o) => {
      const rc = rcOf(st.Cap), bulge = Math.max(-1, Math.min(1, st.vc / 10)) * 0.8 * rc;
      ctx.save(); ctx.translate(x, y); if (o === 'v') ctx.rotate(Math.PI / 2);
      D.circle(ctx, 0, 0, rc + 5, C.pipe);
      D.circle(ctx, 0, 0, rc, C['water-soft']);
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, rc, 0, Math.PI * 2); ctx.clip();
      // del lado que empuja el agua está más apretada: un poco más oscura según la presión
      const sgn = bulge < 0 ? -1 : 1;
      ctx.globalAlpha = 0.25 * Math.abs(bulge) / (0.8 * rc);
      ctx.beginPath(); ctx.moveTo(0, -rc); ctx.quadraticCurveTo(2 * bulge, 0, 0, rc);
      ctx.lineTo(-sgn * rc, rc); ctx.lineTo(-sgn * rc, -rc); ctx.closePath(); ctx.fillStyle = C.water; ctx.fill();
      ctx.globalAlpha = 1; ctx.restore();
      ctx.beginPath(); ctx.moveTo(0, -rc); ctx.quadraticCurveTo(2 * bulge, 0, 0, rc);
      ctx.lineWidth = 4; ctx.strokeStyle = capRev() ? C.danger : C.ink; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
    };
    const capSym = (ctx, x, y, o) => {
      const ph = 16, pol = st.Cap >= POL, v = o === 'v';
      ctx.save(); ctx.translate(x, y); if (v) ctx.rotate(Math.PI / 2);
      ctx.fillStyle = C.card; ctx.fillRect(-9, -ph - 2, 18, 2 * ph + 4);
      D.line(ctx, [[-6, -ph], [-6, ph]], 4.5, C.ink, 'butt');
      if (pol) { ctx.beginPath(); ctx.moveTo(10, -ph); ctx.quadraticCurveTo(2, 0, 10, ph); ctx.lineWidth = 4.5; ctx.strokeStyle = C.ink; ctx.stroke(); }
      else D.line(ctx, [[6, -ph], [6, ph]], 4.5, C.ink, 'butt');
      ctx.restore();
      // del lado + (el de la izquierda o el de arriba)
      const at = (a, b) => v ? [x - b, y + a] : [x + a, y + b];
      if (pol) { const [px, py] = at(-17, -ph - 2); D.text(ctx, '+', px, py, C.ink, { size: 15 }); }
      // la carga que se junta en cada placa
      const n = Math.round(Math.min(1, Math.abs(st.vc) / 10) * 3), sg = st.vc >= 0;
      for (let k = 0; k < n; k++) {
        const b = -ph + 6 + (2 * ph - 12) * (n > 1 ? k / (n - 1) : 0.5);
        const [ax, ay] = at(-17, b), [bx, by] = at(18, b);
        D.text(ctx, sg ? '+' : '−', ax, ay, sg ? RED : C.neg, { size: 14 });
        D.text(ctx, sg ? '−' : '+', bx, by, sg ? C.neg : RED, { size: 14 });
      }
    };
    // Diodo: triángulo con su raya; conduce en el sentido del triángulo. s = 1 hacia la derecha.
    const diodeSym = (ctx, x, y, s) => {
      ctx.fillStyle = C.card; ctx.fillRect(x - 26, y - 18, 52, 36);
      D.line(ctx, [[x - 26, y], [x - 12, y]], 4, C.ink); D.line(ctx, [[x + 12, y], [x + 26, y]], 4, C.ink);
      ctx.beginPath(); ctx.moveTo(x - 12 * s, y - 13); ctx.lineTo(x - 12 * s, y + 13); ctx.lineTo(x + 11 * s, y); ctx.closePath();
      ctx.fillStyle = C.ink; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = C.ink; ctx.lineJoin = 'miter'; ctx.stroke();
      D.line(ctx, [[x + 12 * s, y - 14], [x + 12 * s, y + 14]], 3.5, C.ink, 'butt');
    };
    // Válvula de retención (el diodo en el agua): una compuerta con bisagra arriba que un resorte cierra contra
    // su asiento; la abre el agua que empuja en su sentido con más de 0,7 psi, y la presión al revés la aprieta
    // más. La flecha del cuerpo dice hacia dónde deja pasar. open de 0 a 1.
    const checkValve = (ctx, x, y, s, open) => {
      D.circle(ctx, x, y, 26, C.metal, C.ink, 2.5);
      D.circle(ctx, x, y, 20, C['water-soft']);
      const xs = x - 7 * s;   // asiento, del lado por donde entra
      D.line(ctx, [[xs, y - 20], [xs, y - 9]], 5, C.ink, 'butt'); D.line(ctx, [[xs, y + 9], [xs, y + 20]], 5, C.ink, 'butt');
      const a = open * 1.2, hx = xs + 4 * s, hy = y - 12;
      D.line(ctx, [[hx, hy], [hx + 24 * Math.sin(a) * s, hy + 24 * Math.cos(a)]], 5, C.ink);
      D.circle(ctx, hx, hy, 3, C.ink);
      D.arrow(ctx, x, y - 38, s > 0 ? 0 : Math.PI, 8, C.muted);
    };
    const dirOf = k => (popt(k).dir || 1) * (st.drev ? -1 : 1);
    // Un componente parado (en la rama de la derecha o la del capacitor): se dibuja girado un cuarto de vuelta.
    const upright = (ctx, x, y, fn) => { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 2); fn(); ctx.restore(); };

    // Etiquetas «nombre valor» (en azul mientras su tarjeta está abierta) y su estado en una pastilla: las de
    // los componentes acostados en un renglón arriba (en el agua más arriba, sobre la flecha de la rueda o de la
    // válvula) o abajo ('below'); las de los parados a un lado, adentro del circuito (normalmente a su izquierda:
    // a la derecha está la orilla del panel). Su estado solo si es uno todo el tiempo (con la señal yendo y
    // viniendo rápido conduce a ratos: sin pastilla).
    const dState = (k, w) => st.dOn[k] > 0.98 ? (w ? 'abierta' : 'conduce') : st.dOn[k] < 0.02 && st.level > 0.02 ? (w ? 'cerrada' : 'no conduce') : '';
    const capOn = () => !o.filter || st.filt;
    const tagOf = (k, w) => {
      const K = kind(k), ref = popt(k).ref;
      if (K === 'R') return { name: [w ? 'tramo angosto' : 'resistencia', w ? 'tramo' : 'R', ''], value: ohm(st.R), sel: parts[k].open(),
        danger: st.rb, state: st.rb ? (w ? 'reventó' : 'quemada') : '' };
      if (K === 'L') {
        const shut = w && clamp01((st.shut - 0.5) * 3) > 0.5;   // con la presión al revés: compuerta cerrada
        return st.led ? { name: w ? 'rueda' : 'LED', value: w ? st.color.replace(/o$/, 'a') : st.color, sel: parts[k].open(),
          danger: shut || st.rev, state: shut ? 'compuerta cerrada' : st.rev ? 'al revés' : '' } : { name: w ? 'sin rueda' : 'sin LED' };
      }
      if (K === 'D') return { name: ref || [w ? 'válvula de retención' : 'diodo', w ? 'válvula' : 'D'],
        value: w ? '0,7 psi' : '1N4007', sel: parts[k].open(), state: dState(k, w) };
      if (!capOn()) return { name: w ? 'sin tanque' : 'sin capacitor' };
      return { name: [w ? 'tanque con membrana' : 'capacitor', w ? 'tanque' : 'C'], value: capText(st.Cap), sel: parts[k].open(),
        danger: capRev(), state: capRev() ? 'al revés' : '' };
    };
    const tags = (ctx, g, w) => {
      const rows = {};
      for (const k in PLACES) {
        const [x, y, or] = PLACES[k], t = tagOf(k, w), tg = popt(k).tag;
        if (or === 'h') { const ry = tg === 'below' ? y + 40 : g.TOP - (w ? 62 : 42); (rows[ry] = rows[ry] || []).push({ x, ...t }); continue; }
        const r = kind(k) === 'C' ? rcOf(st.Cap) + 12 : 30, right = tg === 'right', xr = right ? x + r : x - r;
        const room = right ? popt(k).lim(st) - xr : xr - popt(k).lim(st);
        const nm = [].concat(t.name), pick = nm.find(n => D.tagWidth(ctx, n, t.value, t.state) <= room) ?? nm[nm.length - 1];
        D.tag(ctx, right ? xr : xr - D.tagWidth(ctx, pick, t.value, t.state), y, pick, t.value, { ...t, align: 'left' });
      }
      for (const ry in rows) D.tagRow(ctx, +ry, rows[ry], g.X0 + (w ? 50 : 80), g.X1 + 30);   // sin llegar al letrero Agua / Electricidad
    };
    // Contorno de lo seleccionado y, si falta el LED o el capacitor, su lugar punteado (se toca para ponerlo).
    const BOX = { R: [108, 52], L: [80, 80], D: [80, 80], C: [76, 76] };
    const marks = (ctx, g) => {
      const dashed = (x, y) => { ctx.setLineDash([5, 5]); D.roundRect(ctx, x - 30, y - 30, 60, 60, 12, null, C.muted, 2); ctx.setLineDash([]); };
      for (const k in PLACES) {
        const K = kind(k), [x, y] = PLACES[k];
        if ((K === 'L' && !st.led) || (K === 'C' && !capOn())) dashed(x, y);
      }
      for (const k in PLACES) {
        const [x, y, or] = PLACES[k], [bw, bh] = BOX[kind(k)], [ww, hh] = or === 'v' ? [bh, bw] : [bw, bh];
        D.select(ctx, x - ww / 2, y - hh / 2, ww, hh, Sim.fadeSel('o' + k, parts[k].open()));
      }
    };
    // La mesa de trabajo: en vertical, el generador y el osciloscopio van en una franja de otro tono abajo.
    const drawDesk = (ctx, g) => {
      if (!g.mode.startsWith('alto')) return;
      ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = C.bg; ctx.fillRect(-2000, g.GY - 18, 4000, 4000); ctx.restore();
    };
    const dot = (ctx, x, y) => D.circle(ctx, x, y, 5, C.ink);
    const each = (K, fn) => { for (const k in PLACES) if (kind(k) === K) fn(k, ...PLACES[k]); };
    function drawWater() {
      const g = geos.w, ctx = pw.begin();
      drawDesk(ctx, g);
      drawCables(ctx, g);   // las mangueras pasan siempre por debajo del dibujo
      branches.forEach(b => D.pipe(ctx, b.pts));
      each('R', (k, rx, ry, ro) => { if (ro === 'h') D.narrow(ctx, rx, ry, HN()); else upright(ctx, rx, ry, () => D.narrow(ctx, 0, 0, HN())); });
      branches.forEach(b => b.s.draw(ctx, st.q[b.br] || 0, st.flow[b.br] || 0));
      if (st.rb) each('R', (k, rx, ry) => D.burstPipe(ctx, rx, ry, HN(), st.rbT, true, 0, ''));
      if (st.led) each('L', (k, x, y) => D.wheel(ctx, x, y, { angle: st.wheel, omega: st.wheelOm, rev: st.rev, tint: `rgb(${Sim.led(st.color).rgb})`, tag: false }));
      each('D', (k, x, y) => checkValve(ctx, x, y, dirOf(k), st.dOn[k]));
      if (capOn()) each('C', (k, x, y, or) => tank(ctx, x, y, or));
      tags(ctx, g, true);
      marks(ctx, g);
      drawScope(ctx, g);
      drawGen(ctx, g);
      D.pump(ctx, g.PX, g.BOT, st.rotor, st.rotorOm);
      drawTips(ctx, g);
    }
    function drawElectric() {
      const g = geos.e, ctx = pe.begin();
      drawDesk(ctx, g);
      drawCables(ctx, g);   // los cables pasan siempre por debajo del dibujo
      branches.forEach(b => D.wire(ctx, b.pts));
      branches.forEach(b => D.flow(ctx, b.pts, st.q[b.br] || 0, C.charge, { gap: 30, r: 4.5 }));
      if (o.dots) o.dots(st).forEach(([x, y]) => dot(ctx, x, y));   // donde se unen los cables
      each('R', (k, rx, ry, ro) => {
        D.heatGlow(ctx, rx, ry, rh.glow);
        if (ro === 'h') D.resistor(ctx, rx, ry); else upright(ctx, rx, ry, () => D.resistor(ctx, 0, 0));
        if (st.rb) D.burntResistor(ctx, rx, ry, st.rbT, '');
      });
      if (st.led) each('L', (k, x, y) => D.ledSymbol(ctx, x, y, { I: st.glow, rev: st.rev, rgb: Sim.led(st.color).rgb, tag: false }));
      each('D', (k, x, y) => diodeSym(ctx, x, y, dirOf(k)));
      if (capOn()) each('C', (k, x, y, or) => capSym(ctx, x, y, or));
      tags(ctx, g, false);
      marks(ctx, g);
      drawScope(ctx, g);
      drawGen(ctx, g);
      genSymbol(ctx, g.PX, g.BOT);
      drawTips(ctx, g);
    }

    Sim.oscNow = { st, rh, dh };   // para probar (como Sim.benchNow en el banco)
    refresh();

    Sim.run(dt => {
      advance(dt);
      const ck = String(st.avg.on);
      if (ck !== colorKey) { colorKey = ck; syncColors(); }
      updateScope();
      drawWater(); drawElectric();
    });
    return { st };
  };
  // Lo que usan las páginas para describir su circuito.
  Object.assign(Sim.scope, { ...CIRC, MIDY, SRC, PATH, VF, RD, rcOf });
})();
