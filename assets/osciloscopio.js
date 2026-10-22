// Generador de funciones y osciloscopio (Sim.scope), lo común a las páginas del osciloscopio. En el agua, el
// generador es una bomba que cambia de sentido (bomba de vaivén) y el osciloscopio es un registrador que dibuja
// la presión en un papel. No usa banco.js porque aquí la fuente no es fija: la señal cambia más rápido de lo que
// se dibuja. Cada cuadro se integra el circuito en pasos pequeños (con la solución exacta del capacitor) y se
// guarda lo que marca cada canal; el osciloscopio dibuja de lo guardado.
//
// Cada página da su circuito (como banco.js con Sim.bench):
//   preset    los valores del taller al abrir: generador (wave, fi, amp, off), R, Cap, filt, el osciloscopio (vd:
//             volts por división de cada canal, td: ms por división, ch2: si el canal 2 empieza prendido, pos: dónde
//             queda el cero de cada canal, en divisiones, trig: { src: 0 o 1, level: V }) y las puntas (probe: canal
//             1, caimán de tierra, canal 2; pw: en qué cable va cada una, 0 si se omite; side: de qué lado del
//             cable, −1 afuera y 1 adentro)
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
  const RED = '#d6392b';
  // Color de cada canal, como en el osciloscopio y el generador del taller: el 1 amarillo y el 2 azul. En la
  // pantalla (negra) el color claro; en el papel del registrador y en los cables, uno más oscuro que se lee sobre
  // blanco; key: la tapa de su tecla CH MENU.
  const CH = [{ lcd: '#f5d33a', paper: ['#9a7400', '#e3bf3c'], cable: '#d9ad00', key: '#f2cf3a' },
    { lcd: '#4cc9f0', paper: ['#1f74ad', '#5ab8e8'], cable: '#2f9cc6', key: '#6fcdf2' }];
  // Frecuencias de 0.1 Hz a 1 kHz, diez pasos por década.
  const E10 = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
  const freqAt = i => E10[i % 10] * Math.pow(10, Math.floor(i / 10) - 1);
  // Escalas como las del osciloscopio del taller: volts por división en 1-2-5 (2 mV a 5 V) y tiempo por
  // división en 1-2,5-5 (0,1 ms a 1 s; en ms).
  const VDIV = [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
  const TDIV = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000];
  const nearest = (list, v) => list.reduce((b, x, i) => Math.abs(Math.log(x / v)) < Math.abs(Math.log(list[b] / v)) ? i : b, 0);
  // Acoplamiento CA: la entrada pasa por un capacitor que, con la resistencia de entrada (1 MΩ), corta lo que va
  // abajo de unos 10 Hz: τ = 1 / (2π · 10 Hz).
  const AC_TAU = 1 / (2 * Math.PI * 10);
  // Medidas automáticas (MEASURE): cada casilla, una medida de un canal.
  const MEAS = { freq: 'Frecuencia', period: 'Periodo', mean: 'Media', pp: 'Pico-pico', max: 'Máx.', min: 'Mín.', rms: 'RMS' };
  const MEAS_SHORT = { freq: 'Frec.', period: 'Periodo', mean: 'Media', pp: 'Pk-Pk', max: 'Máx.', min: 'Mín.', rms: 'RMS' };
  const MEAS_ALL = [0, 1].flatMap(c => Object.keys(MEAS).map(t => [c, t])).concat([null]);
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
  // Los tres acomodos del osciloscopio, en coordenadas de su chasis (w × h). wide: el completo, como el del
  // taller: la pantalla con sus cinco botones de menú a la izquierda y los mandos a la derecha, en sus secciones
  // VERTICAL, HORIZONTAL y TRIGGER. tall: el mismo, de frente en la mesa angosta (celular o los dos paneles): los
  // mandos abajo de la pantalla. compact: en la mesa angosta junto al generador, la pantalla y las tres perillas
  // grandes. frame: el marco de la pantalla; scr: la cuadrícula (10 × 8 divisiones de div); menu: la columna del
  // menú (arriba su título, en un renglón de alto top, y cinco casillas); keys: [x, y, ancho, alto] de cada tecla;
  // knobs: [x, y, diámetro]; labels: [rótulos, x, y, ancho]; secs: [x, y, ancho, alto, nombres]; bnc: las entradas
  // CH1 y CH2; gnd: el borne de tierra; fold: la tecla para ponerlo de frente o regresarlo.
  const POS = ['POSITION', 'POS.'], VDL = ['VOLTS/DIV', 'V/DIV'], SDL = ['SEC/DIV', 'S/DIV'];
  const LAYOUTS = {
    wide: {
      w: 974, h: 420, div: 34, frame: [16, 40, 468, 332], scr: [22, 70, 340, 272], menu: [368, 46, 110, 320], top: 24,
      bezel: [500, 34, 28],
      keys: { meas: [575, 58, 96, 34], auto: [798, 58, 92, 34], run: [906, 58, 92, 34], ch0: [575, 212, 96, 34],
        ch1: [685, 212, 96, 34], trig: [906, 212, 96, 34], half: [906, 256, 96, 34] },
      knobs: { pos0: [575, 164, 42], pos1: [685, 164, 42], hpos: [798, 164, 42], lvl: [906, 164, 42],
        vd0: [575, 292, 62], vd1: [685, 292, 62], td: [798, 292, 62] },
      secs: [[520, 92, 220, 316, ['VERTICAL', 'VERT.']], [748, 92, 100, 316, ['HORIZONTAL', 'HORIZ.', 'H']],
        [856, 92, 100, 316, ['TRIGGER', 'TRIG.', 'T']]],
      labels: [[POS, 630, 130, 210], [POS, 798, 130, 94], [['LEVEL'], 906, 130, 94], [VDL, 630, 250, 210], [SDL, 798, 250, 94]],
      bnc: [[575, 384], [685, 384]], bncLab: 352, gnd: [906, 384]
    },
    tall: {
      w: 600, h: 740, div: 36, frame: [12, 44, 508, 352], scr: [18, 76, 360, 288], menu: [384, 50, 130, 340], top: 26,
      bezel: [552, 40, 30],
      keys: { meas: [84, 426, 120, 40], auto: [376, 426, 120, 40], run: [520, 426, 120, 40], ch0: [84, 586, 120, 40],
        ch1: [228, 586, 120, 40], trig: [520, 586, 124, 40], half: [520, 638, 124, 40] },
      knobs: { pos0: [84, 532, 46], pos1: [228, 532, 46], hpos: [376, 532, 46], lvl: [520, 532, 46],
        vd0: [62, 676, 62], vd1: [206, 676, 62], td: [376, 676, 62] },
      secs: [[12, 456, 288, 276, ['VERTICAL', 'VERT.']], [308, 456, 136, 276, ['HORIZONTAL', 'HORIZ.', 'H']],
        [452, 456, 136, 276, ['TRIGGER', 'TRIG.', 'T']]],
      labels: [[POS, 156, 498, 280], [POS, 376, 498, 130], [['LEVEL'], 520, 498, 130], [VDL, 156, 628, 280], [SDL, 376, 628, 130]],
      bnc: [[124, 676], [268, 676]], gnd: [520, 702], fold: [568, 22]
    },
    compact: {
      w: 600, h: 420, div: 32, frame: [12, 40, 448, 316], scr: [18, 70, 320, 256], menu: [344, 46, 110, 304], top: 24,
      keys: {}, knobs: { vd0: [530, 94, 56], vd1: [530, 192, 56], td: [530, 290, 56] },
      secs: [], labels: [[VDL, 530, 50, 124], [VDL, 530, 148, 124], [SDL, 530, 246, 124]],
      bnc: [[50, 392], [160, 392]], bncSide: true, gnd: [270, 392], fold: [568, 22]
    }
  };
  // El acomodo puesto en el lugar del chasis (x, y): todo en coordenadas del dibujo.
  const placeLayout = (L, x, y) => {
    const mv = a => a && [a[0] + x, a[1] + y, ...a.slice(2)], obj = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, mv(v)]));
    return { ...L, x, y, frame: mv(L.frame), scr: mv(L.scr), menu: mv(L.menu), keys: obj(L.keys), knobs: obj(L.knobs),
      secs: L.secs.map(mv), labels: L.labels.map(([t, lx, ly, lw]) => [t, lx + x, ly + y, lw]), bnc: L.bnc.map(mv),
      gnd: mv(L.gnd), fold: mv(L.fold), bezel: L.bezel && [L.bezel[0] + x, ...L.bezel.slice(1)], bncLab: L.bncLab && L.bncLab + y };
  };

  Sim.scope = o => {
    // Acomodos del dibujo (el modo dice cuál y qué acomodo del osciloscopio lleva):
    //   alto (celular, o los dos paneles en la PC): el circuito arriba y en la mesa el generador y el osciloscopio
    //     compacto; de frente (st.front), el generador se guarda y el osciloscopio ocupa la mesa con todos sus mandos.
    //   pc (un solo panel en la PC): el generador a la derecha del circuito y abajo el osciloscopio completo.
    //   ancho (el celular acostado): el osciloscopio compacto a la derecha del circuito y el generador; de frente se
    //     ve solo él, completo y grande (solo: el mismo dibujo, recortado alrededor del osciloscopio).
    const BAND = 110;   // en el alto, franja arriba del circuito para el selector del color de las partículas
    const size = (w, h) => {
      const fit = (W, H) => Math.min(w / W, h / H), altoH = st.front ? 1060 : 1000;
      const pc = fit(1200, 840), cands = [];
      if (pc >= 0.62) cands.push({ s: pc * 1.15, r: [1200, 840, 0, 'pc-wide', 0] });
      else if (st.front) cands.push({ s: fit(1010, 500), r: [1010, 500, 622, 'solo-wide', 90] });
      else cands.push({ s: fit(1260, 570), r: [1260, 570, 0, 'ancho-compact', 0] });
      cands.push({ s: fit(640, altoH + BAND), r: [640, altoH + BAND, 0, 'alto-' + (st.front ? 'tall' : 'compact'), -BAND] });
      const best = cands.reduce((a, b) => b.s > a.s ? b : a), r = [...best.r];
      if (Math.min(w / r[0], h / r[1]) < 0.75) r[3] += '-c';
      return r;
    };
    const geometry = (side, mode) => {
      const g = { side, mode, ...CIRC, GX: 40, GY: CIRC.BOT + 46, GW: 560, GH: 200 };
      g.alto = mode.startsWith('alto');
      g.solo = mode.startsWith('solo');
      g.pc = mode.startsWith('pc');
      g.lay = mode.split('-')[1];
      [g.SX, g.SY] = g.alto ? (g.lay === 'tall' ? [20, 310] : [20, 556]) : g.pc ? [113, 400] : [640, 150];
      if (g.pc) { g.GX = 620; g.GY = 160; }
      g.L = placeLayout(LAYOUTS[g.lay], g.SX, g.SY);
      if (g.solo) g.L.fold = [g.SX + g.L.w - 32, g.SY + 22];   // para regresarlo a la mesa
      g.SW = g.L.w; g.SH = g.L.h;
      g.gen = g.lay !== 'tall' && !g.solo;   // de frente, el generador se guarda
      g.MIDY = (g.TOP + g.BOT) / 2;
      g.jacks = [g.L.bnc[0], g.L.gnd, g.L.bnc[1]];
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
      ph: 0, T: 0, probe: [300, 980, 640], pw: [0, 0, 0], side: [-1, -1, 1], last: [0, 0],
      q: {}, flow: {}, dOn: {},
      rotor: 0, rotorOm: 0, wheel: 0, wheelOm: 0, glow: 0, shut: 0, shake: 0,
      frames: [], traces: [], beam: null, m: [null, null], status: 'auto' };
    const { vd = [1, 1], td = 1, ch2 = false, pos = [0, 0], trig = {}, ...p0 } = o.preset;
    Object.assign(st, p0, { probe: [...p0.probe], pw: p0.pw ? [...p0.pw] : [0, 0, 0], side: [...p0.side] });
    // El osciloscopio: cada canal (prendido, volts por división, dónde queda su cero en divisiones, acoplamiento
    // CC · CA · Tierra e invertido), el tiempo por división, dónde queda el disparo (hpos: divisiones a la derecha
    // del centro), el disparo (fuente, pendiente, modo Auto · Normal y nivel en V), RUN/STOP, el menú que se ve en
    // la pantalla (meas, ch0, ch1, trig o ninguno), las cinco medidas y si está de frente (st.front).
    Object.assign(st, {
      chs: [0, 1].map(k => ({ on: k === 0 || ch2, vi: nearest(VDIV, vd[k]), pos: pos[k], cpl: 'dc', inv: false })),
      ti: nearest(TDIV, td), hpos: 0, trg: { src: 0, slope: 1, mode: 'auto', level: 0, ...trig }, run: true,
      menu: 'meas', meas: [[0, 'pp'], [0, 'mean'], [0, 'max'], [1, 'pp'], [1, 'mean']], front: false,
      hp: [{ x: 0, y: 0 }, { x: 0, y: 0 }] });
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
    // Medidas de un canal entre t0 y t1, como las del MEASURE del osciloscopio: máximo, mínimo, media, RMS y
    // frecuencia (con los cruces de subida por la mitad de la señal, con algo de histéresis; sin dos cruces no hay).
    const measure = (ch, t0, t1) => {
      let mn = Infinity, mx = -Infinity, s1 = 0, s2 = 0, dur = 0;
      const each = fn => {
        for (let i = frameAt(t0) ?? frames.length; i < frames.length && frames[i].t0 < t1; i++) {
          const F = frames[i], v = ch ? F.b : F.a;
          if (!v) continue;
          const k0 = Math.max(0, Math.ceil((t0 - F.t0) / F.h)), k1 = Math.min(F.n, Math.floor((t1 - F.t0) / F.h));
          for (let k = k0; k <= k1; k++) fn(v, k, F);
        }
      };
      each((v, k, F) => {
        const x = v[k];
        if (x < mn) mn = x; if (x > mx) mx = x;
        if (k > 0 && F.t0 + (k - 1) * F.h >= t0) { s1 += (v[k - 1] + x) / 2 * F.h; s2 += (v[k - 1] * v[k - 1] + x * x) / 2 * F.h; dur += F.h; }
      });
      if (!dur) return null;
      const mid = (mn + mx) / 2, hy = 0.1 * (mx - mn), ups = [];
      let low = false;
      if (mx - mn > 0.01) each((v, k, F) => {
        if (v[k] < mid - hy) low = true;
        else if (low && v[k] >= mid && k > 0) { low = false; ups.push(F.t0 + (k - 1 + (mid - v[k - 1]) / (v[k] - v[k - 1] || 1)) * F.h); }
      });
      const freq = ups.length > 1 ? (ups.length - 1) / (ups[ups.length - 1] - ups[0]) : null;
      return { mn, mx, mean: s1 / dur, rms: Math.sqrt(s2 / dur), pp: mx - mn, freq, period: freq ? 1 / freq : null };
    };
    const measValue = (m, t) => !m ? null : { max: m.mx, min: m.mn }[t] ?? m[t];

    // Barrido: el haz cruza la pantalla en 10 divisiones. El disparo, como en el osciloscopio del taller: espera a
    // que la señal de su fuente cruce el nivel con su pendiente (con algo de histéresis: antes tiene que pasar al
    // otro lado del nivel) y la pone en el punto de disparo, a la mitad de la pantalla (o donde lo mueva la
    // perilla POSITION de HORIZONTAL): se ve lo que pasó antes del disparo y lo que viene después. En Auto, si no
    // hay disparo en un rato, barre de todos modos (la imagen corre); en Normal se queda con la última. RUN/STOP
    // congela la imagen.
    const sweepS = () => 10 * TDIV[st.ti] / 1000;
    const preS = () => (5 + st.hpos) * TDIV[st.ti] / 1000;
    const sw = st.sweep = { state: 'armed', from: 0, scanned: 0, since: 0, ts: 0, trig: false, low: false, done: [] };
    const rearm = t => Object.assign(sw, { state: 'armed', from: t, scanned: t, since: st.T, low: false });
    const resetSweep = () => { rearm(st.T); if (st.run) sw.done = []; };   // detenido, se queda lo guardado (con la escala nueva)
    // El primer cruce del nivel entre t0 y t1 en la fuente del disparo (o null).
    const scan = (t0, t1) => {
      const T = st.trg, ch = T.src, sg = T.slope, lv = sg * T.level, hy = 0.1 * VDIV[st.chs[ch].vi];
      for (let i = frameAt(t0) ?? frames.length; i < frames.length; i++) {
        const F = frames[i], v = ch ? F.b : F.a;
        if (!v) continue;
        const k0 = Math.max(1, Math.ceil((t0 - F.t0) / F.h)), k1 = Math.min(F.n, Math.floor((t1 - F.t0) / F.h));
        for (let k = k0; k <= k1; k++) {
          const x = sg * v[k];
          if (x < lv - hy) sw.low = true;
          else if (sw.low && x >= lv) {
            const x0 = sg * v[k - 1], u = x0 < lv ? (lv - x0) / (x - x0) : 1;
            sw.low = false;
            return F.t0 + (k - 1 + u) * F.h;
          }
        }
      }
      return null;
    };
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
    const trace = (ts, S, tA, tB, a) => ({ pts: [0, 1].map(ch => st.chs[ch].on ? build(ch, ts, S, tA, tB) : []), a });
    let measKey = '';
    const updateScope = () => {
      const S = sweepS(), pre = preS(), autoT = Math.max(0.15, 1.5 * S);
      if (st.run) {
        if (sw.state === 'armed' && sw.scanned < st.T - 3 * S - 0.5) sw.scanned = st.T - 3 * S - 0.5;   // no buscar de más
        for (let n = 0; n < 20; n++) {
          if (sw.state === 'armed') {
            const t = scan(Math.max(sw.from, sw.scanned), st.T);
            sw.scanned = st.T;
            if (t !== null) Object.assign(sw, { state: 'post', ts: t - pre, trig: true });
            else if (st.trg.mode === 'auto' && st.T - sw.since > autoT) Object.assign(sw, { state: 'post', ts: S > 0.3 ? st.T : st.T - S, trig: false });
            else break;
          }
          if (st.T < sw.ts + S) break;
          sw.done.push({ ts: sw.ts, trig: sw.trig }); if (sw.done.length > 4) sw.done.shift();
          rearm(sw.ts + S);
        }
      }
      st.traces = []; st.beam = null;
      const last = sw.done[sw.done.length - 1];
      if (!st.run) { if (last) st.traces.push(trace(last.ts, S, last.ts, last.ts + S, 1)); }
      else if (S > 0.3) {   // barrido lento: se ve el haz avanzar; lo que falta del barrido anterior queda tenue
        if (sw.state === 'post') {
          const u = Math.max(0, (st.T - sw.ts) / S);
          if (last && u < 1) st.traces.push(trace(last.ts, S, last.ts + u * S, last.ts + S, 0.3));
          const tr = trace(sw.ts, S, sw.ts, st.T, 1);
          st.traces.push(tr);
          st.beam = tr.pts.map(p => p.length ? p[p.length - 1] : null);
        } else if (last) st.traces.push(trace(last.ts, S, last.ts, last.ts + S, 1));
      } else sw.done.forEach((d, k) => st.traces.push(trace(d.ts, S, d.ts, d.ts + S, [0.18, 0.3, 0.5, 1][k + 4 - sw.done.length])));
      // Estado (arriba en la pantalla) y medidas del último barrido completo.
      st.status = !st.run ? 'stop' : sw.state === 'armed' && st.trg.mode === 'normal' && st.T - sw.since > autoT ? 'armed'
        : (last ? last.trig : sw.trig) ? 'trig' : 'auto';
      const key = last ? last.ts + '/' + S : '';
      if (key !== measKey) {
        measKey = key; st.m = last ? [0, 1].map(ch => measure(ch, last.ts, last.ts + S)) : [null, null];
        // la frecuencia del disparo la cuenta aparte (abajo a la derecha de la pantalla): en el último segundo
        const mf = measure(st.trg.src, st.T - 1, st.T); st.tf = mf && mf.freq;
      }
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
      // Lo que entra a cada canal (contra el caimán de tierra) según su acoplamiento: CC tal cual; CA por su
      // capacitor de entrada (un filtro pasa altas, con su solución exacta si la señal va en línea recta entre dos
      // pasos; se carga aunque no se use, como el de verdad); Tierra, 0. Invertido, al revés.
      const ex = Math.exp(-h / AC_TAU), kx = AC_TAU / h * (1 - ex);
      const input = (c, x) => {
        const s = st.chs[c], f = st.hp[c];
        f.y = f.y * ex + (x - f.x) * kx; f.x = x;
        const v = s.cpl === 'gnd' ? 0 : s.cpl === 'ac' ? f.y : x;
        return s.inv ? -v : v;
      };
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
        a[k + 1] = input(0, vOn(at[0].w, at[0].d, m.v, at[0].sp) - vg); b[k + 1] = input(1, vOn(at[2].w, at[2].d, m.v, at[2].sp) - vg);
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
    let refreshFn = null;   // refresh, cuando ya existe: al cambiar de acomodo, los controles cambian de lugar y tamaño
    const relayout = (side, mode) => {
      geos[side] = geometry(side, mode);
      Sim.compact = mode.endsWith('-c');
      if (refreshFn) refreshFn();
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
      spot: side => { const g = geos[side]; return g.alto ? [g.X1 + 50, 4 - BAND] : g.pc ? [g.GX + g.GW, 4] : g.solo ? [-2000, -2000] : [g.SX + g.SW, 4]; } });
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
    // dim(g): el tamaño de la zona para tocarlo, en unidades del dibujo ([ancho, alto]; nunca menos de 28 px).
    const buttons = [];
    const shownSide = () => Sim.view === 'w' ? 'w' : 'e';
    const sizeEl = (el, [w, h]) => {
      el.style.width = `max(28px, calc(var(--s, 1) * ${w}px))`;
      el.style.height = `max(28px, calc(var(--s, 1) * ${h}px))`;
    };
    const refresh = () => {
      buttons.forEach(({ pair, text, label, attrs, hidden, extra, dim }) => {
        pair.forEach((el, k) => {
          const side = k ? 'e' : 'w';
          if (text) el.textContent = text(side);
          if (label) el.setAttribute('aria-label', label(side));
          if (attrs) for (const [a, v] of Object.entries(attrs())) el.setAttribute(a, v);
          if (hidden) el.hidden = hidden();
          if (dim && !el.hidden) sizeEl(el, dim(geos[side]));
        });
        if (extra) extra.textContent = text(shownSide());
      });
      pw.replace(); pe.replace();
    };
    refreshFn = refresh;
    Sim.onView(() => refresh());
    const linkedButton = ({ pos, text, label, attrs, hidden, dim, onClick, cls = 'sim-btn small', html, act, side: dup }) => {
      const pair = ['w', 'e'].map(side => {
        const el = document.createElement('button');
        el.type = 'button'; el.className = cls + (dup ? ' side-dup' : '');
        if (act) el.dataset.act = act;
        if (html) el.innerHTML = html;
        el.addEventListener('click', () => { onClick(); refresh(); });
        return place(side, el, pos);
      });
      const extra = dup && Sim.side ? Sim.side.button(act, '', () => { onClick(); refresh(); }) : null;
      buttons.push({ pair, text, label, attrs, hidden, extra, dim });
      return pair;
    };
    // Perilla en los dos paneles; ks.set(v) la pone en v sin avisar (cuando otra cosa cambia su valor).
    const linkedKnob = ({ pos, min, max, step, magnet, value, label, format, onInput, act, hidden, dim }) => {
      const ks = {}, pair = [];
      ['w', 'e'].forEach(side => {
        const el = place(side, document.createElement('div'), pos);
        if (act) el.dataset.act = act;
        pair.push(el);
        ks[side] = Sim.knob(el, { min, max, step, magnet, value, label: label(side), format: v => format(v, side),
          onInput: v => { onInput(v); ks[side === 'w' ? 'e' : 'w'].set(v, true); } });
      });
      ks.set = v => { ks.w.set(v, true); ks.e.set(v, true); };
      if (hidden || dim) buttons.push({ pair, hidden, dim: dim && (g => [dim(g), dim(g)]) });
      return ks;
    };
    const unitV = side => side === 'w' ? 'psi' : 'V';   // 1 psi por volt: mismos números
    const val = (v, side, d = 1) => fmt(v, d) + ' ' + unitV(side);
    const fText = f => f >= 1000 ? fmt(f / 1000, 0) + ' kHz' : fmt(f, f < 1 ? 1 : f < 10 && f % 1 ? 1 : 0) + ' Hz';
    const tText = ms => ms >= 1000 ? fmt(ms / 1000, 0) + ' s' : ms < 1 ? fmt(ms * 1000, 0) + ' µs' : fmt(ms, ms % 1 ? 1 : 0) + ' ms';
    // Lecturas de la pantalla del osciloscopio, con tres cifras y punto decimal como en el de verdad (4.93V, 500mV,
    // 2.50ms; la frecuencia con una más: 100.0Hz). En el agua, psi sin prefijos.
    const eng = (v, u) => {
      if (v == null || !isFinite(v)) return '?';
      const a = Math.abs(v), bare = u === 'psi';
      const [k, p] = bare || (a >= 1 && a < 1000) || a === 0 ? [1, ''] : a >= 1000 ? [1e-3, 'k'] : a >= 1e-3 ? [1e3, 'm'] : [1e6, 'µ'];
      const x = v * k, ax = Math.abs(x), d = (ax >= 99.95 ? 0 : ax >= 9.995 ? 1 : ax >= 0.995 || !bare ? 2 : 3) + (u === 'Hz' ? 1 : 0);
      return x.toFixed(d) + p + u;
    };
    const ohm = R => R >= 1000 ? (R / 1000).toLocaleString('es-MX') + ' kΩ' : R + ' Ω';

    // Generador
    linkedButton({
      pos: g => [g.GX + 44, g.GY + 110], cls: 'sim-power', hidden: () => !geos.e.gen,
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
      pos: g => waveAt(g, k), cls: 'sim-wave', hidden: () => !geos.e.gen,
      label: () => 'Onda ' + ['senoidal', 'cuadrada', 'triangular'][k],
      attrs: () => ({ role: 'radio', 'aria-checked': String(st.wave === w) }),
      onClick: () => { st.wave = w; }
    }));
    linkedKnob({
      pos: g => [g.GX + 245, g.GY + 112], min: 0, max: 40, step: 1, value: st.fi, hidden: () => !geos.e.gen,
      label: () => 'Frecuencia', format: v => fText(freqAt(v)),
      onInput: v => { st.fi = v; }
    });
    linkedKnob({
      pos: g => [g.GX + 365, g.GY + 112], min: 0, max: 10, step: 0.5, magnet: 1, value: st.amp, hidden: () => !geos.e.gen,
      label: () => 'Amplitud', format: val, onInput: v => { st.amp = v; }
    });
    linkedKnob({
      pos: g => [g.GX + 485, g.GY + 112], min: -5, max: 5, step: 0.5, magnet: 1, value: st.off, hidden: () => !geos.e.gen,
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
      pt.els = linkedButton({ cls: 'sim-hit', pos: () => PLACES[k], label: pt.label, attrs: () => ({ 'aria-haspopup': 'dialog' }),
        hidden: () => geos.e.solo, onClick: () => {} });
      pt.els.forEach((el, i) => el.addEventListener('click', () => Sim.menu.toggle(el, pt.menu(i ? 'e' : 'w'))));
      pt.open = () => pt.els.some(el => Sim.menu.isOpen(el));
      if (Sim.side) Sim.side.part({ anchor: () => pt.els[shownSide() === 'w' ? 0 : 1], menu: () => pt.menu(shownSide()) });
    }

    // Osciloscopio: los mandos del de verdad. Cada uno dice en qué acomodo está (los del compacto también van en el
    // completo) y se acomoda donde lo pone ese acomodo.
    const lay = () => geos.e.L;
    const has = (grp, id) => () => !lay()[grp][id];
    const VTXT = (side, v) => side === 'w' ? fmt(v, v < 0.01 ? 3 : v < 1 ? 2 : 0) + ' psi' : v < 1 ? fmt(v * 1000, 0) + ' mV' : fmt(v, 0) + ' V';
    const chName = (c, side) => (side === 'w' ? 'manguera ' : 'canal ') + (c + 1);
    // Perillas: volts por división y POSITION de cada canal, SEC/DIV y POSITION horizontal, y LEVEL del disparo.
    const K = {};
    const knob = (id, o2) => { K[id] = linkedKnob({ pos: g => g.L.knobs[id] || [-999, -999], act: 'med', hidden: has('knobs', id),
      dim: g => (g.L.knobs[id] || [0, 0, 40])[2], ...o2 }); };
    [0, 1].forEach(c => {
      knob('vd' + c, { min: 0, max: VDIV.length - 1, step: 1, value: st.chs[c].vi,
        label: side => `VOLTS/DIV del ${chName(c, side)}`, format: (v, side) => VTXT(side, VDIV[v]) + ' por división',
        onInput: v => { st.chs[c].vi = v; if (st.trg.src === c) syncLevel(); } });
      knob('pos' + c, { min: -40, max: 40, step: 1, magnet: 10, value: Math.round(st.chs[c].pos * 10),
        label: side => `POSITION del ${chName(c, side)}: sube o baja su cero`, format: v => fmt(v / 10, 1) + ' divisiones',
        onInput: v => { st.chs[c].pos = v / 10; } });
    });
    knob('td', { min: 0, max: TDIV.length - 1, step: 1, value: st.ti, label: () => 'SEC/DIV: tiempo por división',
      format: v => tText(TDIV[v]) + ' por división', onInput: v => { st.ti = v; resetSweep(); } });
    knob('hpos', { min: -50, max: 50, step: 1, magnet: 10, value: 0, label: () => 'POSITION horizontal: mueve el punto de disparo',
      format: v => fmt(v / 10, 1) + ' divisiones', onInput: v => { st.hpos = v / 10; resetSweep(); } });
    // LEVEL: el nivel del disparo, en décimas de división de su fuente (al cambiar su escala se queda en los mismos volts).
    const lvlDiv = () => VDIV[st.chs[st.trg.src].vi] / 10;
    knob('lvl', { min: -60, max: 60, step: 1, value: Math.round(st.trg.level / lvlDiv()),
      label: side => 'LEVEL: nivel del disparo', format: (v, side) => eng(v * lvlDiv(), unitV(side)),
      onInput: v => { st.trg.level = v * lvlDiv(); rearm(st.T); } });
    function syncLevel() { K.lvl.set(Math.max(-60, Math.min(60, Math.round(st.trg.level / lvlDiv())))); }
    const syncKnobs = () => {
      [0, 1].forEach(c => { K['vd' + c].set(st.chs[c].vi); K['pos' + c].set(Math.round(st.chs[c].pos * 10)); });
      K.td.set(st.ti); K.hpos.set(Math.round(st.hpos * 10)); syncLevel();
    };
    // Teclas
    const key = (id, label, onClick, attrs) => linkedButton({ pos: g => g.L.keys[id] || [-999, -999], act: 'med', cls: 'sim-trig',
      hidden: has('keys', id), dim: g => (g.L.keys[id] || [0, 0, 40, 30]).slice(2), label, attrs, onClick });
    const menuKey = m => () => { st.menu = st.menu === m ? null : m; };
    key('meas', () => 'MEASURE: medidas automáticas en la pantalla', menuKey('meas'), () => ({ 'aria-pressed': String(st.menu === 'meas') }));
    [0, 1].forEach(c => key('ch' + c, side => `CH${c + 1} MENU: ${st.chs[c].on ? (st.menu === 'ch' + c ? 'apaga el ' : 'menú del ') : 'prende el '}${chName(c, side)}`, () => {
      const s2 = st.chs[c];
      if (!s2.on) { s2.on = true; st.menu = 'ch' + c; } else if (st.menu === 'ch' + c) { s2.on = false; st.menu = null; } else st.menu = 'ch' + c;
    }, () => ({ 'aria-pressed': String(st.chs[c].on) })));
    key('trig', () => 'TRIG MENU: fuente, pendiente y modo del disparo', menuKey('trig'), () => ({ 'aria-pressed': String(st.menu === 'trig') }));
    // SET TO 50%: el nivel a la mitad de la señal de la fuente del disparo.
    const recent = ch => measure(ch, st.T - Math.max(1, 2 * sweepS()), st.T);
    key('half', () => 'SET TO 50%: el nivel del disparo a la mitad de la señal', () => {
      const m = recent(st.trg.src);
      if (m) { st.trg.level = (m.mn + m.mx) / 2; syncLevel(); rearm(st.T); }
    });
    key('run', () => st.run ? 'RUN/STOP: congela la imagen' : 'RUN/STOP: sigue barriendo', () => { st.run = !st.run; if (st.run) resetSweep(); },
      () => ({ 'aria-pressed': String(!st.run) }));
    // AUTOSET: escoge las escalas y el disparo para ver bien la señal de cada canal prendido.
    key('auto', () => 'AUTOSET: escoge las escalas solo', () => {
      const ms = [0, 1].map(recent);
      [0, 1].forEach(c => {
        const s2 = st.chs[c], m = ms[c];
        if (!s2.on || !m) return;
        s2.cpl = 'dc';
        const span = Math.max(m.pp / 6.4, Math.abs((m.mn + m.mx) / 2) / 3.5, 0.002);   // unas seis divisiones
        s2.vi = VDIV.findIndex(v => v >= span * 0.999); if (s2.vi < 0) s2.vi = VDIV.length - 1;
        s2.pos = m.pp > 0.02 ? Math.max(-4, Math.min(4, -(m.mn + m.mx) / 2 / VDIV[s2.vi])) : 0;
      });
      const src = [0, 1].find(c => st.chs[c].on && ms[c] && ms[c].freq) ?? 0, f = ms[src] && ms[src].freq;
      // dos ciclos y medio en la pantalla
      if (f) { st.ti = TDIV.findIndex(t => t >= 250 / f * 0.999); if (st.ti < 0) st.ti = TDIV.length - 1; }
      Object.assign(st.trg, { src, slope: 1, mode: 'auto', level: ms[src] ? (ms[src].mn + ms[src].mx) / 2 : 0 });
      st.hpos = 0;
      syncKnobs(); resetSweep();
    });
    // Los cinco botones junto a la pantalla: cada uno cambia la casilla del menú que tiene enfrente.
    const MENUS = {
      meas: i => { const cur = st.meas[i], j = MEAS_ALL.findIndex(x => cur ? x && x[0] === cur[0] && x[1] === cur[1] : !x); st.meas[i] = MEAS_ALL[(j + 1) % MEAS_ALL.length]; },
      ch: (c, i) => { const s2 = st.chs[c]; if (i === 0) s2.cpl = { dc: 'ac', ac: 'gnd', gnd: 'dc' }[s2.cpl]; if (i === 1) s2.inv = !s2.inv; },
      trig: i => {
        const T = st.trg;
        if (i === 0) { T.src = 1 - T.src; syncLevel(); }
        if (i === 1) T.slope = -T.slope;
        if (i === 2) T.mode = T.mode === 'auto' ? 'normal' : 'auto';
        rearm(st.T);
      }
    };
    // Las casillas del menú van del renglón de arriba al pie de la cuadrícula (abajo queda el renglón de las escalas).
    const boxH = L => (L.scr[1] + L.scr[3] - L.menu[1] - L.top) / 5;
    const bezelAt = (g, i) => { const L = g.L; return [L.bezel[0], L.menu[1] + L.top + boxH(L) * (i + 0.5)]; };
    [0, 1, 2, 3, 4].forEach(i => linkedButton({ pos: g => g.L.bezel ? bezelAt(g, i) : [-999, -999], act: 'med', cls: 'sim-trig',
      hidden: () => !lay().bezel, dim: g => g.L.bezel ? g.L.bezel.slice(1) : [30, 30],
      label: () => `Botón ${i + 1} del menú de la pantalla`,
      onClick: () => { const m = st.menu; if (m === 'meas') MENUS.meas(i); else if (m === 'trig') MENUS.trig(i); else if (m) MENUS.ch(+m[2], i); } }));
    // De frente (en la mesa angosta): el osciloscopio grande con todos sus mandos; el generador se guarda.
    linkedButton({ pos: g => g.L.fold || [-999, -999], act: 'med', cls: 'sim-trig', hidden: () => !lay().fold, dim: () => [44, 34],
      label: () => st.front ? 'Regresar el osciloscopio a la mesa (y sacar el generador)' : 'Poner el osciloscopio de frente, con todos sus mandos',
      attrs: () => ({ 'aria-pressed': String(st.front) }),
      onClick: () => { st.front = !st.front; pw.refit(); pe.refit(); relayout('w', pw.mode); relayout('e', pe.mode); rebuild(); } });

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
    buttons.push({ pair: tipEls[0].concat(tipEls[1]), hidden: () => geos.e.solo }, { pair: tipEls[2], hidden: () => !st.chs[1].on || geos.e.solo });

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
    const tipColor = k => k === 1 ? C.neg : CH[k ? 1 : 0].cable;
    const tips = () => st.chs[1].on ? [0, 1, 2] : [0, 1];
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
        ctx.lineWidth = 7; ctx.strokeStyle = C.card; ctx.stroke();
        ctx.lineWidth = 4.5; ctx.strokeStyle = C.ink; ctx.stroke();
        ctx.lineWidth = 2.5; ctx.strokeStyle = tipColor(k); ctx.stroke();
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
      if (!g.gen) return;
      const w = g.side === 'w', x = g.GX, y = g.GY;
      // cuello hacia el circuito; en la PC, un cable grueso que va de su símbolo al generador, a la derecha
      if (g.pc) D.line(ctx, [[g.PX, g.BOT + 26], [g.PX, g.BOT + 36], [g.GX, g.BOT + 36]], 12, C.ink);
      else { ctx.fillStyle = C.ink; ctx.fillRect(g.PX - 14, g.BOT + 26, 28, 22); }
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
    // Tecla con su nombre impreso (la misma base que Sim.draw.key); fill: la tapa de color (CH1 y CH2 MENU).
    const keyCap = (ctx, [x, y, kw, kh], label, { down = 0, fill } = {}) => {
      D.roundRect(ctx, x - kw / 2, y - kh / 2 + 2, kw, kh, 5, '#1b242c');
      D.roundRect(ctx, x - kw / 2, y - kh / 2 + down * 1.5, kw, kh - 1.5, 5, fill || (down ? '#8e9aa4' : '#b4bec6'), '#1b242c', 1.2);
      if (label) D.text(ctx, label, x, y + down * 1.5 - 0.5, '#15212a', { size: 14, max: kw - 8 });
    };
    // Entrada BNC (con un anillo del color de su canal) y borne de tierra.
    const bnc = (ctx, x, y, col) => {
      D.circle(ctx, x, y, 17, null, col, 3);
      D.circle(ctx, x, y, 13, '#b9c4cc', C.ink, 1.5); D.circle(ctx, x, y, 8, '#2a333b'); D.circle(ctx, x, y, 2.5, '#e9edf0');
    };
    const groundSym = (ctx, x, y, col) => {
      D.line(ctx, [[x, y - 9], [x, y]], 2, col);
      [[10, 0], [6.5, 4], [3, 8]].forEach(([hw, dy]) => D.line(ctx, [[x - hw, y + dy], [x + hw, y + dy]], 2, col, 'butt'));
    };
    const arc = (ctx, x, y, r, col) => { ctx.beginPath(); ctx.arc(x, y, r, -1.1, 0.7); ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.stroke(); };
    // Icono de la tecla de frente: dos flechas hacia afuera (o hacia adentro, para regresarlo).
    const foldIcon = (ctx, x, y, out) => {
      const a = out ? 9 : 3, b = out ? 3 : 9;
      [[1, -1], [-1, 1]].forEach(([sx, sy]) => {
        D.line(ctx, [[x + sx * b, y + sy * b], [x + sx * a, y + sy * a]], 2.4, '#15212a');
        D.line(ctx, [[x + sx * a - sx * 5, y + sy * a], [x + sx * a, y + sy * a], [x + sx * a, y + sy * a - sy * 5]], 2.4, '#15212a');
      });
    };
    const ink = (ch, w) => w ? CH[ch].paper[C.dark ? 1 : 0] : CH[ch].lcd;
    const STATUS = { trig: ['Disparado', '#5be08a'], auto: ['Auto', '#ffd166'], armed: ['Armado', '#ffd166'], stop: ['Detenido', '#ff6b5f'] };
    // Pantalla: la cuadrícula con las trazas, sus marcas (el cero de cada canal a la izquierda, el nivel del disparo
    // a la derecha, el punto de disparo arriba), el estado y las escalas en sus renglones, y la columna del menú.
    const drawScreen = (ctx, g) => {
      const w = g.side === 'w', L = g.L, [sx, sy, sw, sh] = L.scr, dv = L.div, cy = sy + sh / 2, [mx, my, mw, mh] = L.menu;
      const [fx, fy, fw, fh] = L.frame, u = unitV(g.side);
      const bg = w ? paper() : '#070b0f', txt = w ? C.ink : '#e2e9ef', dim = w ? C.muted : '#8b98a5';
      D.roundRect(ctx, fx, fy, fw, fh, 8, '#2b3440');
      D.roundRect(ctx, fx + 6, fy + 6, fw - 12, fh - 12, 3, bg);
      // cuadrícula: punteada, con los ejes del centro marcados
      const gl = w ? grid(false) : '#2f3b47', gm = w ? grid(true) : '#4d5b68';
      ctx.save(); ctx.setLineDash([1.5, 5]);
      for (let i = 1; i < 10; i++) if (i !== 5) D.line(ctx, [[sx + i * dv, sy], [sx + i * dv, sy + sh]], 1, gl, 'butt');
      for (let i = 1; i < 8; i++) if (i !== 4) D.line(ctx, [[sx, sy + i * dv], [sx + sw, sy + i * dv]], 1, gl, 'butt');
      ctx.restore();
      D.line(ctx, [[sx + 5 * dv, sy], [sx + 5 * dv, sy + sh]], 1.2, gm, 'butt'); D.line(ctx, [[sx, cy], [sx + sw, cy]], 1.2, gm, 'butt');
      for (let i = 0; i <= 50; i++) { const X = sx + i * dv / 5; D.line(ctx, [[X, cy - 3], [X, cy + 3]], 1, gm, 'butt'); }
      for (let i = 0; i <= 40; i++) { const Y = sy + i * dv / 5; D.line(ctx, [[sx + 5 * dv - 3, Y], [sx + 5 * dv + 3, Y]], 1, gm, 'butt'); }
      D.roundRect(ctx, sx, sy, sw, sh, 0, null, gm, 1.2);
      // trazas
      ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
      const Y = (ch, v) => cy - (v / VDIV[st.chs[ch].vi] + st.chs[ch].pos) * dv;
      for (const ch of [1, 0]) {   // el canal 1 encima
        if (!st.chs[ch].on) continue;
        for (const tr of st.traces) {
          const pts = tr.pts[ch];
          if (pts.length < 2) continue;
          ctx.beginPath();
          pts.forEach(([x, v], i) => { const X = sx + x * sw, yy = Math.max(sy - 10, Math.min(sy + sh + 10, Y(ch, v))); i ? ctx.lineTo(X, yy) : ctx.moveTo(X, yy); });
          ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          if (!w) { ctx.globalAlpha = 0.22 * tr.a; ctx.lineWidth = 6; ctx.strokeStyle = ink(ch, w); ctx.stroke(); }
          ctx.globalAlpha = tr.a; ctx.lineWidth = w ? 2.2 : 2.4; ctx.strokeStyle = ink(ch, w); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        const bm = st.beam && st.beam[ch];
        if (bm) {
          const X = sx + bm[0] * sw, yy = Y(ch, bm[1]);
          if (w) { D.line(ctx, [[X, yy], [X + 14, yy - 22]], 4, C.ink); D.circle(ctx, X, yy, 3, ink(ch, w)); }   // la plumilla del registrador
          else { ctx.globalAlpha = 0.35; D.circle(ctx, X, yy, 7, ink(ch, w)); ctx.globalAlpha = 1; D.circle(ctx, X, yy, 3.5, '#ffffff'); }
        }
      }
      ctx.restore();
      // marcas: el cero de cada canal (con su número), el nivel del disparo y el punto de disparo
      const clampY = y => Math.max(sy + 6, Math.min(sy + sh - 6, y));
      [0, 1].forEach(ch => {
        if (!st.chs[ch].on) return;
        const y0 = clampY(cy - st.chs[ch].pos * dv);
        ctx.beginPath(); ctx.moveTo(sx, y0 - 8); ctx.lineTo(sx + 13, y0); ctx.lineTo(sx, y0 + 8); ctx.closePath(); ctx.fillStyle = ink(ch, w); ctx.fill();
        D.text(ctx, String(ch + 1), sx + 22, y0, ink(ch, w), { size: 14, align: 'left' });
      });
      const T = st.trg, ly = clampY(Y(T.src, T.level));
      ctx.beginPath(); ctx.moveTo(sx + sw, ly - 7); ctx.lineTo(sx + sw - 12, ly); ctx.lineTo(sx + sw, ly + 7); ctx.closePath(); ctx.fillStyle = ink(T.src, w); ctx.fill();
      const tx = sx + (5 + st.hpos) * dv;
      ctx.beginPath(); ctx.moveTo(tx - 7, sy); ctx.lineTo(tx + 7, sy); ctx.lineTo(tx, sy + 10); ctx.closePath(); ctx.fillStyle = w ? C.charge : '#ff9f1c'; ctx.fill();
      // renglón de arriba: el estado y dónde quedó el disparo; abajo: las escalas, el disparo y su frecuencia
      const ty = my + L.top / 2, by = sy + sh + L.top / 2, [stt, stc] = STATUS[st.status || 'auto'];
      D.circle(ctx, sx + 6, ty, 4.5, w ? { trig: C.ok, stop: C.danger }[st.status] || C.charge : stc);
      D.text(ctx, stt, sx + 16, ty, txt, { size: 14, align: 'left', font: Sim.MONO, weight: 600 });
      if (st.hpos) D.text(ctx, 'M Pos ' + eng(st.hpos * TDIV[st.ti] / 1000, 's'), sx + sw, ty, dim, { size: 14, align: 'right', font: Sim.MONO, weight: 500 });
      const cpl = c => ({ ac: ' ~', gnd: ' ⏚', dc: '' })[st.chs[c].cpl];
      const items = [];
      [0, 1].forEach(c => { if (st.chs[c].on) items.push([`CH${c + 1} ${eng(VDIV[st.chs[c].vi], u)}${cpl(c)}`, ink(c, w), 3]); });
      items.push([`M ${eng(TDIV[st.ti] / 1000, 's')}`, txt, 3]);
      items.push([`CH${T.src + 1} ${T.slope > 0 ? '↗' : '↘'} ${eng(T.level, u)}`, ink(T.src, w), 2]);
      items.push([st.tf >= 10 ? eng(st.tf, 'Hz') : '<10Hz', txt, 1]);
      D.font(ctx, 14, Sim.MONO, 600);
      const gap = Sim.px(14, ctx) * 0.8, room = mx + mw - sx;
      let shown = items, wid = () => shown.reduce((a, [t]) => a + ctx.measureText(t).width, 0) + gap * (shown.length - 1);
      for (let p = 1; p <= 2 && wid() > room; p++) shown = shown.filter(it => it[2] > p);
      let x = sx;
      shown.forEach(([t, col]) => { D.text(ctx, t, x, by, col, { size: 14, align: 'left', font: Sim.MONO, weight: 600 }); x += ctx.measureText(t).width + gap; });
      // columna del menú
      const title = { meas: 'MEDIDAS', ch0: 'CH1', ch1: 'CH2', trig: 'DISPARO' }[st.menu];
      const tcol = st.menu === 'ch0' ? ink(0, w) : st.menu === 'ch1' ? ink(1, w) : txt;
      if (title) D.text(ctx, title, mx + mw / 2, ty, tcol, { size: 14, font: Sim.MONO, weight: 700, max: mw - 4 });
      const bh = boxH(L), rows = menuRows(g.side);
      rows.forEach((r, i) => {
        const y0 = my + L.top + i * bh;
        if (!r) return;
        D.roundRect(ctx, mx + 2, y0 + 2, mw - 4, bh - 4, 4, w ? (C.dark ? '#2f2c26' : '#f1e9d2') : '#122230', w ? grid(true) : '#3b4855', 1);
        D.text(ctx, r[0], mx + 8, y0 + bh * 0.32, r[2] || dim, { size: 14, align: 'left', font: Sim.MONO, weight: 600, max: mw - 14 });
        D.text(ctx, r[1], mx + 8, y0 + bh * 0.7, txt, { size: 15, align: 'left', font: Sim.MONO, weight: 700, max: mw - 14 });
      });
    };
    // Las cinco casillas del menú que se ve: [rótulos, valor, color del rótulo] (null: vacía).
    const menuRows = side => {
      const w = side === 'w', u = unitV(side), m = st.menu;
      if (m === 'meas') return st.meas.map(x => {
        if (!x) return [['Ninguna'], '', null];
        const [c, t] = x, on = st.chs[c].on, v = on ? measValue(st.m[c], t) : null;
        const un = { freq: 'Hz', period: 's' }[t] || u;
        return [[`CH${c + 1} ${MEAS[t]}`, `CH${c + 1} ${MEAS_SHORT[t]}`, MEAS_SHORT[t]], on ? eng(v, un) : 'Apagado', ink(c, w)];
      });
      if (m === 'ch0' || m === 'ch1') {
        const s2 = st.chs[+m[2]];
        return [[['Acoplamiento', 'Acopl.'], { dc: 'CC', ac: 'CA', gnd: 'Tierra' }[s2.cpl]], [['Invertir'], s2.inv ? 'Sí' : 'No'], null, null, null];
      }
      if (m === 'trig') {
        const T = st.trg;
        return [[['Fuente'], 'CH' + (T.src + 1)], [['Pendiente'], T.slope > 0 ? '↗ Subida' : '↘ Bajada'],
          [['Modo'], T.mode === 'auto' ? 'Auto' : 'Normal'], [['Nivel'], eng(T.level, u)], null];
      }
      return [null, null, null, null, null];
    };
    const drawScope = (ctx, g) => {
      const w = g.side === 'w', L = g.L;
      D.chassis(ctx, L.x, L.y, L.w, L.h, w, w ? 'REGISTRADOR DE PRESIÓN' : 'OSCILOSCOPIO');
      // secciones: fondo más oscuro y su nombre en una franja arriba
      L.secs.forEach(([x, y, sw2, sh2, names]) => {
        D.roundRect(ctx, x, y, sw2, sh2, 8, C.dark ? '#2c3843' : '#d3dbe1');
        ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, sw2, sh2, 8); ctx.clip();
        ctx.fillStyle = C.dark ? '#46566a' : '#bccad4'; ctx.fillRect(x, y, sw2, 24); ctx.restore();
        D.text(ctx, names, x + sw2 / 2, y + 12.5, C.ink, { size: 14, font: Sim.WIDE, max: sw2 - 10 });
      });
      L.labels.forEach(([t, x, y, lw]) => D.text(ctx, t, x, y, C.muted, { size: 14, max: lw }));
      drawScreen(ctx, g);
      // teclas
      const K2 = L.keys, kd = { meas: st.menu === 'meas', ch0: st.chs[0].on, ch1: st.chs[1].on, trig: st.menu === 'trig', run: !st.run };
      const KL = { meas: ['MEASURE', 'MEAS.'], auto: ['AUTOSET', 'AUTO'], run: ['RUN/STOP', 'RUN'], ch0: ['CH1 MENU', 'CH1'], ch1: ['CH2 MENU', 'CH2'],
        trig: ['TRIG MENU', 'TRIG'], half: ['SET TO 50%', '50%'] };
      for (const id in K2) keyCap(ctx, K2[id], KL[id], { down: kd[id] ? 1 : 0, fill: id === 'ch0' ? CH[0].key : id === 'ch1' ? CH[1].key : null });
      if (K2.run) { const [x, y, kw, kh] = K2.run; D.circle(ctx, x + kw / 2 - 6, y - kh / 2 + 6 + (st.run ? 0 : 1.5), 3, st.run ? '#22e06b' : '#ff5a4f'); }
      if (L.bezel) [0, 1, 2, 3, 4].forEach(i => { const [x, y] = bezelAt(g, i); keyCap(ctx, [x, y, L.bezel[1], L.bezel[2]], ''); });
      if (L.fold) { keyCap(ctx, [L.fold[0], L.fold[1], 44, 34], ''); foldIcon(ctx, L.fold[0], L.fold[1] - 0.5, !st.front); }
      // perillas: VOLTS/DIV con el arco del color de su canal
      [0, 1].forEach(c => { const k = L.knobs['vd' + c]; if (k) arc(ctx, k[0], k[1], k[2] / 2 + 7, CH[c].cable); });
      // entradas y tierra
      L.bnc.forEach(([x, y], c) => {
        bnc(ctx, x, y, CH[c].cable);
        if (L.bncSide) D.text(ctx, `CH${c + 1}`, x + 24, y, C.muted, { size: 14, align: 'left' });
        else if (L.bncLab) D.text(ctx, `CH ${c + 1}`, x, L.bncLab, C.ink, { size: 14 });
      });
      const [gx, gy] = L.gnd;
      D.circle(ctx, gx, gy, 9, '#8a99a5', C.ink, 1.5); D.circle(ctx, gx, gy, 4, '#3a4652');
      if (L.bncSide) groundSym(ctx, gx + 28, gy - 2, C.muted);
      else groundSym(ctx, gx - 30, gy - 2, C.muted);
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
    // La mesa de trabajo: en vertical, el generador y el osciloscopio van en una franja de otro tono abajo (en la
    // PC, el osciloscopio).
    const drawDesk = (ctx, g) => {
      if (!g.alto && !g.pc) return;
      ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = C.bg; ctx.fillRect(-2000, (g.pc ? g.SY : g.GY) - 18, 4000, 4000); ctx.restore();
    };
    const dot = (ctx, x, y) => D.circle(ctx, x, y, 5, C.ink);
    const each = (K, fn) => { for (const k in PLACES) if (kind(k) === K) fn(k, ...PLACES[k]); };
    function drawWater() {
      const g = geos.w, ctx = pw.begin();
      if (g.solo) return drawScope(ctx, g);   // de frente en el celular acostado: solo el registrador
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
      if (g.solo) return drawScope(ctx, g);   // de frente en el celular acostado: solo el osciloscopio
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
