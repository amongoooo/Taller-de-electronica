// Banco común de las simulaciones de agua y electricidad: dos paneles con el mismo circuito,
// bomba y fuente enlazadas (como la fuente del taller, una BK 1761 de dos canales: en cada canal una
// pantallita con su tecla V/A, VOLTAGE con COARSE y FINE, CURRENT para el límite de corriente, LEDs CV/CC y
// bornes − ⏚ +; POWER en medio; el circuito va en el canal A) y un multímetro abajo junto a la fuente (en
// el agua, un medidor equivalente):
// un solo par de cables, rojo (+) y negro (−), y una perilla OFF · V · A · Ω. En V (presión) sus dos
// puntas van entre dos puntos del circuito; en A (caudal) el circuito se abre en un punto y el
// multímetro queda en medio: el cable se corta entre sus dos puntas y todo pasa por él (si las puntas
// quedan en dos nodos distintos, el multímetro es un corto y se funde su fusible); en Ω mide la
// resistencia entre sus puntas como uno de verdad (con lo que esté en paralelo, y una lectura que no
// sirve si hay voltaje). Los cables nunca cambian de borne (COM y VΩA): solo cambia el modo.
// La perilla también elige el modo de color de las partículas. En Medir se puede sacar un segundo
// multímetro para medir dos cosas a la vez. Cables que cuelgan, e inercia. Botones para invertir la
// polaridad y para llevar la punta negra a la tierra común (el − de la fuente, 0 V). Los multímetros se
// pueden arrastrar y cada uno tiene dos botones: recoger sus cables y compactarlo (la pantallita y la
// perilla). Cada página solo agrega su parte del circuito.
//
// Sim.bench({
//   iFull,            mA a escala completa en los medidores de corriente y caudal
//   iMax,             mA con el voltaje al máximo y la menor resistencia posible (si falta, iFull):
//                     el tubo del medidor de caudal solo se llena del todo con ese caudal
//   flowSpeed,        rapidez de las partículas en la tubería normal, por cada mA
//   v0,               voltaje inicial del canal A (y del B)
//   lim0,             límite de corriente inicial en mA (100 si falta)
//   layout(g),        se llama cuando cambia el tamaño de un panel (g.side es 'w' o 'e')
//   model(V),         devuelve { I } (mA totales) y lo que la página necesite para dibujar; V es el voltaje
//                     que de verdad sale del canal A (menor que el de sus perillas si llegó al límite),
//                     así que I debe crecer con V y ser finita aunque haya un corto
//   circuit(g, m, V), tramos del circuito sin contar la fuente, para las puntas (ver más abajo);
//                     si falta, es una sola vuelta con todo el voltaje en el centro de arriba
//   step(dt, m),      avanza lo que se mueve (partículas, ruedas)
//   stateful,         true si la corriente cambia sola con el tiempo (un capacitor que se carga):
//                     esos cambios ya vienen suaves y no se toman como cambios del circuito
//   drawW(ctx, g, m), drawE(ctx, g, m)   dibujan el circuito de cada lado
//   overlay(ctx, g, m)                    lo que va encima de todo (avisos de la página)
// })
// El canal B no tiene nada conectado: da su voltaje sin corriente (CV), listo para una página con dos fuentes.
// b.st.set es el voltaje de las perillas del canal A y b.vScale() el voltaje de la escala de colores.
// Vista de nodos (Ver → Dibujo: Circuito | Nodos): los cables se juntan en nodos con su voltaje y solo quedan
// los componentes. Para dibujarlos ahí, cada componente de circuit() trae draw(ctx, water, g, m) (lo dibuja en
// su lugar de siempre; el banco lo mueve y lo gira), tag(water) → [nombre, valor, peligro, estado], pr (su b.pinch o
// b.part) y ext (cuánto sobresale de su cable, o ext(water)). Un tramo con link: true es un contacto cerrado.
// Para el Ω del multímetro cada componente trae R, su resistencia en ohmios (0 un corto; sin R o Infinity,
// abierto: un LED, un capacitor, un interruptor abierto, un fusible fundido).
// b.setNodes(v) y b.nodesOn() la ponen o la quitan; b.where() dice en qué nodos están las puntas.
// Multímetros 'a' (el de siempre) y 'b' (el segundo): b.showMeters({ a, b }) muestra u oculta cada uno con
// sus puntas (para las páginas que van por pasos); b.setDial(k, modo, puntas) gira su perilla ('off', 'V',
// 'A' o 'R') y, si se dan, pone sus puntas ahí ([[x, y], [x, y]]).
// b.ground(g) es el punto de la tierra común en el cable de abajo.
// b.halt() se llama al romperse algo (se funde el fusible, se quema o revienta una pieza): el siguiente
// cambio del circuito no espera la inercia, el flujo se frena de golpe en un instante.
(() => {
  const { C, draw: D, fmt, digits } = Sim;
  // Del lado del agua los números son los mismos que los eléctricos: 1 psi por volt y 1 mL/s por mA.
  // Cada canal de la fuente da de 0 a 35 V y de 0 a 3 A, como la BK 1761 del taller.
  const VMAX = 35, PSI_PER_V = 1, MLS_PER_MA = 1, RPM_PER_MA = 100;
  const SRC = 40;   // medio ancho de la bomba (y de la fuente) sobre el cable de abajo
  // Color de cada posición de la perilla del multímetro (y de lo que mide): voltaje morado, corriente verde.
  const MCOL = { off: '#7a8794', V: '#8b5cf6', A: '#0ea371', R: '#1d6fd1' };
  const DIAL = ['off', 'V', 'A', 'R'];
  const DANG = { off: -105, V: -35, A: 35, R: 105 };   // ángulo de cada posición (grados, 0 arriba)
  const MS = ['a', 'b'];                                // los dos multímetros
  const RED = '#d6392b';
  const TRIP_MAX = 500;   // mA: hasta aquí la protección del multímetro en A se bota; arriba se funde su fusible
  // Pasos de la perilla CURRENT (el límite, en mA), de 0 a 3 A: de a 1 mA abajo de 10 mA (la pantallita marca
  // 1 mA) y luego como 1-1,2-1,5-2-2,5-3-4-5-6-8 en cada década, para que 20 mA quede tan a la mano como 2 A.
  const LIMS = [0, 1, 2, 3, 4, 5, 6, 8].concat([10, 100].flatMap(d => [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8].map(x => Math.round(x * d))),
    [1000, 1200, 1500, 2000, 2500, 3000]);
  // Escala de colores del voltaje (presión): la más chica de estas que alcanza el voltaje del canal A.
  const VSCALES = [12, 24, 35];
  // Los dos acomodos de la fuente, en sus coordenadas (w × h; se dibuja escalada, ver geometry). Cada canal
  // trae: su letra; lcd [x, y, ancho, alto]; key, la tecla V/A [x, y, ancho, alto]; leds CV y CC; head, los
  // nombres VOLTAGE y CURRENT [x, y, ancho]; las perillas co (COARSE), fi (FINE) y cu (CURRENT) [x, y, diámetro]
  // con caps, los nombres COARSE y FINE debajo [x, y, ancho]; y jacks, los bornes − ⏚ +. ch da dónde empieza
  // cada canal. Al centro (o a la derecha en el apilado): pow, la palanca POWER con su nombre (powLab) y las
  // teclas de la polaridad (pol) y de los cables (cab).
  // div: las rayas entre los canales (en el ancho no llegan abajo, para que quepa POWER entre los bornes).
  //   wide:  B · POWER · A, como la del taller.
  //   stack: A arriba y B abajo, con sus bornes a la derecha de cada uno y POWER en una columna a la derecha
  //          (la mesa angosta de los dos paneles en la PC).
  //   mini:  la versión corta del celular: solo el canal A con su pantallita, sus LEDs y COARSE, y POWER (sin
  //          ON/OFF escritos: powK achica la palanca). fold: la tecla para abrirla (en el celular, el acomodo
  //          wide la lleva para cerrarla).
  const SL = {
    wide: { w: 540, h: 224, ch: { B: [0, 0], A: [302, 0] }, div: [[[234, 40], [234, 186]], [[302, 40], [302, 186]]],
      pol: [251, 24], cab: [285, 24], pow: [268, 112], powLab: [268, 204, 120], fold: [516, 22],
      c: { letter: [16, 62], lcd: [89, 62, 100, 38], key: [213, 62, 38, 28], leds: [[149, 52], [149, 73]],
        head: [[82, 98, 140], [191, 98, 86]], co: [46, 140, 46], fi: [118, 140, 38], cu: [196, 140, 46],
        caps: [[46, 180, 84], [118, 180, 46]], jacks: [[62, 208], [118, 208], [174, 208]] } },
    stack: { w: 330, h: 310, ch: { A: [0, 34], B: [0, 172] }, div: [[[12, 170], [264, 170]], [[272, 12], [272, 298]]],
      pol: [301, 22], cab: [301, 48], pow: [301, 162], powLab: [301, 290, 50],
      c: { letter: [14, 20], lcd: [72, 20, 80, 32], key: [198, 20, 38, 26], leds: [[121, 12], [121, 30]],
        head: [[77, 55, 124], [184, 55, 76]], co: [44, 90, 42], fi: [110, 90, 34], cu: [184, 90, 42],
        caps: [[44, 126, 66], [110, 126, 44]], jacks: [[254, 48], [254, 82], [254, 116]] } },
    mini: { w: 232, h: 100, ch: { A: [0, 0] }, div: [[[188, 14], [188, 90]]], pow: [210, 54], powK: 0.8, fold: [164, 22],
      c: { lcd: [56, 66, 88, 32], leds: [[110, 58], [110, 74]], co: [150, 66, 40] } }
  };
  const FOLD = [30, 20];   // la tecla de abrir y cerrar (en el celular)
  // Íconos de los botones de cada medidor: conector (recoger) y flechas (compactar o mostrar completo).
  const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  Sim.bench = o => {
    const iFull = o.iFull || 12, iMax = o.iMax || iFull, flowSpeed = o.flowSpeed || 12;
    // Cada canal: sus perillas (co, COARSE, de 0,5 en 0,5 V; fi, FINE, ±0,5 V de 0,01 en 0,01 V; lim, CURRENT),
    // lo que se ve en su pantallita (disp, 'V' o 'A'; peek: lo que marca la perilla que se acaba de girar) y lo
    // que sale: v (adentro, con la inercia), vo y io (en los bornes) y cc (llegó al límite). POWER (on) es de
    // los dos. st.v, st.vo y st.cc son los del canal A, el del circuito.
    const v0 = Math.max(0, Math.min(VMAX, o.v0 ?? 6)), lim0 = Sim.nearest(LIMS, o.lim0 ?? 100);
    const channel = () => ({ co: Math.round(v0 * 2) / 2, fi: 0, lim: lim0, disp: 'V', peek: null, v: 0, vo: 0, io: 0, cc: false, level: Sim.ramp(), press: 0 });
    const st = { on: false, ch: { A: channel(), B: channel() }, v: 0, vo: 0, cc: false, tau: 1, m: { I: 0 },
      rpm: 0, omega: 0, rotor: 0, segs: [], probe: { a: null, b: null }, pinned: { a: false, b: false }, show: { a: true, b: false },
      // la perilla de cada multímetro y su fusible (se funde al hacer un corto en A)
      dial: { a: 'V', b: 'A' }, fuse: { a: false, b: false },
      // su protección en A: se bota con un corto y se rearma tocando su botón (pop: qué tanto salió)
      trip: { a: false, b: false }, pop: { a: 0, b: 0 }, popv: { a: 0, b: 0 } };
    st.front = null;   // en el celular, el instrumento abierto (ver phoneDesk)
    const b = { st, VMAX, PSI_PER_V, MLS_PER_MA, SRC, iFull, flowSpeed, knobs: [] };
    // Voltaje de las perillas de un canal (COARSE + FINE, de 10 en 10 mV) y el límite del canal A.
    const setOf = c => Math.max(0, Math.min(VMAX, Math.round((st.ch[c].co + st.ch[c].fi) * 100) / 100));
    Object.defineProperty(st, 'set', { get: () => setOf('A') });
    Object.defineProperty(st, 'lim', { get: () => st.ch.A.lim });
    b.vScale = () => VSCALES.find(v => v >= setOf('A')) || VMAX;

    // Tres acomodos del mismo circuito (siempre de x = 180 a 640, para que cada página dibuje igual). El
    // panel tiene dos franjas: el circuito y la mesa de trabajo, donde van los instrumentos alineados por
    // su base, centrados y con el mismo espacio entre ellos (si se arrastran, quedan donde se dejen):
    //   ancho:   la computadora; la mesa abajo: multímetro · fuente · lugar del segundo multímetro, con la
    //            fuente a lo ancho (B · POWER · A).
    //   medio:   la computadora con los dos paneles (angostos y altos): igual, con la fuente apilada (A arriba
    //            y B abajo, POWER a la derecha).
    //   alto:    celular vertical; la mesa abajo (ver phoneDesk).
    //   lateral: celular horizontal; la mesa a la derecha (ver phoneDesk).
    // En el celular solo se ve de x0 a x0 + W, sin márgenes de sobra, para que todo salga más grande.
    const MODES = {
      ancho: { W: 800, x0: 0, hMin: 650, hMax: 1060 },
      medio: { W: 630, x0: 85, hMin: 840, hMax: 1300 },
      alto: { W: 540, x0: 130, hMin: 840, hMax: 1300 },
      lateral: { W: 1040, x0: 110, hMin: 450, hMax: 620 }
    };
    const size = (w, h) => {
      const fit = m => {
        const H = Math.round(Math.max(m.hMin, Math.min(m.hMax, m.W * h / w)));
        return { H, s: Math.min(w / m.W, h / H) };
      };
      let mode = 'ancho', best = fit(MODES.ancho);
      // solo si en el acomodo ancho todo se vería chico; el medio, en la PC mientras no salga muy chico (si no,
      // el del celular, con las versiones cortas de los instrumentos)
      const narrow = Sim.phone || fit(MODES.medio).s < 0.7;
      if (best.s < 0.75) for (const k of [narrow ? 'alto' : 'medio', 'lateral']) {
        const f = fit(MODES[k]);
        if (f.s > best.s * 1.08) { mode = k; best = f; }
      }
      return [MODES[mode].W, best.H, MODES[mode].x0, mode];
    };
    // Medidas de un multímetro sin escalar (ver shape): extendido, compactado y corto (cs, el del celular).
    const MW = { full: 152, small: 184, h: 212, hs: 70, cs: 144 };
    // La fuente se dibuja en sus coordenadas (SL, ver más abajo) escalada g.FK; g.FL dice cuál de sus
    // acomodos lleva. fit: la escala con la que cabe en un ancho.
    const fit = (lay, w) => Math.min(1, w / SL[lay].w);
    // En el celular (alto y lateral) cada instrumento tiene dos versiones: la corta, que solo deja leer (los
    // multímetros) o hacer lo de siempre (la fuente: POWER y COARSE del canal A), y la abierta (st.front: 'src',
    // 'a' o 'b'), grande y con todos sus mandos. Se abre uno a la vez con su tecla (FOLD). Sin ninguno abierto, las
    // versiones cortas van en un renglón: multímetro · fuente · segundo multímetro (en el lateral, donde sobra alto,
    // los multímetros arriba de la fuente y más grandes). La fuente abierta va a lo ancho
    // con las demás cortas en un renglón arriba; un multímetro abierto, con las demás cortas en una columna a su
    // lado (los multímetros arriba de la fuente). Todos alineados por su base; da dónde empieza lo de arriba.
    // PH: el espacio entre ellos, lo que sobresalen los bornes de un multímetro, la escala más grande de las
    // versiones cortas (k; kl en el lateral) y la del multímetro abierto (open; openL en el lateral).
    const PH = { gap: 12, plate: 16, k: 1.2, kl: 1.5, open: 1.3, openL: 1.35 };
    const cw = k => k === 'src' ? SL.mini.w : MW.cs, chh = k => k === 'src' ? SL.mini.h : MW.hs + PH.plate;
    const phoneDesk = (g, box, cx, base, avail, lateral) => {
      const f = st.front, rest = ['a', 'src', 'b'].filter(k => k !== f && (k === 'src' || st.show[k]));
      const put = (k, x, y, s) => { if (k === 'src') { box('mini', s); g.BX = x - g.BW / 2; g.BY = y - g.BH; } else { g.mk[k] = s; g.meters[k] = [x, y]; } };
      const row = (items, y, kMax = lateral ? PH.kl : PH.k) => {
        const nat = items.reduce((t, k) => t + cw(k), 0) + PH.gap * (items.length - 1), s = Math.min(kMax, avail / nat);
        let x = cx - nat * s / 2;
        items.forEach(k => { put(k, x + cw(k) * s / 2, y, s); x += (cw(k) + PH.gap) * s; });
        return y - Math.max(...items.map(chh)) * s;
      };
      if (f === 'src') {
        box('wide', fit('wide', avail)); g.BX = cx - g.BW / 2; g.BY = base - g.BH;
        return row(rest, g.BY - PH.gap);
      }
      if (!f && lateral) {
        const ms = rest.filter(k => k !== 'src'), mw = ms.length * MW.cs + PH.gap * Math.max(0, ms.length - 1);
        const hh = SL.mini.h + (ms.length ? chh('a') + PH.gap : 0), s = Math.min(PH.kl, avail / Math.max(mw, SL.mini.w), (base - 30) / hh);
        put('src', cx, base, s);
        return ms.length ? row(ms, base - (SL.mini.h + PH.gap) * s, s) : base - SL.mini.h * s;
      }
      if (!f) return row(rest, base);
      const mk = lateral ? PH.openL : PH.open, mw = MW.full * mk, colN = Math.max(...rest.map(cw));
      const s = Math.min(PH.k, (avail - mw - PH.gap) / colN), colW = colN * s, x0 = cx - (mw + PH.gap + colW) / 2, left = f === 'a';
      g.mk[f] = mk; g.meters[f] = [left ? x0 + mw / 2 : x0 + colW + PH.gap + mw / 2, base];
      const colX = left ? x0 + mw + PH.gap + colW / 2 : x0 + colW / 2;
      let y = base;
      for (const k of [...rest].sort((p, q) => (q === 'src') - (p === 'src'))) { put(k, colX, y, s); y -= chh(k) * s + PH.gap; }
      return Math.min(y + PH.gap, base - (MW.h + PH.plate) * mk);
    };
    // g.meters[k] = [x del centro, y de su base] y g.mk[k] su escala; g.DESK es dónde empieza la mesa (y, o x en
    // el lateral).
    const geometry = (side, W, H, mode = 'ancho') => {
      const g = { side, W, H, mode, X0: 180, X1: 640, PX: 400, TOP: 140, mk: { a: 1, b: 1 }, meters: { a: [400, H], b: [400, H] } };
      const box = (lay, k) => { g.FL = lay; g.FK = k; g.BW = SL[lay].w * k; g.BH = SL[lay].h * k; };
      if (mode === 'lateral') {
        g.DESK = 668;
        const right = 110 + W;   // la orilla derecha de lo que se ve
        phoneDesk(g, box, (g.DESK + right) / 2, H - 12, right - g.DESK - 24, true);
        g.BOT = H - 64;
        g.COL = [650, 10];   // arriba de la mesa no cabe: va arriba a la derecha del circuito
        g.TOP = 170;         // y el circuito baja un poco para dejarle lugar
      } else if (mode === 'alto') {
        g.DESK = phoneDesk(g, box, g.PX, H - 18, W - 20, false) - 16;
        g.BOT = g.DESK - 56;
        g.COL = [660, 10];
        g.TOP = 170;
      } else {
        // multímetro · fuente · segundo multímetro (en medio, con la fuente apilada)
        const medio = mode === 'medio', slot = medio ? MW.full : MW.small - 14, gap = 12;
        box(medio ? 'stack' : 'wide', fit(medio ? 'stack' : 'wide', W - 16 - 2 * slot - 2 * gap));
        const base = H - 20, x0 = g.PX - (2 * slot + g.BW + 2 * gap) / 2;
        g.BX = x0 + slot + gap; g.BY = base - g.BH;
        g.meters = { a: [x0 + slot / 2, base], b: [g.BX + g.BW + gap + slot / 2, base] };
        g.DESK = Math.min(base - MW.h - 24, g.BY - 44);   // con lugar para el cuello de la fuente
        g.BOT = g.DESK - 26;
        g.COL = [W - 12, 10];
        if (medio) { g.COL = [705, 10]; g.TOP = 170; }   // angosto: el circuito baja para dejarle lugar
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
      const g = geometry(side, W, H, mode), old = side === 'w' ? b.gw : b.ge;
      g.VX = (side === 'w' ? b.pw : b.pe).x0 || 0;   // x del dibujo en el borde izquierdo de lo que se ve
      Sim.compact = mode !== 'ancho';
      if (side === 'w') b.gw = g; else b.ge = g;
      // Si el circuito cambia de alto (al abrir o cerrar un instrumento en el celular), las puntas puestas lo
      // siguen: las del cable de abajo bajan con él y las demás se estiran con el circuito (las dos geometrías
      // dan el mismo circuito: basta con hacerlo una vez).
      if (side === 'e' && old && st.clamps && old.mode === mode && (old.TOP !== g.TOP || old.BOT !== g.BOT)) {
        const nearBot = 80, k = (g.BOT - nearBot - g.TOP) / (old.BOT - nearBot - old.TOP);
        const ny = y => y >= old.BOT - nearBot ? y + g.BOT - old.BOT : g.TOP + (y - old.TOP) * k;
        for (const kind of MS) st.clamps[kind].forEach((q, i) => { if (st.placed[kind][i]) st.clamps[kind][i] = [q[0], ny(q[1])]; });
      }
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
    // Con follow, sigue a su componente en la vista de nodos (b.follow).
    b.place = (side, el, pos, follow) => {
      panel(side).box.querySelector('.sim-layer').appendChild(el);
      panel(side).at(el, follow ? () => (b.follow ? b.follow(pos(geo(side))) : pos(geo(side))) : () => pos(geo(side)));
      return el;
    };
    // Un botón en cada lado que hacen lo mismo. text(side) da su texto; b.refresh() lo actualiza.
    // onClick(side, el) recibe el lado y el botón que se tocó. Con act ('com', 'med'…) también va en su
    // sección de la columna de controles, y mientras la columna se ve, sale del dibujo.
    const buttons = [];
    const shownSide = () => Sim.view === 'w' ? 'w' : 'e';
    b.linkedButton = ({ pos, text, label, onClick, cls = 'sim-btn small', hidden, act }) => {
      const pair = ['w', 'e'].map(side => {
        const el = document.createElement('button');
        el.type = 'button'; el.className = cls + (act ? ' side-dup' : '');
        if (act) el.dataset.act = act;
        el.addEventListener('click', () => { onClick(side, el); b.refresh(); });
        return b.place(side, el, pos, true);
      });
      const extra = act && Sim.side ? Sim.side.button(act, '', () => { const sd = shownSide(); onClick(sd, pair[sd === 'w' ? 0 : 1]); b.refresh(); }) : null;
      buttons.push({ pair, text, label, hidden, extra });
      b.refresh();
      return pair;
    };
    b.refresh = () => {
      buttons.forEach(({ pair, text, label, hidden, extra }) => {
        pair.forEach((el, k) => {
          const side = k ? 'e' : 'w';
          if (text) el.textContent = text(side);
          if (label) el.setAttribute('aria-label', label(side));
          if (hidden) el.hidden = hidden();
        });
        if (extra) { extra.textContent = text(shownSide()); extra.hidden = !!(hidden && hidden()); }
      });
      choices.forEach(({ pair, get }) => pair.forEach(el =>
        el.querySelectorAll('button').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.v === get())))));
      b.pw.replace(); b.pe.replace();
    };
    // Selector de opciones (por ejemplo Serie | Paralelo) en cada lado, enlazados: options son
    // [valor, texto]; get() da la opción elegida y set(valor) la cambia.
    const choices = [];
    b.linkedChoice = ({ pos, options, get, set, label, act }) => {
      const make = () => {
        const el = document.createElement('div');
        el.className = 'sim-seg'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', label);
        if (act) el.dataset.act = act;
        options.forEach(([v, t]) => {
          const btn = document.createElement('button');
          btn.type = 'button'; btn.textContent = t; btn.dataset.v = v;
          btn.addEventListener('click', () => { if (get() !== v) { set(v); b.refresh(); } });
          el.appendChild(btn);
        });
        return el;
      };
      const pair = ['w', 'e'].map(side => b.place(side, make(), pos));
      if (act && Sim.side) { const el = make(); Sim.side.row(act, label, el); pair.push(el); }   // el del dibujo se queda
      choices.push({ pair, get });
      b.refresh();
      return pair;
    };
    Sim.onView(() => b.refresh());   // el botón de la columna dice lo del lado que se ve
    // Un componente que abre su menú al tocarlo (Sim.menu): menu(side) da { title, rows }.
    // Lo que cambia en el menú se ve en los dos lados.
    b.part = ({ pos, label, menu, cls = 'sim-hit', hidden }) => {
      const els = b.linkedButton({ cls, pos, label, hidden, onClick: (side, el) => Sim.menu.toggle(el, menu(side)) });
      if (Sim.side) Sim.side.part({ anchor: () => els[shownSide() === 'w' ? 0 : 1], menu: () => menu(shownSide()) });
      return { els, open: () => els.some(el => Sim.menu.isOpen(el)) };
    };
    // Una perilla en cada lado, enlazadas. scale(side) da las marcas [texto, fracción]; caption(side) su nombre.
    b.linkedKnob = ({ pos, min, max, step, magnet, value, label, format, scale, caption, ticks = 12, onInput }) => {
      const ks = {};
      ['w', 'e'].forEach(side => {
        const el = b.place(side, document.createElement('div'), pos);
        ks[side] = Sim.knob(el, { min, max, step, magnet, value, label: label(side), format: v => format(v, side),
          onInput: v => { onInput(v); const other = ks[side === 'w' ? 'e' : 'w']; if (other) other.set(v, true); } });
      });
      b.knobs.push({ pos, scale, caption, ticks });
      return ks;
    };

    // Una resistencia que se ajusta pellizcando. Tocarla abre su tarjeta (con Enter o Espacio también) y
    // la deja seleccionada: entonces aparecen sus asas, arriba y abajo del tramo angosto (o de la
    // resistencia), y arrastrando una el borde sigue al puntero; con dos dedos, el ancho es la separación
    // entre ellos. Sin la tarjeta abierta no hay asas y arrastrarla no la cambia. Más angosto = más
    // resistencia. half(R) da el medio ancho del tramo y fromHalf(h) la resistencia para un medio ancho;
    // set(R) la cambia. La rueda del ratón siempre la cambia: girar hacia arriba sobre la mitad de arriba
    // ensancha el tubo y sobre la de abajo lo angosta (como si se arrastrara esa asa).
    // Devuelve { drag, grip } para b.grips: grip es −1 (la marca de arriba), 1 (la de abajo), 2 (las
    // dos, con dos dedos) o 0.
    b.pinch = ({ pos, get, set, half, fromHalf, label, text, menu }) => {
      const pr = { drag: false, grip: 0, els: [] };
      pr.open = () => pr.els.some(el => Sim.menu.isOpen(el));
      // flechas y rueda: un poco más ancho o angosto, lo justo para pasar al valor de junto
      const nudge = f => {
        for (let k = 1; k <= 120; k++) { const R = fromHalf(half(get()) + f * k * 0.05); if (R !== get()) return set(R); }
      };
      ['w', 'e'].forEach(side => {
        const el = document.createElement('div');
        pr.els.push(el);
        el.className = 'sim-pinch'; el.tabIndex = 0; el.setAttribute('role', menu ? 'button' : 'slider');
        el.setAttribute('aria-label', label(side));
        if (menu) el.setAttribute('aria-haspopup', 'dialog');
        b.place(side, el, pos, true);
        const p = panel(side), pts = new Map();
        let start = 0, moved = false;
        const toY = e => (e.clientY - p.box.getBoundingClientRect().top - p.oy) / p.scale;
        const gripAt = y => y < pos(geo(side))[1] ? -1 : 1;
        // con un dedo, la marca agarrada sigue al puntero (aunque cruce al otro lado se queda angosto)
        const update = () => {
          const ys = [...pts.values()];
          const h = ys.length > 1 ? Math.abs(ys[0] - ys[1]) / 2 - 9 : (pr.grip || 1) * (ys[0] - pos(geo(side))[1]) - 14;
          set(fromHalf(h));
        };
        // Con menú, el borde sigue al puntero solo si su tarjeta está abierta (las asas a la vista) y se
        // arrastra: un toque abre o cierra la tarjeta.
        const can = () => !menu || pr.open();
        const grab = () => { moved = true; if (!can()) return; pr.drag = true; update(); };
        el.addEventListener('pointerdown', e => {
          el.setPointerCapture(e.pointerId); pts.set(e.pointerId, toY(e)); e.preventDefault();
          if (pts.size === 1) { start = e.clientY; moved = false; pr.grip = gripAt(toY(e)); } else pr.grip = 2;
          if (!menu || (pts.size > 1 && can())) grab();
        });
        el.addEventListener('pointermove', e => {
          if (!pts.has(e.pointerId)) { if (!pts.size) pr.grip = gripAt(toY(e)); return; }
          pts.set(e.pointerId, toY(e));
          if (moved) { if (pr.drag) update(); } else if (Math.abs(e.clientY - start) > Sim.DEAD.drag) grab();
        });
        const up = e => {
          if (!pts.has(e.pointerId)) return;
          pts.delete(e.pointerId);
          if (pts.size) return;
          pr.drag = false;
          if (e.pointerType !== 'mouse') pr.grip = 0;   // en pantallas táctiles no queda el dedo encima
          if (menu && !moved && e.type === 'pointerup') Sim.menu.toggle(el, menu(side));
        };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
        el.addEventListener('pointerleave', () => { if (!pts.size) pr.grip = 0; });
        el.addEventListener('wheel', e => {
          e.preventDefault();
          pr.grip = gripAt(toY(e));
          nudge((e.deltaY < 0 ? 1 : -1) * -pr.grip);
        }, { passive: false });
        el.addEventListener('keydown', e => {
          if (menu && (e.key === 'Enter' || e.key === ' ')) { Sim.menu.toggle(el, menu(side)); e.preventDefault(); return; }
          const f = { ArrowUp: -1, ArrowRight: -1, ArrowDown: 1, ArrowLeft: 1 }[e.key];
          if (f) { nudge(f); e.preventDefault(); }
        });
        setInterval(() => el.setAttribute(menu ? 'aria-description' : 'aria-valuetext', text(get())), 500);
      });
      if (menu && Sim.side) Sim.side.part({ anchor: () => pr.els[shownSide() === 'w' ? 0 : 1], menu: () => menu(shownSide()) });
      return pr;
    };
    // Asas arriba y abajo del tramo (o de la resistencia), a la distancia del borde h: solo se ven con su
    // tarjeta abierta (el componente seleccionado), en azul, y aparecen y se van con el contorno. La que se
    // agarra va llena. active es lo que devuelve b.pinch (o true para verlas siempre).
    b.grips = (ctx, x, y, h, active) => {
      const a = active === true ? 1 : active ? Sim.fadeSel(active, active.open()) : 0;
      if (!a) return;
      ctx.save(); ctx.globalAlpha *= a;
      for (const sgn of [-1, 1]) {
        const on = active !== true && active.drag && (active.grip === sgn || active.grip === 2), yy = y + sgn * (h + 9);
        D.roundRect(ctx, x - 16, yy - 4, 32, 8, 4, on ? C.sel : C.card, C.sel, 2);
        D.arrow(ctx, x + 25, yy, sgn * Math.PI / 2, 5, C.sel);
      }
      ctx.restore();
    };
    // Nombre y valor de un componente sobre el dibujo, en una línea ("resistencia 1 kΩ", ver D.tag), y su
    // estado en una pastilla al lado ("cerrado"). Mientras su tarjeta está abierta (pr de b.pinch o b.part) el
    // nombre y el valor van en azul, como su contorno. Con left, x es donde empieza (no el centro).
    b.tag = (ctx, pr, x, y, name, value, danger, left, state) =>
      D.tag(ctx, x, y, name, value, { sel: !!(pr && pr.open && pr.open()), danger, state, align: left ? 'left' : 'center' });

    // Las etiquetas de varios componentes en un renglón (ver D.tagRow): cada una { x, pr, name, value, danger,
    // state }; sin salirse del dibujo de su lado.
    b.tagRow = (ctx, g, y, items) => D.tagRow(ctx, y, items.map(it => ({ ...it, sel: !!(it.pr && it.pr.open && it.pr.open()) })), g.VX + 8, g.VX + g.W - 8);

    // ---------- la fuente se mueve ----------
    // La bomba (o la fuente) y su controlador son un solo bloque, como una fuente de laboratorio: se
    // arrastra (de la caja o del símbolo) a donde se quiera y dos cables, rojo del + y negro del − (en el
    // agua, dos mangueras), la siguen conectada a sus dos puntos del circuito. El circuito es el mismo:
    // solo cambia por dónde van los cables. Soltada cerca de su lugar, un imán la regresa ahí y los
    // cables desaparecen. En el celular horizontal el controlador ya está aparte: solo se mueve la caja.
    // spos: cuánto se movió en cada acomodo.
    const SNAP = 30;   // radio del imán de su lugar
    st.spos = {}; st.sheld = false; st.svel = null;
    const unitLimits = g => {
      const top = apart(g) ? g.BY : g.BOT - 46, bot = g.BY + g.BH;
      return [g.VX + 4 - g.BX, g.VX + g.W - 4 - g.BX - g.BW, 4 - top, g.H - 4 - bot];
    };
    const unitOff = g => {
      const o = st.spos[g.mode];
      if (!o) return [0, 0];
      const [x0, x1, y0, y1] = unitLimits(g);
      let dx = Math.max(x0, Math.min(x1, o[0])), dy = Math.max(y0, Math.min(y1, o[1]));
      // arrastrándola cerca de su lugar el imán la jala: se estira poco a poco hacia el dedo
      const d = Math.hypot(dx, dy);
      if (st.sheld && d < SNAP) { const k = Math.max(0, (d - Sim.DEAD.drag) / (SNAP - Sim.DEAD.drag)) ** 2; dx *= k; dy *= k; }
      return [dx, dy];
    };
    const boxAt = g => { const [dx, dy] = unitOff(g); return [g.BX + dx, g.BY + dy]; };
    // El símbolo (la bomba o la pila) va con la caja, salvo en el celular, donde la caja está en la mesa
    // aparte del circuito.
    const apart = g => g.mode === 'alto' || g.mode === 'lateral';
    const symAt = g => { if (apart(g)) return [g.PX, g.BOT]; const [dx, dy] = unitOff(g); return [g.PX + dx, g.BOT + dy]; };
    // Qué tan afuera de su lugar está el símbolo (0 en su lugar, 1 ya con sus cables a la vista).
    const awayK = g => { const [x, y] = symAt(g); return Math.min(1, Math.hypot(x - g.PX, y - g.BOT) / 16); };
    const moveUnit = (g, x, y) => {
      const [x0, x1, y0, y1] = unitLimits(g);
      st.spos[g.mode] = [Math.max(x0, Math.min(x1, x - g.BX)), Math.max(y0, Math.min(y1, y - g.BY))];
      st.svel = null;
      b.pw.replace(); b.pe.replace();
    };
    // Zonas para agarrarla: la caja y el símbolo. Van debajo de los demás controles (el interruptor y
    // las perillas siguen funcionando). Tocarla sin arrastrar abre su tarjeta: la polaridad y los cables.
    const srcEls = [], srcBox = {};
    const srcOpen = () => ['w', 'e'].some(sd => srcBox[sd] && Sim.menu.isOpen(srcBox[sd]));
    const srcMenu = side => {
      const w = side === 'w';
      return { float: true, title: w ? 'Bomba' : 'Fuente', ignore: t => srcEls.includes(t), rows: [
        { label: 'Polaridad', seg: [{ value: false, text: 'Normal' }, { value: true, text: 'Invertida' }], get: () => st.rev,
          set: v => { if (v !== st.rev) { st.rev = v; st.rpress = performance.now() + 140; syncPol(); } } },
        { label: w ? 'Mangueras' : 'Cables', seg: [{ value: true, text: 'Tensas' }, { value: false, text: 'Libres' }].map(o => w ? o : { ...o, text: o.value ? 'Tensos' : 'Libres' }),
          get: () => st.staut, set: v => { st.staut = v; if (v) tenseLeads(); syncSrcKeys(); } },
        { actions: [{ text: 'Tensar una vez', onClick: tenseLeads }] }
      ] };
    };
    ['w', 'e'].forEach(side => {
      const name = side === 'w' ? 'la bomba' : 'la fuente';
      const grab = (cls, pos, size) => {
        const el = document.createElement('button');
        el.type = 'button'; el.className = 'sim-src-hit ' + cls; el.dataset.act = 'ali';
        el.setAttribute('aria-label', `${name[3].toUpperCase() + name.slice(4)}: tócala para ver sus opciones; arrástrala (o usa las flechas) y sus cables la siguen`);
        el.setAttribute('aria-haspopup', 'dialog');
        srcEls.push(el); if (cls === 'box') srcBox[side] = el;
        panel(side).box.querySelector('.sim-layer').prepend(el);
        panel(side).at(el, () => {
          const g = geo(side), s = panel(side).scale, [w, h] = size(g);
          el.style.width = w * s + 'px'; el.style.height = h * s + 'px';
          el.hidden = cls === 'sym' && apart(g);
          return pos(g);
        });
        let down = null, from = null, moved = false;
        el.addEventListener('pointerdown', e => {
          el.setPointerCapture(e.pointerId); down = [e.clientX, e.clientY]; from = boxAt(geo(side)); moved = false; e.preventDefault();
        });
        el.addEventListener('click', () => { if (!moved) Sim.menu.toggle(srcBox[side], srcMenu(side)); moved = false; });
        el.addEventListener('pointermove', e => {
          if (!down || !el.hasPointerCapture(e.pointerId)) return;
          if (!st.sheld && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) return;
          moved = true;
          if (!st.sheld && !st.spos[geo(side).mode]) st.spos[geo(side).mode] = [0, 0];
          st.sheld = true; el.classList.add('held');
          const s = panel(side).scale;
          moveUnit(geo(side), from[0] + (e.clientX - down[0]) / s, from[1] + (e.clientY - down[1]) / s);
        });
        const up = () => {
          if (!down) return;
          down = null; el.classList.remove('held');
          if (!st.sheld) return;
          // cerca de su lugar: sale de donde se ve (ya jalada por el imán) y regresa con un rebote
          const g = geo(side), shown = unitOff(g);
          st.sheld = false;
          if (Math.hypot(...shown) < SNAP) { st.spos[g.mode] = shown; st.svel = [0, 0]; }
        };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
        el.addEventListener('keydown', e => {
          const step = { ArrowUp: [0, -12], ArrowDown: [0, 12], ArrowLeft: [-12, 0], ArrowRight: [12, 0] }[e.key];
          if (!step) return;
          const g = geo(side), [x, y] = boxAt(g);
          moveUnit(g, x + step[0], y + step[1]);
          e.preventDefault();
        });
      };
      grab('box', g => { const [x, y] = boxAt(g); return [x + g.BW / 2, y + g.BH / 2]; }, g => [g.BW, g.BH]);
      grab('sym', g => symAt(g), () => [84, 84]);
    });

    // Todo lo de la fuente va en sus coordenadas (SL): at(g, p) lo pone en el dibujo y chAt(g, c, p) hace lo
    // mismo con lo de un canal. px(side, d) es el tamaño en pantalla de d unidades de la fuente.
    const lay = g => SL[g.FL];
    // Lo que no va en el acomodo de ahora (p o el canal sin dar, como en la versión corta) da null: se esconde.
    const at = (g, p) => { if (!p) return null; const [x, y] = boxAt(g); return [x + p[0] * g.FK, y + p[1] * g.FK]; };
    const chAt = (g, c, p) => { const o = lay(g).ch[c]; return o && p ? at(g, [o[0] + p[0], o[1] + p[1]]) : null; };
    const px = (side, d) => d * geo(side).FK * panel(side).scale;
    const CHS = ['A', 'B'];
    // Botón de los cables de la fuente, como el de los multímetros: encendido (como empieza) sus cables
    // siempre van tensos, derechos del bloque al circuito; apagado se quedan como se acomoden. Tensarlos una
    // sola vez está en la tarjeta de la fuente.
    const SK = [26, 18];   // tamaño de la tecla
    st.staut = true; st.spress = 0;
    // Teclas físicas que se dibujan en el canvas: aquí solo queda la zona para tocarlas.
    const physKey = (side, pos, dim, onClick) => {
      const bt = document.createElement('button');
      bt.type = 'button'; bt.className = 'sim-meter-btn phys sim-src-ctl'; bt.dataset.act = 'ali';
      b.place(side, bt, g => {
        const [w, h] = dim(g);
        bt.style.width = Math.max(30, px(side, w + 6)) + 'px'; bt.style.height = Math.max(26, px(side, h + 6)) + 'px';
        return pos(g);
      });
      bt.addEventListener('click', onClick);
      return bt;
    };
    // La de la polaridad invierte la salida (el + y el − cambian de lugar). Se queda hundida, con su lucecita
    // roja, mientras está invertida.
    st.rev = false; st.rpress = 0;
    const sgn = () => st.rev ? -1 : 1;
    const polKeys = ['w', 'e'].map(side => [physKey(side, g => at(g, lay(g).pol), () => SK,
      () => { st.rpress = performance.now() + 140; st.rev = !st.rev; syncPol(); }), side]);
    const syncPol = () => polKeys.forEach(([bt, side]) => {
      const what = side === 'w' ? 'la bomba' : 'la fuente';
      const l = st.rev ? `Regresar ${what} a su polaridad normal` : `Invertir la polaridad de ${what}: el + y el − cambian de lugar`;
      bt.setAttribute('aria-label', l); bt.title = l; bt.setAttribute('aria-pressed', String(st.rev));
    });
    syncPol();
    const tenseLeads = () => ['w', 'e'].forEach(side => [0, 1].forEach(j => { const r = ropes[side]['s' + j]; if (r) r.tense = 0.8; }));
    const srcKeys = ['w', 'e'].map(side => [physKey(side, g => at(g, lay(g).cab), () => SK, () => {
      st.spress = performance.now() + 140;
      st.staut = !st.staut; if (st.staut) tenseLeads();
      syncSrcKeys();
    }), side]);
    const syncSrcKeys = () => srcKeys.forEach(([bt, side]) => {
      const what = side === 'w' ? 'las mangueras de la bomba' : 'los cables de la fuente';
      const label = st.staut ? `Soltar ${what}` : `Tensar ${what}`;
      bt.setAttribute('aria-label', label); bt.title = label; bt.setAttribute('aria-pressed', String(st.staut));
    });
    syncSrcKeys();
    // En el celular, abrir un instrumento (st.front, ver phoneDesk) o cerrarlo: la mesa se acomoda de nuevo, el
    // circuito cambia de alto y lo que se movió de su lugar regresa.
    const setFront = v => {
      if (st.front === v) return;
      st.front = v;
      st.spos = {}; st.mpos = {};
      [b.pw, b.pe].forEach(p => p.onLayout(p.W, p.H, p.mode));
      syncFold(); syncs.forEach(f => f());
      b.pw.replace(); b.pe.replace();
    };
    b.setFront = setFront;
    const foldKeys = ['w', 'e'].map(side => [physKey(side, g => apart(g) ? at(g, lay(g).fold) : null, () => FOLD,
      () => { st.fpress = performance.now() + 140; setFront(st.front === 'src' ? null : 'src'); }), side]);
    st.fpress = 0;
    const syncFold = () => foldKeys.forEach(([bt, side]) => {
      const what = side === 'w' ? 'la bomba' : 'la fuente', open = st.front === 'src';
      const l = open ? `Cerrar ${what}: la versión corta` : `Abrir ${what}, con todos sus mandos`;
      bt.setAttribute('aria-label', l); bt.title = open ? 'Cerrar' : 'Abrir'; bt.setAttribute('aria-pressed', String(open));
    });
    syncFold();

    // ---------- la fuente: dos canales, como la BK 1761 del taller ----------
    // POWER enciende los dos canales. En cada uno, VOLTAGE con dos perillas, COARSE (de 0,5 en 0,5 V) y FINE
    // (±0,5 V de 10 en 10 mV), y CURRENT, el límite de corriente (de 0 a 3 A). La pantallita marca lo que en
    // verdad sale por sus bornes (sube y baja con la inercia): el voltaje o, con su tecla V/A, la corriente; al
    // girar una perilla marca un momento lo que pide esa perilla. El canal da el voltaje de sus perillas mientras
    // la corriente no pase del límite (CV, verde); si se pasaría, sostiene la corriente en el límite y baja el
    // voltaje lo necesario (CC, rojo). En el agua, la bomba de dos canales: presión y caudal máximo, en psi y L/s.
    const power = ['w', 'e'].map(side => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'sim-power sim-src-ctl'; el.dataset.act = 'ali'; el.innerHTML = Sim.SWITCH;
      b.place(side, el, g => {
        const k = lay(g).powK;   // en la versión corta, más chica y sin ON/OFF escritos
        el.style.setProperty('--s', geo(side).FK * panel(side).scale * (k || 1)); el.classList.toggle('bare', !!k);
        return at(g, lay(g).pow);
      });
      el.addEventListener('click', () => { st.on = !st.on; syncPower(); b.refresh(); });
      return [el, side];
    });
    const syncPower = () => power.forEach(([el, side]) => {
      el.setAttribute('aria-pressed', String(st.on));
      el.setAttribute('aria-label', 'POWER: ' + (st.on ? 'apagar ' : 'encender ') + (side === 'w' ? 'la bomba' : 'la fuente'));
    });
    syncPower();
    const PEEK = 1.5;   // segundos que la pantallita marca lo que pide la perilla que se giró
    const peek = (c, k) => { st.ch[c].peek = { k, until: performance.now() + PEEK * 1000 }; };
    const chName = (c, side) => `${side === 'w' ? 'de la bomba' : 'de la fuente'}, canal ${c}`;
    const KNOBS = {
      co: { min: 0, max: VMAX, step: 0.5, magnet: 1, get: h => h.co, set: (h, v) => { h.co = v; },
        label: (c, side) => `VOLTAGE COARSE ${chName(c, side)}: ${side === 'w' ? 'presión' : 'voltaje'}, de 0,5 en 0,5` },
      fi: { min: -0.5, max: 0.5, step: 0.01, get: h => h.fi, set: (h, v) => { h.fi = v; },
        label: (c, side) => `VOLTAGE FINE ${chName(c, side)}: ${side === 'w' ? 'presión' : 'voltaje'} fino, ±0,5` },
      cu: { min: 0, max: LIMS.length - 1, step: 1, get: h => LIMS.indexOf(h.lim), set: (h, k) => { h.lim = LIMS[k]; },
        label: (c, side) => `CURRENT ${chName(c, side)}: ${side === 'w' ? 'caudal' : 'corriente'} máximo` }
    };
    const vText = (v, side) => fmt(v * (side === 'w' ? PSI_PER_V : 1), 2) + (side === 'w' ? ' psi' : ' V');
    const iText = (i, side) => side === 'w' ? fmt(i * MLS_PER_MA / 1000, 3) + ' L/s' : fmt(i / 1000, 3) + ' A';
    CHS.forEach(c => Object.entries(KNOBS).forEach(([k, K]) => {
      const ks = {}, h = st.ch[c];
      ['w', 'e'].forEach(side => {
        const el = document.createElement('div');
        b.place(side, el, g => {
          const p = lay(g).c[k], q = chAt(g, c, p);
          if (q) el.style.width = Math.max(k === 'fi' ? 26 : 30, px(side, p[2])) + 'px';
          return q;
        });
        el.dataset.act = 'ali';
        ks[side] = Sim.knob(el, { min: K.min, max: K.max, step: K.step, magnet: K.magnet, value: K.get(h), label: K.label(c, side),
          format: v => k === 'cu' ? iText(LIMS[v], side) : k === 'fi' ? (v < 0 ? '−' : '+') + vText(Math.abs(v), side) + ' (en total ' + vText(setOf(c), side) + ')'
            : vText(v, side) + ' (en total ' + vText(setOf(c), side) + ')',
          onInput: v => { K.set(h, v); peek(c, k === 'cu' ? 'cu' : 'v'); ks[side === 'w' ? 'e' : 'w'].set(v, true); } });
        el.classList.add('sim-src-ctl');
      });
    }));
    // La tecla V/A de cada canal: su pantallita pasa de voltaje a corriente y de regreso.
    CHS.forEach(c => {
      const h = st.ch[c], keys = ['w', 'e'].map(side => [physKey(side, g => chAt(g, c, lay(g).c.key), g => (lay(g).c.key || [0, 0, 30, 20]).slice(2),
        () => { h.disp = h.disp === 'V' ? 'A' : 'V'; h.press = performance.now() + 140; h.peek = null; sync(); }), side]);
      const sync = () => keys.forEach(([bt, side]) => {
        const [v, i] = side === 'w' ? ['presión', 'caudal'] : ['voltaje', 'corriente'];
        const l = `Tecla V/A ${chName(c, side)}: la pantallita marca ${h.disp === 'V' ? v : i}; tócala para ver ${h.disp === 'V' ? 'el ' + i : 'la ' + v}`;
        bt.setAttribute('aria-label', l); bt.title = l; bt.setAttribute('aria-pressed', String(h.disp === 'A'));
      });
      sync();
    });

    const inercia = document.getElementById('inercia'), oIn = document.getElementById('oInercia');
    Sim.snapRange(inercia, { magnet: 0.5 });   // pasa de 0,1 en 0,1 s y se engancha en 0, 0,5, 1… s
    const setTau = () => { st.tau = +inercia.value; oIn.textContent = st.tau ? fmt(st.tau) + ' s' : 'sin'; };
    inercia.addEventListener('input', setTau); setTau();

    // ---------- puntas: los medidores se conectan al circuito ----------
    // El circuito son tramos de cable (o tubería) que se unen en sus puntas. Cada tramo lleva
    // { pts, I (mA en el sentido del recorrido), v0 (voltaje al inicio), comps: [{ at: [x, y], half, dV }] }:
    // en cada componente el voltaje baja dV a lo largo de su ancho; en el cable no cambia.
    // Las puntas no se pueden poner encima de un componente ni de la fuente.
    // Tierra común (ver drawGround): en el cable de abajo, junto al − de la fuente. En la vista de nodos,
    // en el nodo de la tierra.
    b.ground = g => {
      const p = [g.PX + SRC + 22, g.BOT], gn = net && st.nodes.u && net.nodes.find(n => n.ground);
      return gn ? lerp(p, gn.p, geomE(st.nodes.u)) : p;
    };
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
    // Tramos que da la página (o una sola vuelta) más el de la fuente, del − al +.
    // Un tramo con link: true es un contacto cerrado (un conmutador): une dos puntos para los nodos, pero
    // en el circuito normal no se le pueden poner puntas.
    const circuitList = (g, m, V) => {
      const list = o.circuit ? o.circuit(g, m, V)
        : [{ pts: b.loopPts(g), I: m.I, v0: V, comps: [{ at: [g.PX, g.TOP], half: 46, dV: V }] }];
      list.push({ pts: [[g.PX + SRC, g.BOT], [g.PX - SRC, g.BOT]], I: m.I, v0: 0, comps: [], source: true });
      return list;
    };
    // Cada componente va de d0 a d1 del tramo (o se ubica por su centro at y su medio ancho half).
    const buildSegs = list => {
      const segs = list.map(sg => {
        const comps = (sg.comps || []).map(c => {
          if (c.d0 != null) return c;
          const d = project(sg.pts, ...c.at).d;
          return { d0: d - c.half, d1: d + c.half, dV: c.dV };
        }).sort((a, c) => a.d0 - c.d0);
        const v = d => comps.reduce((u, c) => u - c.dV * Math.max(0, Math.min(1, (d - c.d0) / (c.d1 - c.d0 || 1))), sg.v0);
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
      // En la vista de nodos: dónde queda cada nodo en los tramos (para que las puntas se peguen a él).
      segs.nodes = [];
      segs.forEach((sg, k) => (sg.zones || []).forEach(z => {
        if (!segs.nodes.some(n => n.node === z.node)) segs.nodes.push({ node: z.node, k, d: z.d, x: z.node.p[0], y: z.node.p[1] });
      }));
      return segs;
    };

    // ---------- vista de nodos ----------
    // Con "Nodos" (en la sección Ver) los cables, que son ideales, se juntan: todo lo que está unido por
    // cable (o tubería) es un solo nodo con un solo voltaje (presión), y entre los nodos solo quedan los
    // componentes. El dibujo se transforma poco a poco: primero los cables se acercan y
    // luego se encoge hasta un punto. Medir voltaje es comparar dos nodos (las puntas del voltímetro se
    // pegan a ellos); medir corriente es abrir el camino entre un nodo y un componente y meter el
    // amperímetro en serie (no se puede poner encima de un nodo).
    // Cada componente de la página puede traer draw(ctx, water, g, m), que lo dibuja en su lugar de
    // siempre (el banco lo mueve y lo gira), y tag(water) → [nombre, valor, peligro, estado] para su etiqueta;
    // pr es su b.pinch o b.part (el valor va en azul mientras su menú está abierto).
    const RN = 14;        // radio de un nodo (en el agua, una cámara un poco más grande)
    const NODE_T = 1.6;   // segundos que tarda en transformarse
    st.nodes = { on: false, u: 0 }; st.nph = [];
    let net = null;
    const lerp = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
    // u de 0 a 1 es todo el cambio; la forma se mueve en la segunda parte (en la primera se colorea)
    const geomE = u => ease(Math.max(0, Math.min(1, (u - 0.3) / 0.7)));
    const keyOf = p => Math.round(p[0]) + ',' + Math.round(p[1]);
    // El pedazo del recorrido de d = a a d = b, con un punto extra a la mitad (mid es su índice):
    // ese punto va al centro del nodo aunque el pedazo sea recto.
    const piecePts = (pts, a, b) => {
      const q = [[a, D.pointAt(pts, a)], [(a + b) / 2, D.pointAt(pts, (a + b) / 2), true], [b, D.pointAt(pts, b)]];
      let s = 0;
      for (let i = 1; i < pts.length - 1; i++) {
        s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (s > a && s < b) q.push([s, pts[i]]);
      }
      q.sort((x, y) => x[0] - y[0]);
      return { pts: q.map(x => x[1]), mid: q.findIndex(x => x[2]) };
    };
    // Nodos del circuito: los pedazos de cable entre componentes, unidos donde se tocan sus puntas.
    const analyze = list => {
      const pieces = [], comps = [];
      const sp = list.find(s => s.source), plusK = keyOf(sp.pts[1]), minusK = keyOf(sp.pts[0]);
      list.forEach((sg, k) => {
        if (sg.source) return;
        const L = D.len(sg.pts);
        const cs = (sg.comps || []).map(c => {
          const d = project(sg.pts, ...c.at).d, [x, y, tx, ty] = D.frameAt(sg.pts, d);
          return { c, k, half: c.half, d0: d - c.half, d1: d + c.half, at: [x, y], a0: Math.atan2(ty, tx) };
        }).sort((p, q) => p.d0 - q.d0);
        let from = null, a = 0, v = sg.v0;
        [...cs, null].forEach(c => {
          const pp = piecePts(sg.pts, a, c ? c.d0 : L), last = pp.pts.length - 1;
          const pc = { k, ...pp, from, to: c, v, ends: [from ? null : keyOf(pp.pts[0]), c ? null : keyOf(pp.pts[last])] };
          if (from) from.next = pc;
          if (c) { c.prev = pc; comps.push(c); v -= c.c.dV; a = c.d1; from = c; }
          pieces.push(pc);
        });
      });
      const par = pieces.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i])), byKey = new Map();
      pieces.forEach((p, i) => p.ends.forEach(key => {
        if (key == null) return;
        if (byKey.has(key)) par[find(i)] = find(byKey.get(key)); else byKey.set(key, i);
      }));
      const roots = new Map();
      pieces.forEach((p, i) => {
        const r = find(i);
        if (!roots.has(r)) roots.set(r, { sx: 0, sy: 0, sl: 0, ax: 0, ay: 0, sv: 0, n: 0 });
        const n = p.node = roots.get(r);
        for (let j = 1; j < p.pts.length; j++) {
          const A = p.pts[j - 1], B = p.pts[j], l = Math.hypot(B[0] - A[0], B[1] - A[1]);
          n.sx += (A[0] + B[0]) / 2 * l; n.sy += (A[1] + B[1]) / 2 * l; n.sl += l;
        }
        n.ax += p.pts[0][0]; n.ay += p.pts[0][1]; n.sv += p.v; n.n++;
        if (p.ends.includes(minusK)) n.ground = true;
        if (p.ends.includes(plusK)) n.plus = true;
      });
      const nodes = [...roots.values()];
      nodes.forEach((n, id) => { n.id = id; n.v = n.sv / n.n; n.p = n.sl > 1 ? [n.sx / n.sl, n.sy / n.sl] : [n.ax / n.n, n.ay / n.n]; });
      comps.forEach(c => { c.A = c.prev.node; c.B = c.next.node; });
      // Que no queden encimados: entre dos nodos cabe su componente con un poco de cable a cada lado
      // (para el amperímetro), y los nodos no se tocan. Sin salirse del lugar del circuito.
      const g = b.gw;
      for (let it = 0; it < 40; it++) {
        const push = (P, Q, need) => {
          let dx = Q.p[0] - P.p[0], dy = Q.p[1] - P.p[1], d = Math.hypot(dx, dy);
          if (d >= need) return;
          if (d < 1e-3) { dx = 1; dy = 0; d = 1; }
          const f = (need - d) / 2 * 0.5 / d;
          P.p = [P.p[0] - dx * f, P.p[1] - dy * f]; Q.p = [Q.p[0] + dx * f, Q.p[1] + dy * f];
        };
        comps.forEach(c => { if (c.A !== c.B) push(c.A, c.B, 2 * c.half + 2 * RN + 70); });
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) push(nodes[i], nodes[j], 80);
        const src = { p: [g.PX, g.BOT] };   // ni encima de la fuente (ella no se mueve)
        nodes.forEach(n => { const s0 = src.p; push(src, n, 110); src.p = s0; });
        nodes.forEach(n => { n.p = [Math.max(g.X0, Math.min(g.X1, n.p[0])), Math.max(g.TOP - 30, Math.min(g.BOT - 40, n.p[1]))]; });
      }
      // Los componentes entre los mismos dos nodos (en paralelo) van lado a lado, en el orden de siempre.
      const groups = new Map();
      comps.forEach(c => {
        const key = Math.min(c.A.id, c.B.id) + '-' + Math.max(c.A.id, c.B.id);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
      });
      groups.forEach(gc => {
        const [P, Q] = gc[0].A.id <= gc[0].B.id ? [gc[0].A, gc[0].B] : [gc[0].B, gc[0].A];
        let dx = Q.p[0] - P.p[0], dy = Q.p[1] - P.p[1], l = Math.hypot(dx, dy);
        const same = P === Q;
        if (same || l < 1e-3) { dx = 1; dy = 0; l = 1; }
        const u = [dx / l, dy / l], perp = [-u[1], u[0]];
        gc.sort((a, c) => (a.at[0] * perp[0] + a.at[1] * perp[1]) - (c.at[0] * perp[0] + c.at[1] * perp[1]));
        gc.forEach((c, j) => {
          // un componente con los dos lados en el mismo nodo (en corto) queda aparte, arriba del nodo
          const off = same ? -(70 + 90 * j) : (j - (gc.length - 1) / 2) * 110;
          c.mid = [(P.p[0] + Q.p[0]) / 2 + perp[0] * off, (P.p[1] + Q.p[1]) / 2 + perp[1] * off];
          c.a1 = same ? c.a0 : c.A === P ? Math.atan2(u[1], u[0]) : Math.atan2(-u[1], -u[0]);
        });
      });
      return { pieces, comps, nodes, plusK, minusK, sig: pieces.map(p => p.pts.length + (p.to ? 'c' : '')).join(',') };
    };
    // Lugar de cada cosa con la transformación en e (0 el circuito de siempre, 1 los nodos).
    const morph = (n, e) => {
      n.comps.forEach(c => {
        const da = Math.atan2(Math.sin(c.a1 - c.a0), Math.cos(c.a1 - c.a0)), ang = c.a0 + da * e;
        const [x, y] = lerp(c.at, c.mid, e), u = [Math.cos(ang), Math.sin(ang)];
        c.pose = { x, y, ang, a: [x - u[0] * c.half, y - u[1] * c.half], b: [x + u[0] * c.half, y + u[1] * c.half] };
      });
      n.pieces.forEach(p => {
        const last = p.pts.length - 1;
        p.m = p.pts.map((q, j) => {
          if (j === 0 && p.from) return p.from.pose.b;
          if (j === last && p.to) return p.to.pose.a;
          const key = j === 0 ? p.ends[0] : j === last ? p.ends[1] : null;
          if (key && (key === n.plusK || key === n.minusK)) return q;   // la fuente no se mueve
          return lerp(q, p.node.p, e);
        });
      });
    };
    // Los tramos para las puntas con la forma de ahora: cada uno, sus pedazos y sus componentes en orden.
    const morphedList = (n, list) => {
      const out = [];
      list.forEach((sg, k) => {
        if (sg.source) { out.push(sg); return; }
        const pts = [], comps = [], zones = [];
        let L = 0;
        const add = q => {
          const l = pts.length ? Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) : 0;
          if (pts.length && l < 0.01) return;
          L += l; pts.push(q);
        };
        n.pieces.filter(p => p.k === k).forEach(p => {
          p.m.forEach((q, j) => { add(q); if (j === p.mid) zones.push({ d: L, node: p.node }); });
          if (p.to) { const d0 = L; add(p.to.pose.b); comps.push({ d0, d1: L, dV: p.to.c.dV }); }
        });
        if (pts.length > 1 && L > 0.5) out.push({ pts, I: sg.I, v0: sg.v0, comps, zones, link: sg.link });
      });
      return out;
    };
    // Las puntas puestas siguen al circuito mientras se transforma: cada una recuerda en qué pedazo de
    // cable está (y en qué parte) y va al mismo lugar del pedazo con su nueva forma.
    st.att = { a: [null, null], b: [null, null] };
    const onPiece = (pcs, x, y) => {
      let best = null;
      pcs.forEach((p, pi) => {
        for (let j = 1; j < p.m.length; j++) {
          const A = p.m[j - 1], B = p.m[j], dx = B[0] - A[0], dy = B[1] - A[1], s2 = dx * dx + dy * dy;
          const t = s2 ? Math.max(0, Math.min(1, ((x - A[0]) * dx + (y - A[1]) * dy) / s2)) : 0;
          const dist = Math.hypot(x - A[0] - dx * t, y - A[1] - dy * t);
          if (!best || dist < best.dist - 1e-6) best = { p: pi, j, t, dist };
        }
      });
      return best;
    };
    const remap = (old, n) => {
      const same = old && old.sig === n.sig;
      for (const kind of MS) st.clamps[kind].forEach(([x, y], i) => {
        let a = st.att[kind][i];
        if (!same) { st.att[kind][i] = null; return; }
        if (!a || Math.hypot(a.x - x, a.y - y) > 0.01) a = st.att[kind][i] = onPiece(old.pieces, x, y);
        if (!a || a.dist > 3) { st.att[kind][i] = null; return; }
        const p = n.pieces[a.p], q = lerp(p.m[a.j - 1], p.m[a.j], a.t);
        st.clamps[kind][i] = q; a.x = q[0]; a.y = q[1];
      });
    };
    let prevNet = null;
    const nodeView = (list, dt) => {
      const nd = st.nodes, u0 = nd.u;
      nd.u = nd.on ? Math.min(1, u0 + dt / NODE_T) : Math.max(0, u0 - dt / NODE_T);
      if (nd.u !== u0) { b.pw.replace(); b.pe.replace(); }
      if (!nd.on && !nd.u && !prevNet) { net = null; return list; }
      const n = analyze(list);
      morph(n, geomE(nd.u));
      remap(prevNet, n);
      net = prevNet = nd.on || nd.u ? n : null;
      return nd.u ? morphedList(n, list) : list;
    };
    // Un control de la página junto a un componente lo sigue a su lugar en la vista de nodos.
    b.follow = q => {
      if (!net || !st.nodes.u) return q;
      let best = null;
      for (const c of net.comps) { const d = Math.hypot(c.c.at[0] - q[0], c.c.at[1] - q[1]); if (!best || d < best.d) best = { c, d }; }
      if (!best || best.d > 70) return q;
      return [q[0] + best.c.pose.x - best.c.c.at[0], q[1] + best.c.pose.y - best.c.c.at[1]];
    };
    b.setNodes = v => { st.nodes.on = !!v; syncNodes(); };
    // Las etiquetas de la vista de nodos no suben de aquí (una página con un aviso arriba lo cambia).
    b.labelTop = { w: 6, e: 6 };
    // Dónde está conectado cada multímetro, para las páginas que revisan cómo se midió:
    // { comps, nodes, meters: { a, b } }; cada multímetro que se ve trae dial (su perilla), value (lo que
    // marca), nodes: [nodo de la roja, nodo de la negra] y, en A, cut (si cortó el cable entre sus puntas), I
    // y fuse (fundido). Lo que no está conectado va en null. Los nodos traen v (su voltaje), ground y plus;
    // comps, los componentes con c (lo que dio la página), A y B (sus nodos).
    const netNow = () => { if (net) return net; const n = analyze(circuitList(b.gw, st.m, st.vo)); morph(n, 0); return n; };
    const pieceAt = (n, kind, i) => {
      if (!st.show[kind] || !connected(kind, i)) return null;
      const q = onPiece(n.pieces, ...st.clamps[kind][i]);
      return q && q.dist < 3 ? n.pieces[q.p] : null;
    };
    b.where = () => {
      const n = netNow(), meters = {};
      for (const k of MS) {
        if (!st.show[k]) { meters[k] = null; continue; }
        const r = st.probe[k], value = r && ready(k) ? r.value : null;
        meters[k] = { dial: st.dial[k], value, nodes: [0, 1].map(i => { const p = pieceAt(n, k, i); return p ? p.node : null; }) };
        if (series(k)) Object.assign(meters[k], { cut: !!(r && r.cut), I: r && r.cut && ready(k) ? r.value : null, fuse: st.fuse[k], trip: st.trip[k] });
      }
      return { comps: n.comps, nodes: n.nodes, meters };
    };
    b.nodesOn = () => st.nodes.on;
    // Nodo en el que está cada punta del voltímetro (null si no está en un nodo o no está la vista de nodos)
    // y el componente cuyo cable abrió el amperímetro: para las páginas que revisan cómo se midió.
    b.net = () => net && st.nodes.u >= 1 ? net : null;
    const nodeSeg = document.createElement('div');
    nodeSeg.className = 'sim-seg'; nodeSeg.setAttribute('role', 'group'); nodeSeg.setAttribute('aria-label', 'Dibujo del circuito');
    nodeSeg.innerHTML = '<button type="button" data-v="0">Circuito</button><button type="button" data-v="1">Nodos</button>';
    nodeSeg.querySelectorAll('button').forEach(bt => bt.addEventListener('click', () => b.setNodes(bt.dataset.v === '1')));
    const syncNodes = () => nodeSeg.querySelectorAll('button').forEach(bt => bt.setAttribute('aria-pressed', String((bt.dataset.v === '1') === st.nodes.on)));
    syncNodes();
    if (Sim.side) {
      const row = Sim.side.row('ver', 'Dibujo', nodeSeg), view = Sim.side.sec('ver').querySelector('.sim-viewseg');
      if (view) view.closest('.sim-side-row').after(row);
    }
    // Lleva un punto al lugar más cercano del circuito donde se puede poner una punta. Con corners,
    // cerca de una esquina (por fuera o por dentro) la punta se pega a la esquina. kind es el multímetro:
    // en la vista de nodos sus puntas se pegan a los nodos y en A (en serie) no se puede poner en uno.
    const snap = (segs, x, y, corners, kind) => {
      let best = null, cn = null;
      const full = st.nodes.u >= 1 && segs.nodes && segs.nodes.length, ser = series(kind);
      if (full && !ser) {
        for (const z of segs.nodes) {
          const dist = Math.hypot(z.x - x, z.y - y);
          if (dist < RN + 40 && (!best || dist < best.dist)) best = { k: z.k, d: z.d, x: z.x, y: z.y, dist, node: z.node };
        }
        if (best) return best;
      }
      if (corners && !full) for (const c of segs.corners || []) if (Math.hypot(c.x - x, c.y - y) < 36 && (!cn || Math.hypot(c.x - x, c.y - y) < Math.hypot(cn.x - x, cn.y - y))) cn = c;
      segs.forEach((sg, k) => {
        if (sg.source || (sg.link && !st.nodes.u)) return;
        let { d } = project(sg.pts, x, y);
        if (cn) { const q = project(sg.pts, cn.x, cn.y); if (q.dist < 0.5) d = q.d; }
        if (full && ser) for (const z of sg.zones || []) {
          const r = RN + 10;
          if (d > z.d - r && d < z.d + r) d = d - (z.d - r) < z.d + r - d ? z.d - r : z.d + r;
        }
        for (const c of sg.comps) if (d > c.d0 - 8 && d < c.d1 + 8) d = d - c.d0 < c.d1 - d ? c.d0 - 8 : c.d1 + 8;
        d = Math.max(0, Math.min(sg.L, d));
        const p = D.pointAt(sg.pts, d), dist = Math.hypot(p[0] - x, p[1] - y);
        if (!best || dist < best.dist) best = { k, d, x: p[0], y: p[1], dist };
      });
      return best;
    };
    // Lectura de cada multímetro según su perilla. En V (o en el agua, presión) marca voltaje(rojo) −
    // voltaje(negro). En A el multímetro va en serie: con las dos puntas en el mismo cable (sin un
    // componente ni un nodo entre ellas) el cable se corta entre las dos (cut) y toda la corriente entra
    // por la roja y sale por la negra; positiva si la roja está del lado de donde viene. Con las puntas en
    // dos nodos con voltaje distinto el multímetro, que por dentro es casi un cable, hace un corto y se
    // bota su protección (un botón que sale y se rearma tocándolo); si la fuente puede dar más de TRIP_MAX
    // (su límite de corriente) no alcanza a protegerlo y se funde su fusible, que se cambia en Medir.
    // En Ω, la resistencia entre sus puntas (ver ohms).
    const measure = segs => {
      const out = {};
      for (const k of MS) {
        const [A, B] = st.clamps[k].map(([x, y]) => snap(segs, x, y, false, k));
        st.clamps[k] = [[A.x, A.y], [B.x, B.y]];
        const va = segs[A.k].v(A.d), vb = segs[B.k].v(B.d);
        out[k] = { value: va - vb, va, vb };
        if (st.dial[k] === 'R') out[k].value = st.show[k] && ready(k) ? ohms(k, va - vb) : NaN;
        if (st.dial[k] !== 'A') continue;
        const sg = segs[A.k], d0 = Math.min(A.d, B.d), d1 = Math.max(A.d, B.d);
        const clear = A.k === B.k && !sg.source && d1 - d0 > 6 && !sg.comps.some(c => c.d1 > d0 && c.d0 < d1);
        out[k].value = 0;
        if (clear) { out[k].value = (A.d < B.d ? 1 : -1) * sg.I; out[k].cut = { k: A.k, d0, d1 }; }
        else if (st.show[k] && ready(k) && Math.abs(va - vb) > 0.05 && !st.fuse[k] && !st.trip[k]) {
          if (st.lim > TRIP_MAX) st.fuse[k] = true; else st.trip[k] = true;
          syncs.forEach(f => f());
        }
        if (st.fuse[k] || st.trip[k]) { out[k].value = 0; out[k].cut = null; }
      }
      return out;
    };
    // Ω como un multímetro de verdad: hace pasar una corriente chiquita (1 mA) de la punta roja a la negra
    // y divide el voltaje que aparece entre esa corriente. Si el circuito no tiene voltaje, eso es la
    // resistencia entre los dos nodos, con todo lo que esté conectado entre ellos (otra resistencia en
    // paralelo baja la lectura). La fuente encendida es un camino de 0 Ω entre su + y su −; apagada, abierto.
    // Si hay voltaje entre las puntas se suma y la lectura no sirve (puede salir hasta negativa): por eso
    // se mide con la fuente apagada. Más de 40 MΩ (o sin camino) es OL.
    const I_TEST = 1e-3, OL = 40e6;
    const ohms = (k, vext) => {
      const n = netNow(), [A, B] = [0, 1].map(i => { const p = pieceAt(n, k, i); return p && p.node; });
      if (!A || !B) return NaN;
      const R = A === B ? 0 : network(n, A, B);
      if (!(R < OL)) return Infinity;
      const r = R + vext / I_TEST;
      return Math.abs(r) < OL ? r : Infinity;
    };
    // Resistencia entre los nodos A y B: la red de los componentes (con su R) y la fuente, resuelta por
    // nodos (A recibe 1 A, B es la referencia; el voltaje de A es la resistencia).
    const network = (n, A, B) => {
      const N = n.nodes.length, ix = new Map(n.nodes.map((x, i) => [x, i])), G = n.nodes.map(() => new Float64Array(N + 1));
      const add = (p, q, gg) => { if (p === q) return; G[p][p] += gg; G[q][q] += gg; G[p][q] -= gg; G[q][p] -= gg; };
      n.comps.forEach(c => { const R = c.c.R; if (R != null && R < 1e12) add(ix.get(c.A), ix.get(c.B), 1 / Math.max(R, 1e-3)); });
      const plus = n.nodes.find(x => x.plus), gnd = n.nodes.find(x => x.ground);
      if (plus && gnd && (st.on || st.v > 0.02)) add(ix.get(plus), ix.get(gnd), 1e3);
      const a = ix.get(A), bb = ix.get(B);
      G.forEach((row, i) => { row[i] += 1e-12; row[N] = i === a ? 1 : 0; });   // un poquito a tierra: sin camino es OL
      // sin el renglón y la columna de B (su voltaje es 0)
      const rows = G.filter((_, i) => i !== bb).map(row => [...row].filter((_, j) => j !== bb));
      const M = rows.length;
      for (let c = 0; c < M; c++) {
        let p = c;
        for (let r = c + 1; r < M; r++) if (Math.abs(rows[r][c]) > Math.abs(rows[p][c])) p = r;
        [rows[c], rows[p]] = [rows[p], rows[c]];
        for (let r = 0; r < M; r++) {
          if (r === c || !rows[r][c]) continue;
          const f = rows[r][c] / rows[c][c];
          for (let j = c; j <= M; j++) rows[r][j] -= f * rows[c][j];
        }
      }
      const ia = a < bb ? a : a - 1;
      return rows[ia][M] / rows[ia][ia];
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
      return v > 0.05 ? still * (0.5 + 2.2 * v / b.vScale()) : 0;
    };

    // ---------- color de las partículas ----------
    // Presión (voltaje) y caudal (corriente) en cada punto, de 0 a 1, para colorear las partículas según
    // Sim.colorMode: la presión va de 0 a b.vScale() psi (V): 12, 24 o 35, la más chica que alcanza el canal A,
    // para que con los voltajes del taller se vean los colores; baja en cada componente. El caudal va de 0 a la
    // escala completa de los medidores (iFull) y es el del tramo. Dentro de la bomba (o la fuente) la
    // presión sube de 0 a lo que sale.
    Sim.field = (x, y) => {
      let best = null, bsg = null;
      for (const sg of st.segs) {
        const p = project(sg.pts, x, y);
        if (!best || p.dist < best.dist) { best = p; bsg = sg; }
      }
      if (!best) return [0, 0];
      const v = bsg.source ? st.vo * best.d / bsg.L : bsg.v(best.d);
      return [v / b.vScale(), Math.abs(bsg.I) / iFull];
    };
    // Modo de color: en la esquina de arriba a la derecha de cada panel, un selector pequeño con el nombre de
    // cada modo (rapidez · presión · caudal; en la electricidad normal · voltaje · corriente) y debajo la
    // escala de colores, que solo es información (no se toca). En la electricidad, con el modo normal las
    // cargas van de su color de siempre: en vez de la barra dice que todas van del mismo color. La rueda del
    // multímetro también lo elige.
    const ends = side => ({
      v: ['lento', 'rápido'],
      p: side === 'w' ? ['0 psi', b.vScale() * PSI_PER_V + ' psi'] : ['0 V', b.vScale() + ' V'],
      q: ['0', side === 'w' ? iFull * MLS_PER_MA + ' mL/s' : iFull + ' mA']
    })[Sim.shownColorMode()];
    const syncColors = Sim.colorPicker({ w: b.pw, e: b.pe }, { ends, spot: side => geo(side).COL });
    // La perilla del multímetro elige el color: en V por presión (voltaje), en A por caudal (corriente),
    // en Ω u OFF el de siempre. Mientras se arrastra una punta, las partículas se colorean por lo que mide
    // su multímetro; al soltarla vuelven al modo elegido.
    const DIAL_COLOR = { V: 'p', A: 'q', R: 'v', off: 'v' };
    const colorWhileDragging = () => {
      const k = MS.find(m => st.show[m] && st.lift[m].some(Boolean) && (st.dial[m] === 'V' || st.dial[m] === 'A'));
      const c = k ? DIAL_COLOR[st.dial[k]] : null;
      if (c !== Sim.colorOverride) { Sim.colorOverride = c; syncColors(); }
    };

    // Puntas de cada multímetro: en V, Ω u OFF, [roja, negra]; en A, [la pieza en serie, (donde estaba la negra)].
    st.clamps = {
      a: [[b.gw.X0, b.gw.MY], [b.gw.X1, b.gw.MY]],
      b: [[b.gw.X1 - 20, b.gw.BOT], [b.gw.X1 - 100, b.gw.BOT]]
    };
    const syncs = [];   // muestran u ocultan los botones de las puntas
    // Cada multímetro tiene siempre dos puntas, roja (+) y negra (−), cada una con su cable: probeOf da la
    // punta de cada cable. series: la perilla en A (va en serie).
    const series = kind => st.dial[kind] === 'A';
    const NP = () => 2;
    const probeOf = (kind, j) => j;
    // placed: qué puntas están puestas en el circuito (al tocar el multímetro se quitan hasta ponerlas de nuevo).
    st.placed = { a: [false, false], b: [false, false] };   // empiezan guardadas: se toca el multímetro para ponerlas
    // Al arrastrar una punta se levanta del circuito y deja de medir. Cerca de una línea un imán la
    // jala hacia ella: si se suelta ahí cae y se conecta; si se suelta lejos se queda en el suelo.
    //   lift:  mientras se arrastra, { x, y, n } (dónde va su contacto y su última orientación)
    //   floor: { x, y, n } donde quedó en el suelo
    //   drop:  { from, t } mientras cae a su lugar en el circuito
    //   click: segundos desde que se conectó (un anillo que se expande)
    const per = v => ({ a: [v, v], b: [v, v] });
    st.lift = per(null); st.floor = per(null); st.drop = per(null); st.click = per(9);
    const MAG = 60, DROP = 0.16, MORPH = 0.35, REEL = 0.9;
    const ease = u => u * u * (3 - 2 * u);
    // Recoger: reel va de 0 a 1 mientras una punta que quedó en el suelo entra a su medidor.
    st.reel = per(0);
    const connected = (kind, i) => st.placed[kind][i] && !st.lift[kind][i] && !st.floor[kind][i] && !st.drop[kind][i] && !st.reel[kind][i];
    const ready = kind => [0, 1].slice(0, NP(kind)).every(i => connected(kind, i));
    // Multímetros junto al controlador (ver los acomodos); los bornes arriba de cada uno. Cada uno se
    // puede arrastrar a otro lugar (mpos: cuánto se movió en cada acomodo) y compactar: solo quedan su
    // pantallita y su perilla, sin la ruedita, las columnas o el tubo. cmp va de 0 a 1 para pasar de uno
    // a otro poco a poco. Compactado se recuerda en este navegador.
    st.mpos = {}; st.mheld = { a: false, b: false };
    // En el celular vertical empiezan compactados, para que el circuito se vea más grande.
    const small = matchMedia('(max-width: 600px)').matches;
    st.compact = { a: small, b: small };
    try { const c = JSON.parse(localStorage.getItem('sim-compact') || '{}'); MS.forEach(k => { if (typeof c[k] === 'boolean') st.compact[k] = c[k]; }); } catch (e) {}
    // En el celular no se compacta: su versión corta (solo para leer) y la abierta las da st.front (ver phoneDesk).
    const phoneNow = () => !!(b.ge && apart(b.ge));
    const isCompact = kind => phoneNow() ? st.front !== kind : st.compact[kind];
    const toggleCompact = kind => phoneNow() ? setFront(st.front === kind ? null : kind) : setCompact(kind, !st.compact[kind]);
    st.cmp = { a: +isCompact('a'), b: +isCompact('b') };
    // Forma del multímetro (sin escalar, desde su centro): el chasis de top a bottom (con su nombre arriba a
    // la izquierda), la pantallita (lcd, lx, su ancho lw y su alto lh), la comparación de sus dos puntas
    // (cmp) y la rueda (kx, ky, kr). Compactado, la rueda se achica y va a la derecha de la pantallita y la
    // comparación se esconde. La versión corta del celular (ph) es más angosta y no lleva rueda: solo se lee.
    const shape = kind => {
      const c = ease(st.cmp[kind]), mix = (a, z) => a + (z - a) * c, ph = phoneNow();
      const z = ph ? { hw: MW.cs / 2, lx: 16, lw: 100, kx: 16, kr: 0, b0: [-52, -8], b1: [-52, -8], bw: 22, bh: 18 }
        : { hw: 92, lx: -6, lw: 104, kx: 66, kr: 12, b0: [-74, -18], b1: [-74, -1], bw: 17, bh: 13 };
      return { top: mix(-62, -58), bottom: mix(150, 12), hw: mix(76, z.hw), lcd: mix(-8, -8), lh: mix(34, 30), lx: mix(0, z.lx), lw: mix(112, z.lw), cmp: 20, kx: mix(0, z.kx), ky: mix(104, -8), kr: mix(27, z.kr), c, ph,
        // botones físicos: recoger (0) y compactar (1); extendido a los lados de la rueda, compactado uno
        // sobre otro a la izquierda de la pantallita (en la versión corta del celular solo el de abrir).
        // Invertir (2), abajo a la izquierda de la rueda, solo extendido (compactado está en Medir).
        btn: [[mix(-60, z.b0[0]), mix(54, z.b0[1])], [mix(60, z.b1[0]), mix(54, z.b1[1])], [-60, 136]], bw: mix(22, z.bw), bh: mix(16, z.bh) };
    };
    // Su lugar en la mesa: g.meters da el centro y la base, así que al compactarlo o extenderlo la base se
    // queda donde está. En el celular vertical el segundo va encima del primero.
    const homeAt = (g, kind) => {
      const [x0, base] = g.meters[kind], k = g.mk[kind], sh = shape(kind);
      if (kind === 'b' && g.stack) { const sa = shape('a'); return [x0, base - (sa.bottom - sa.top + 26) * k - sh.bottom * k]; }
      return [x0, base - sh.bottom * k];
    };
    const meterAt = (g, kind) => {
      const [x0, y0] = homeAt(g, kind), o = st.mpos[g.mode + kind], k = g.mk[kind], sh = shape(kind);
      if (!o) return [x0, y0];
      // sin salirse de lo que se ve (con sus botones a los lados y sus bornes arriba)
      return [Math.max(g.VX + 90 * k, Math.min(g.VX + g.W - 90 * k, x0 + o[0])),
        Math.max((10 - sh.top) * k, Math.min(g.H - (sh.bottom + 6) * k, y0 + o[1]))];
    };
    const moveMeter = (g, kind, x, y) => {
      const [x0, y0] = homeAt(g, kind);
      st.mpos[g.mode + kind] = [x - x0, y - y0];
      b.pw.replace(); b.pe.replace();
    };
    // Dos bornes: VΩA (el rojo) y COM (el negro), en una placa que se recorre por la orilla de la funda
    // hacia donde van los cables (st.jpos: fracción del contorno). Los cables nunca cambian de borne.
    st.jpos = { a: 0.12, b: 0.12 };
    st.dang = { a: DANG[st.dial.a], b: DANG[st.dial.b] };
    st.dvel = { a: 0, b: 0 }; st.dpull = { a: 0, b: 0 };   // la rueda: su velocidad y su estirón hacia el dedo
    // Contorno por donde corre la placa: la funda un poco hacia afuera, con esquinas redondas. rim(sh, u)
    // da el punto, la dirección (en el sentido del reloj) y el largo total; u en [0, 1).
    const rim = (sh, u) => {
      const L = -sh.hw - 3, R = sh.hw + 3, T = sh.top - 3, B = sh.bottom + 3, rc = 13, w = R - L - 2 * rc, h = B - T - 2 * rc, q = Math.PI * rc / 2;
      const parts = [
        [w, s => [L + rc + s, T, 1, 0]],
        [q, s => { const a = -Math.PI / 2 + s / rc; return [R - rc + rc * Math.cos(a), T + rc + rc * Math.sin(a), -Math.sin(a), Math.cos(a)]; }],
        [h, s => [R, T + rc + s, 0, 1]],
        [q, s => { const a = s / rc; return [R - rc + rc * Math.cos(a), B - rc + rc * Math.sin(a), -Math.sin(a), Math.cos(a)]; }],
        [w, s => [R - rc - s, B, -1, 0]],
        [q, s => { const a = Math.PI / 2 + s / rc; return [L + rc + rc * Math.cos(a), B - rc + rc * Math.sin(a), -Math.sin(a), Math.cos(a)]; }],
        [h, s => [L, B - rc - s, 0, -1]],
        [q, s => { const a = Math.PI + s / rc; return [L + rc + rc * Math.cos(a), T + rc + rc * Math.sin(a), -Math.sin(a), Math.cos(a)]; }],
      ];
      const total = parts.reduce((t, p) => t + p[0], 0);
      let s = ((u % 1) + 1) % 1 * total;
      for (const [len, f] of parts) { if (s <= len) return [...f(s), total, parts]; s -= len; }
      return [...parts[0][1](0), total, parts];
    };
    const jackGap = sh => 26 - 6 * sh.c;   // de la placa a cada borne
    // Centro del botón de la protección (ver tripButton) y n, hacia afuera de la funda.
    // Va a la mitad del lado izquierdo de la funda; del derecho si ahí están los bornes o si a la izquierda
    // no cabe (el multímetro junto a la orilla).
    const tripU = kind => {
      const sh = shape(kind), [, , , , total, parts] = rim(sh, 0), at = i => parts.slice(0, i).reduce((t, p) => t + p[0], 0);
      const g = b.ge, tight = g && meterAt(g, kind)[0] - g.VX < (sh.hw + 34) * g.mk[kind];
      const right = st.jedge[kind] === 'L' || (tight && st.jedge[kind] !== 'R');
      return (at(right ? 2 : 6) + parts[2][0] / 2) / total;
    };
    const tripAt = kind => {
      const sh = shape(kind), [x, y, tx, ty] = rim(sh, tripU(kind)), n = [ty, -tx], o = 6 + 7 * Math.max(0, st.pop[kind]);
      return { x: x + n[0] * o, y: y + n[1] * o, n };
    };
    // Borne j en coordenadas del multímetro (sin escalar): VΩA antes y COM después, en el sentido del reloj.
    const jackLocal = (kind, j) => {
      const sh = shape(kind), [, , , , total] = rim(sh, 0);
      return rim(sh, st.jpos[kind] + (j ? 1 : -1) * jackGap(sh) / total);
    };
    const leadJack = (g, kind, j) => {
      const [x, y] = meterAt(g, kind), [px, py] = jackLocal(kind, j);
      return [x + px * g.mk[kind], y + py * g.mk[kind]];
    };
    // A dónde debe ir la placa: al lado de la funda que mira hacia las puntas (el promedio de las que
    // están afuera), recorrida a lo largo de ese lado hasta quedar frente a ellas.
    const jackTarget = (g, kind) => {
      const out = [0, 1].filter(i => st.placed[kind][i] || st.lift[kind][i] || st.floor[kind][i]);
      if (!out.length) return null;
      const [mx, my] = meterAt(g, kind), sh = shape(kind);
      const tx = out.reduce((t, i) => t + st.clamps[kind][i][0], 0) / out.length, ty = out.reduce((t, i) => t + st.clamps[kind][i][1], 0) / out.length;
      const lx = (tx - mx) / g.mk[kind], ly = (ty - my) / g.mk[kind];
      const L = -sh.hw - 3, R = sh.hw + 3, T = sh.top - 3, B = sh.bottom + 3, rc = 13, cy = (T + B) / 2;
      const dx = lx, dy = ly - cy, hw = R, hh = (B - T) / 2;
      const [, , , , total, parts] = rim(sh, 0), start = i => parts.slice(0, i).reduce((t, p) => t + p[0], 0);
      const cur = st.jedge[kind];
      let tX = hw / Math.max(1e-6, Math.abs(dx)), tY = hh / Math.max(1e-6, Math.abs(dy));
      if (cur === 'L' || cur === 'R') tX *= 0.85; else tY *= 0.85;   // un poco de preferencia por el lado de ahora
      const edge = tX < tY ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'B' : 'T');
      st.jedge[kind] = edge;
      const m = jackGap(sh) + 12, along = (len, v) => len < 2 * m ? len / 2 : Math.max(m, Math.min(len - m, v));
      const w = parts[0][0], h = parts[2][0];
      const s = edge === 'T' ? start(0) + along(w, lx - (L + rc))
        : edge === 'R' ? start(2) + along(h, ly - (T + rc))
        : edge === 'B' ? start(4) + along(w, (R - rc) - lx)
        : start(6) + along(h, (B - rc) - ly);
      return s / total;
    };
    st.jedge = { a: 'T', b: 'T' };
    const jack = (g, kind, i) => leadJack(g, kind, i);
    const jackColor = (kind, j) => j ? C.neg : RED;

    // Cada punta toca el circuito de forma perpendicular, del lado donde estaba el puntero al ponerla o
    // arrastrarla (adentro o afuera del circuito); si no hay, del lado que mira hacia su medidor.
    // Devuelve el punto de contacto y la dirección n hacia afuera del cable.
    st.tipSide = { a: [null, null], b: [null, null] };
    const frame = (g, kind, i) => frameAt(g, kind, i, ...st.clamps[kind][i], st.tipSide[kind][i]);
    const frameAt = (g, kind, i, x, y, pref) => {
      let n = [0, 1], t = null;
      const p = st.segs.length && snap(st.segs, x, y, false, kind);
      if (p && p.node) {   // en un nodo: la punta sale hacia su medidor (o hacia donde estaba el puntero)
        const [jx, jy] = jack(g, kind, i), [sx, sy] = pref || [jx - x, jy - y], l = Math.hypot(sx, sy);
        if (l) n = [sx / l, sy / l];
      } else if (p) {
        const pts = st.segs[p.k].pts, L = st.segs[p.k].L;
        const a = D.pointAt(pts, Math.max(0, p.d - 3)), c = D.pointAt(pts, Math.min(L, p.d + 3));
        const tx = c[0] - a[0], ty = c[1] - a[1], s = Math.hypot(tx, ty) || 1;
        n = [-ty / s, tx / s]; t = [tx / s, ty / s];
        // en una esquina la punta va en diagonal, por fuera o por dentro
        const cn = (st.segs.corners || []).find(c => Math.hypot(c.x - p.x, c.y - p.y) < 0.5);
        if (cn) n = cn.dir;
        const [jx, jy] = jack(g, kind, i);
        const [sx, sy] = pref || [jx - x, jy - y];
        if (n[0] * sx + n[1] * sy < 0) n = [-n[0], -n[1]];
      }
      return { x, y, n, t };
    };
    // Largo de cada punta, del contacto a donde sale su cable o manguera.
    const tipLen = side => side === 'w' ? Sim.PIPE + 10 : 46;
    // Refuerzo entre la punta y el cable (como el de los cables de verdad): un tramo más rígido que
    // no deja que el cable se doble justo al salir de la punta.
    const BOOT = 24;
    // Indicador: a qué distancia del contacto va el centro de su círculo.
    const PIN_D = 34;

    // Cada medidor recuerda si muestra sus cables o solo indicadores (tocando una punta se cambia),
    // también mientras se arrastran sus puntas. Se recuerda en este navegador. morph va de 0 (cables)
    // a 1 (indicadores) para pasar de uno a otro poco a poco.
    // El modo es el mismo para el voltímetro y el amperímetro (tocar cualquier punta cambia los dos).
    try { const p = JSON.parse(localStorage.getItem('sim-pinned') || '{}'), v = !!(p.a ?? p.V); st.pinned.a = st.pinned.b = v; } catch (e) {}
    st.morph = per(+st.pinned.a);   // de cada punta
    const togglePinned = () => { st.pinned.a = st.pinned.b = !st.pinned.a; savePinned(); syncs.forEach(f => f()); b.pw.replace(); b.pe.replace(); };
    // off: de 0 a 1, qué tan desvanecida se ve una punta (y su cable) que no está sobre el circuito:
    // más transparente y con menos color
    st.off = per(0);
    const fade = (ctx, o) => { if (o > 0) ctx.globalAlpha *= 1 - 0.45 * o; };
    const dull = (col, o) => {   // el color mezclado con su gris
      const h = /^#([0-9a-f]{6})$/i.exec(col || '');
      if (!h || !(o > 0)) return col;
      const v = parseInt(h[1], 16), c = [v >> 16, (v >> 8) & 255, v & 255], y = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
      return 'rgb(' + c.map(x => Math.round(x + (y - x) * 0.7 * o)).join(',') + ')';
    };
    const savePinned = () => { try { localStorage.setItem('sim-pinned', JSON.stringify(st.pinned)); } catch (e) {} };
    const shown = (kind, i) => st.morph[kind][i] < 0.5 && !st.reel[kind][i];

    // Levantada, el puntero (lift.x, lift.y) sostiene la parte agarrada; ox, oy es lo que le falta
    // para quedar bajo el puntero al empezar a arrastrar. Según de dónde se agarró (lift.mode):
    //   tip:    el contacto de una punta con cable; la punta gira para mirar a la línea más cercana
    //   handle: el círculo del indicador (la agarradera); el contacto gira hacia la línea más cercana
    //   magnet: el anillo del indicador (el imán); el círculo lo sigue como un llavero
    const liftContact = (kind, i) => {
      const lf = st.lift[kind][i], L = lf.mode === 'handle' ? PIN_D * ease(st.morph[kind][i]) : 0;
      return [lf.x + lf.ox - lf.n[0] * L, lf.y + lf.oy - lf.n[1] * L];
    };
    // Dónde se dibuja cada punta: contacto (x, y), dirección n hacia su cable y h, qué tan levantada va (0 a 1).
    const pose = (g, kind, i) => {
      const lf = st.lift[kind][i], fl = st.floor[kind][i], dr = st.drop[kind][i];
      if (lf) {
        const [cx, cy] = liftContact(kind, i);
        const p = st.segs.length && snap(st.segs, cx, cy, true, kind);
        const a = p ? ease(Math.max(0, Math.min(1, 1 - (p.dist - 8) / (MAG - 8)))) : 0;
        if (!a) return { x: cx, y: cy, n: lf.n, h: 1 };
        const f = frameAt(g, kind, i, p.x, p.y, lf.n);
        const nx = lf.n[0] + (f.n[0] - lf.n[0]) * a, ny = lf.n[1] + (f.n[1] - lf.n[1]) * a, s = Math.hypot(nx, ny) || 1;
        return { x: cx + (p.x - cx) * a, y: cy + (p.y - cy) * a, n: [nx / s, ny / s], h: 1 - 0.6 * a, snap: p, t: a > 0.5 ? f.t : null };
      }
      if (fl) return { x: fl.x, y: fl.y, n: fl.n, h: 0 };
      const f = frame(g, kind, i);
      if (!dr) return { ...f, h: 0 };
      // arc: se levanta y vuelve a bajar en el camino (al invertir o al llevarla a tierra)
      const q = dr.from, u = ease(Math.min(1, dr.t / (dr.dur || DROP)));
      const nx = q.n[0] + (f.n[0] - q.n[0]) * u, ny = q.n[1] + (f.n[1] - q.n[1]) * u, s = Math.hypot(nx, ny) || 1;
      return { x: q.x + (f.x - q.x) * u, y: q.y + (f.y - q.y) * u, n: [nx / s, ny / s], h: dr.arc ? dr.arc * Math.sin(Math.PI * u) : q.h * (1 - u), t: f.t };
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
    // Cada cable j (rojo o negro) va de su punta (la del amperímetro tiene los dos, uno a cada lado del corte)
    // a su borne.
    const ropeStep = (side, g, kind, j, dt) => {
      const key = kind + j, i = probeOf(kind, j);
      if (!st.placed[kind][i]) { delete ropes[side][key]; return; }
      if (st.reel[kind][i] && ropes[side][key]) return;   // mientras se recoge el cable no se mueve solo
      const f = pose(g, kind, i), L = tipLen(side, kind), off = 0;
      // el refuerzo sale de la punta y se dobla solo un poquito (bootAng) hacia donde va el cable
      const old = ropes[side][key], ba = Math.atan2(f.n[1], f.n[0]) + (old ? old.bootAng : 0), bd = [Math.cos(ba), Math.sin(ba)];
      const A = [f.x + f.n[0] * L - f.n[1] * off, f.y + f.n[1] * L + f.n[0] * off], A2 = [A[0] + bd[0] * BOOT, A[1] + bd[1] * BOOT];
      const B = leadJack(g, kind, j), span = Math.hypot(B[0] - A2[0], B[1] - A2[1]);
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
      // con el botón de los cables encendido, el cable de una punta puesta se mantiene siempre tenso
      else if (st.taut[kind] && st.placed[kind][i] && !st.floor[kind][i]) r.tense = Math.max(r.tense || 0, 0.1);
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
    // Cables de la fuente (o mangueras de la bomba), con la misma física: j = 0 el rojo, del + del bloque
    // al + del circuito; j = 1 el negro, del − al −. Van del circuito (r[0]) al bloque (último punto) y
    // salen derecho de sus bornes. Solo jalándolos sale más cable; al acercar el bloque, el que sobra
    // se recoge. En su lugar no hay cables.
    const NL = 16;
    // Con la polaridad invertida el símbolo se voltea: el + queda a la derecha y su cable rojo va al punto
    // de la derecha del circuito.
    const leadEnds = (g, j) => {
      const s = (j ? 1 : -1) * sgn(), [x, y] = symAt(g);
      return [[g.PX + s * SRC, g.BOT], [x + s * SRC, y], s];
    };
    const leadStep = (side, g, j, dt) => {
      const key = 's' + j;
      if (!awayK(g)) { delete ropes[side][key]; return; }
      const [A, B, sx] = leadEnds(g, j), span = Math.hypot(B[0] - A[0], B[1] - A[1]);
      let r = ropes[side][key];
      if (!r) {
        r = ropes[side][key] = [];
        r.len = span;
        for (let k = 0; k < NL; k++) { const u = k / (NL - 1), x = A[0] + (B[0] - A[0]) * u, y = A[1] + (B[1] - A[1]) * u; r.push({ x, y, px: x, py: y }); }
      }
      const hk = held && held.key === key ? held.k : -1;
      // con el botón de los cables encendido van siempre tensos (solo se aflojan mientras se jalan)
      if (hk > 0 || (st.sheld && !st.staut)) r.taut = false;
      else if (st.staut) r.tense = Math.max(r.tense || 0, 0.1);
      const slack = r.taut || r.tense > 0 ? span * 1.005 + 2 : span * 1.04 + Math.min(14, span * 0.2);
      if (r.tense > 0) { r.tense -= dt; r.taut = true; r.len += (slack - r.len) * (1 - Math.exp(-dt * 7)); }
      if (hk > 0) r.len = Math.max(r.len, Math.max(Math.hypot(held.x - A[0], held.y - A[1]) / hk, Math.hypot(B[0] - held.x, B[1] - held.y) / (NL - 1 - hk)) * (NL - 1) * 1.02);
      else if (st.sheld || st.svel) r.len += (slack - r.len) * (1 - Math.exp(-dt * 6));
      r.len = Math.max(r.len, slack);
      const rest = r.len / (NL - 1);
      const fr = Math.pow(Math.exp(Math.log(1e-4) * (1 - cable.inertia) + Math.log(0.6) * cable.inertia), Math.min(dt, 1 / 30)) * (1 - 0.5 * cable.stiff);
      const bend = 2 * rest * Math.max(0.5, cable.stiff) * 0.97;
      for (const q of r) { const vx = (q.x - q.px) * fr, vy = (q.y - q.py) * fr; q.px = q.x; q.py = q.y; q.x += vx; q.y += vy; }
      const fixed = k => k === 0 || k === NL - 1 || k === hk;
      for (let it = 0; it < 30; it++) {
        r[0].x = A[0]; r[0].y = A[1]; r[NL - 1].x = B[0]; r[NL - 1].y = B[1];
        if (hk > 0) { r[hk].x = held.x; r[hk].y = held.y; }
        // del bloque sale derecho hacia su lado, como de un borne
        if (hk !== NL - 2) { const q = r[NL - 2], t = Math.min(rest, 14); q.x += (B[0] + sx * t - q.x) * 0.25; q.y += (B[1] - q.y) * 0.25; }
        for (let k = 1; k < NL; k++) {
          const a = r[k - 1], c = r[k], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d <= rest) continue;
          const wa = fixed(k - 1) ? 0 : 1, wc = fixed(k) ? 0 : 1;
          if (!wa && !wc) continue;
          const e = (d - rest) / d / (wa + wc);
          a.x += dx * e * wa; a.y += dy * e * wa; c.x -= dx * e * wc; c.y -= dy * e * wc;
        }
        for (let k = 2; k < NL; k++) {
          const a = r[k - 2], c = r[k], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d >= bend) continue;
          const wa = fixed(k - 2) ? 0 : 1, wc = fixed(k) ? 0 : 1;
          if (!wa && !wc) continue;
          const e = 0.5 * (d - bend) / d / (wa + wc);
          a.x += dx * e * wa; a.y += dy * e * wa; c.x -= dx * e * wc; c.y -= dy * e * wc;
        }
      }
      const still = 0.15 + 0.35 * cable.stiff;
      for (let k = 1; k < NL - 1; k++) {
        const q = r[k];
        if (k !== hk && !st.sheld && !st.svel && !(r.tense > 0) && Math.hypot(q.x - q.px, q.y - q.py) < still) { q.x = q.px; q.y = q.py; }
      }
      r.A = A;
      r.pts = ropePoints(r);
    };
    // Rigidez e inercia de los cables (en la tarjeta de cada multímetro); se recuerdan en este navegador.
    const setCable = (k, v) => { cable[k] = v; try { localStorage.setItem('sim-cable', JSON.stringify(cable)); } catch (e) {} };
    // Nombre de cada multímetro (en el agua, medidor); con el segundo a la vista llevan su número.
    const meterName = (kind, side) => (side === 'w' ? 'medidor' : 'multímetro') + (st.show.b ? (kind === 'a' ? ' 1' : ' 2') : '');
    const cap = t => t[0].toUpperCase() + t.slice(1);
    // Lo que se ve en cada posición de la perilla, de cada lado (y en los dos a la vez).
    const DIAL_NAMES = { w: { off: 'OFF', V: 'psi', A: 'mL/s', R: 'kΩ' }, e: { off: 'OFF', V: 'V', A: 'A', R: 'Ω' }, both: { off: 'OFF', V: 'V · psi', A: 'A · mL/s', R: 'Ω' } };
    // En Ω con voltaje entre las puntas: la lectura no sirve (hay que apagar la fuente).
    const live = kind => st.dial[kind] === 'R' && st.probe[kind] && ready(kind) && st.probe[kind] && Math.abs(st.probe[kind].va - st.probe[kind].vb) > 0.05;
    // Medir solo lee: la lectura grande de cada multímetro que está afuera, de los lados que se ven (los que
    // no están conectados dicen "sin conectar"; así hay que medir para saber), y al final sacar otro. Su
    // rueda, invertir, la tierra y los cables están en el multímetro y en su tarjeta.
    let syncMed = () => {};
    // Sacar otro multímetro (desde Medir o tocando su lugar punteado en la mesa).
    b.addMeter = () => {
      const kind = MS.find(k => !st.show[k]);
      if (!kind) return;
      b.showMeters({ [kind]: true });
      st.placed[kind] = [false, false];   // sale guardado: se toca el circuito para ponerlo
      syncs.forEach(f => f()); syncReel();
      setPlacing({ kind, i: 0 });
    };
    // Su lugar en la mesa, punteado, mientras solo está el primero.
    const slotOpen = () => st.show.a && !st.show.b && !phoneNow();   // en el celular la mesa no lo lleva
    ['w', 'e'].forEach(side => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'sim-slot'; el.dataset.act = 'med';
      b.place(side, el, g => {
        const [x, y] = homeAt(g, 'b'), sh = shape('b'), s = panel(side).scale * g.mk.b;
        el.style.width = 2 * sh.hw * s + 'px'; el.style.height = (sh.bottom - sh.top) * s + 'px';
        return [x, y + (sh.top + sh.bottom) / 2 * g.mk.b];
      });
      el.addEventListener('click', () => b.addMeter());
      syncs.push(() => {
        el.hidden = !slotOpen();
        el.setAttribute('aria-label', side === 'w' ? 'Sacar otro medidor' : 'Sacar otro multímetro');
      });
    });
    if (Sim.side) {
      const wrap = document.createElement('div');
      wrap.className = 'sim-mms';
      const blocks = MS.map(kind => {
        const box = document.createElement('div');
        box.className = 'sim-read'; box.setAttribute('aria-live', 'off');
        const rows = ['w', 'e'].map(side => {
          const r = document.createElement('div');
          r.innerHTML = '<span class="nm"></span><span class="vl"></span>';
          box.appendChild(r);
          return { r, side, nm: r.firstChild, vl: r.lastChild };
        });
        wrap.appendChild(box);
        return { kind, box, rows };
      });
      const add = document.createElement('button');
      add.type = 'button'; add.className = 'sim-side-btn sim-add';
      add.addEventListener('click', () => b.addMeter());
      wrap.appendChild(add);
      Sim.side.sec('med').prepend(wrap);
      syncMed = () => {
        const w = Sim.view === 'w';
        blocks.forEach(({ kind, box, rows }) => {
          box.hidden = !st.show[kind];
          rows.forEach(o => { o.nm.textContent = cap(meterName(kind, o.side)); });
        });
        const some = MS.some(k => st.show[k]), what = w ? 'medidor' : 'multímetro';
        add.hidden = MS.every(k => st.show[k]);
        add.textContent = (some ? '+ Sacar otro ' : '+ Sacar un ') + what;
      };
      Sim.onView(syncMed); syncMed(); syncs.push(syncMed);
      setInterval(() => blocks.forEach(({ kind, rows }) => rows.forEach(o => {
        if (!st.probe[kind]) return;   // todavía no arranca
        o.r.hidden = Sim.view !== 'both' && Sim.view !== o.side;
        if (o.r.hidden) return;
        const md = st.dial[kind], [t, u] = meterText(kind, o.side), off = md !== 'off' && !ready(kind);
        o.vl.textContent = md === 'off' ? 'apagado' : md === 'A' && st.fuse[kind] ? (o.side === 'w' ? 'válvula rota' : 'fusible fundido')
          : md === 'A' && st.trip[kind] ? (o.side === 'w' ? 'válvula cerrada' : 'protección botada') : off ? 'sin conectar' : t.trim() + ' ' + u + (live(kind) ? ' ⚠ hay voltaje' : '');
        o.r.className = 'r ' + md + (off || md === 'off' ? ' off' : '') + (live(kind) || (md === 'A' && (st.fuse[kind] || st.trip[kind])) ? ' warn' : '');
      })), 200);
    }
    // Botón de recoger en cada medidor (con un conector): como una aspiradora, el medidor jala sus
    // cables (o mangueras). Las puntas conectadas se quedan donde están y su cable se tensa; las que
    // quedaron en el suelo entran al medidor. Para volver a ponerlas se toca el medidor.
    const reelBtns = [];
    st.taut = { a: false, b: false };   // botón de los cables encendido: siempre tensos
    const syncReel = () => reelBtns.forEach(([el, kind]) => { el.disabled = !st.placed[kind].some(Boolean) && !st.taut[kind]; });
    const reelIn = kind => {
      if (st.placing) setPlacing(null);
      for (let i = 0; i < NP(kind); i++) {
        if (!st.placed[kind][i] || st.lift[kind][i]) continue;
        if (st.floor[kind][i]) { if (!st.reel[kind][i]) st.reel[kind][i] = 1e-6; }
        else for (let j = 0; j < 2; j++) if (probeOf(kind, j) === i) ['w', 'e'].forEach(side => { const r = ropes[side][kind + j]; if (r) r.tense = 0.8; });
      }
      syncs.forEach(f => f());
    };
    // Agarrar un cable del cuerpo: el punto más cercano sigue al puntero (en los dos paneles).
    const nearRope = (side, x, y) => {
      let best = null;
      for (const key in ropes[side]) {
        if (key[0] !== 's' && (!st.show[key[0]] || !shown(key[0], probeOf(key[0], +key[1])))) continue;
        const n = ropes[side][key].length;
        ropes[side][key].forEach((q, k) => {
          if (k < 2 || k > n - 2) return;
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
      const q = [r.A, [r[0].x, r[0].y]], NR = r.length;
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
      const NR = r.length;
      ctx.beginPath(); ctx.moveTo(r.A[0], r.A[1]); ctx.lineTo(r[0].x, r[0].y);
      for (let k = 1; k < NR - 1; k++) ctx.quadraticCurveTo(r[k].x, r[k].y, (r[k].x + r[k + 1].x) / 2, (r[k].y + r[k + 1].y) / 2);
      ctx.lineTo(r[NR - 1].x, r[NR - 1].y);
    };

    // Cada punta se arrastra (o se mueve con las flechas por el cable). Los dos paneles comparten
    // las puntas, igual que la bomba y la fuente.
    // (cx, cy): dónde está el puntero, para saber de qué lado del cable va la punta.
    const moveClamp = (kind, i, x, y, cx, cy) => {
      const p = snap(st.segs, x, y, true, kind);
      if (!p) return;
      st.clamps[kind][i] = [p.x, p.y];
      if (cx !== undefined && Math.hypot(cx - p.x, cy - p.y) > 3) st.tipSide[kind][i] = [cx - p.x, cy - p.y];
      b.pw.replace(); b.pe.replace();
    };
    const tipName = (kind, i, side) => `${side === 'w' ? 'Manguera' : 'Punta'} ${i ? 'negra' : 'roja'} del ${meterName(kind, side)}`;
    // Arrastrar levanta la punta (como cable o como indicador, según el modo); tocarla sin arrastrar abre
    // su tarjeta (onTap). El indicador se agarra del círculo (el botón de la punta) o de su anillo (ring, el imán).
    // fromJack: se agarra desde el borne del multímetro y la punta sale de ahí (si estaba en el
    // circuito, se desliza hasta el puntero). iOf() da qué punta se agarra (la del borne cambia con la perilla).
    const grab = (side, kind, btn, mode, iOf, fromJack, onTap) => {
      const p = panel(side);
      const toDrawing = e => {
        const r = p.box.getBoundingClientRect();
        return [(e.clientX - r.left - p.ox) / p.scale, (e.clientY - r.top - p.oy) / p.scale];
      };
      let down = null, dragged = false, i = 0;
      btn.addEventListener('pointerdown', e => {
        btn.setPointerCapture(e.pointerId); btn.focus(); down = [e.clientX, e.clientY]; dragged = false; i = iOf(); e.preventDefault();
      });
      btn.addEventListener('pointermove', e => {
        if (!btn.hasPointerCapture(e.pointerId)) return;
        if (!dragged && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) return;
        const [x, y] = toDrawing(e);
        if (!dragged) {   // lo agarrado se desliza hasta quedar bajo el puntero
          if (fromJack && st.placing) setPlacing(null);
          const q = pose(geo(side), kind, i), md = mode(i), L = md === 'handle' ? PIN_D * ease(st.morph[kind][i]) : 0;
          st.lift[kind][i] = { x, y, n: q.n, mode: md, ox: q.x + q.n[0] * L - x, oy: q.y + q.n[1] * L - y };
          if (fromJack && !st.placed[kind][i]) {   // estaba guardada: sale del borne
            st.placed[kind][i] = true; st.reel[kind][i] = 0;
            Object.assign(st.lift[kind][i], { n: [0, 1], ox: 0, oy: 0 });
            syncs.forEach(f => f()); syncReel();
          }
          st.floor[kind][i] = st.drop[kind][i] = null;
        }
        dragged = true;
        const lf = st.lift[kind][i];
        if (!lf) return;
        if (lf.mode === 'magnet') {   // el círculo se queda donde estaba y el anillo lo jala
          const [ax, ay] = liftContact(kind, i), bx = ax + lf.n[0] * PIN_D, by = ay + lf.n[1] * PIN_D;
          Object.assign(lf, { x, y });
          const [cx, cy] = liftContact(kind, i), d = Math.hypot(bx - cx, by - cy);
          if (d > 1) lf.n = [(bx - cx) / d, (by - cy) / d];
        } else Object.assign(lf, { x, y });
        b.pw.replace(); b.pe.replace();
      });
      const up = () => release(kind, i);
      btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
      btn.addEventListener('click', () => {
        // tocar el borne sin arrastrar es como tocar el multímetro; tocar la punta abre su tarjeta
        if (!dragged) onTap();
        dragged = false;
      });
    };
    // Tarjeta de una punta: cable o indicador (para todas las puntas) y soltarla: regresa a su multímetro.
    const tipEls = { a: [{}, {}], b: [{}, {}] };
    const tipOpen = (kind, i) => ['w', 'e'].some(sd => tipEls[kind][i][sd] && Sim.menu.isOpen(tipEls[kind][i][sd]));
    const pinnedRow = side => ({ label: 'Puntas', seg: [{ value: false, text: side === 'w' ? 'Manguera' : 'Cable' }, { value: true, text: 'Indicador' }],
      get: () => st.pinned.a, set: v => { if (v !== st.pinned.a) togglePinned(); } });
    const letGo = (kind, i) => {
      if (st.placing) setPlacing(null);
      if (!st.placed[kind][i] || st.reel[kind][i]) return;
      const q = pose(b.gw, kind, i);
      st.lift[kind][i] = st.drop[kind][i] = null; st.pend[kind][i] = false;
      st.floor[kind][i] = { x: q.x, y: q.y, n: q.n }; st.reel[kind][i] = 1e-6;
      syncs.forEach(f => f()); syncReel();
    };
    const tipMenu = (kind, i, side) => ({ float: true, title: () => tipName(kind, i, side), rows: [pinnedRow(side),
      { actions: [{ text: 'Soltar', onClick: () => { ['w', 'e'].forEach(sd => Sim.menu.close(tipEls[kind][i][sd])); letGo(kind, i); } }] }] });
    MS.forEach(kind => [0, 1].forEach(i => ['w', 'e'].forEach(side => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'sim-clamp'; el.setAttribute('aria-haspopup', 'dialog');
      tipEls[kind][i][side] = el;
      const tap = () => Sim.menu.toggle(el, tipMenu(kind, i, side));
      const label = () => el.setAttribute('aria-label', `${tipName(kind, i, side)}: arrástrala o usa las flechas para moverla; tócala para ver sus opciones`);
      b.place(side, el, g => {
        const f = pose(g, kind, i), m = ease(st.morph[kind][i]);
        const L = tipLen(side) * 0.55 * (1 - m) + PIN_D * m;
        return [f.x + f.n[0] * L, f.y + f.n[1] * L];
      });
      grab(side, kind, el, () => ease(st.morph[kind][i]) > 0.5 ? 'handle' : 'tip', () => i, false, tap);
      const ring = document.createElement('button');
      ring.type = 'button'; ring.className = 'sim-clamp ring'; ring.tabIndex = -1; ring.setAttribute('aria-hidden', 'true');
      b.place(side, ring, g => { const f = pose(g, kind, i); return [f.x, f.y]; });
      grab(side, kind, ring, () => 'magnet', () => i, false, tap);
      syncs.push(() => { ring.hidden = el.hidden || !st.pinned[kind]; });
      el.addEventListener('keydown', e => {
        const step = { ArrowUp: [0, -12], ArrowDown: [0, 12], ArrowLeft: [-12, 0], ArrowRight: [12, 0] }[e.key];
        if (!step) return;
        const fl = st.floor[kind][i], [x, y] = fl ? [fl.x, fl.y] : st.clamps[kind][i];
        st.floor[kind][i] = st.drop[kind][i] = null;
        moveClamp(kind, i, x + step[0], y + step[1]);
        e.preventDefault();
      });
      const sync = () => { el.hidden = i >= NP(kind) || !st.placed[kind][i] || !st.show[kind] || st.reel[kind][i] > 0; label(); };
      syncs.unshift(sync); sync();
    })));
    // Los bornes: de ahí también se saca la punta de su cable; tocarlos es como tocar el multímetro.
    const meterHits = { a: {}, b: {} }, jackEls = { a: [], b: [] };
    const meterOpen = kind => ['w', 'e'].some(sd => meterHits[kind][sd] && Sim.menu.isOpen(meterHits[kind][sd]));
    MS.forEach(kind => [0, 1].forEach(j => ['w', 'e'].forEach(side => {
      const jb = document.createElement('button');
      jb.type = 'button'; jb.className = 'sim-clamp jack'; jb.tabIndex = -1; jb.setAttribute('aria-hidden', 'true');
      jackEls[kind].push(jb);
      b.place(side, jb, g => leadJack(g, kind, j));
      grab(side, kind, jb, i => st.pinned[kind] ? 'magnet' : 'tip', () => probeOf(kind, j), true, () => Sim.menu.toggle(meterHits[kind][side], meterMenu(kind, side)));
      syncs.push(() => { jb.hidden = !st.show[kind] || st.reel[kind][probeOf(kind, j)] > 0; });
    })));
    syncs.forEach(f => f());

    // Tocar un multímetro abre su tarjeta. Su botón principal, Conectar puntas, atenúa sus puntas (se pueden
    // reposicionar) y lo prepara: el siguiente toque en el circuito pone la punta roja (+) y el siguiente la
    // negra (−), que se deslizan ahí. Si una punta está guardada en el multímetro, solo se pone esa. Tocar el
    // multímetro o Esc cancela y las puntas regresan a donde estaban.
    st.placing = null;
    st.pend = per(false);   // puestas, pero esperando su nuevo lugar (se ven atenuadas)
    const setPlacing = v => {
      if (st.placing && (!v || !v.prev)) { st.placed[st.placing.kind] = st.placing.prev.slice(); st.pend[st.placing.kind].fill(false); }
      if (v && !v.prev) {
        v.prev = st.placed[v.kind].slice();
        const pl = v.prev.slice(0, NP(v.kind));
        v.todo = pl.some(Boolean) && !pl.every(Boolean) ? pl.map((p, i) => p ? -1 : i).filter(i => i >= 0) : pl.map((_, i) => i);
        v.i = v.todo[0];
        // las puntas que estaban puestas no desaparecen: se ven atenuadas hasta tocar su nuevo lugar
        v.todo.forEach(i => {
          if (v.prev[i] && !st.reel[v.kind][i]) { st.pend[v.kind][i] = true; st.lift[v.kind][i] = null; return; }
          st.placed[v.kind][i] = false; st.reel[v.kind][i] = 0; ['lift', 'floor', 'drop'].forEach(k => { st[k][v.kind][i] = null; });
        });
        syncReel();
      }
      st.placing = v;
      [b.pw, b.pe].forEach(p => p.box.classList.toggle('placing', !!v));
      syncs.forEach(f => f());
      b.pw.replace(); b.pe.replace();
    };
    MS.forEach(kind => ['w', 'e'].forEach(side => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'sim-meter-hit';
      const name = () => 'el ' + meterName(kind, side);
      // cubre el chasis (cambia de tamaño al compactar)
      b.place(side, el, g => {
        const [x, y] = meterAt(g, kind), s = panel(side).scale * g.mk[kind], sh = shape(kind), top = sh.top, bot = sh.bottom;
        el.style.width = Math.max(60, (2 * sh.hw + 8) * s) + 'px'; el.style.height = Math.max(40, (bot - top + 8) * s) + 'px';
        return [x, y + (top + bot) / 2 * g.mk[kind]];
      });
      // tocarlo abre su tarjeta; arrastrarlo (o las flechas) lo cambia de lugar
      meterHits[kind][side] = el; el.setAttribute('aria-haspopup', 'dialog');
      let down = null, dragged = false, from = null;
      el.addEventListener('pointerdown', e => {
        el.setPointerCapture(e.pointerId); down = [e.clientX, e.clientY]; dragged = false; from = meterAt(geo(side), kind); e.preventDefault();
      });
      el.addEventListener('pointermove', e => {
        if (!down || !el.hasPointerCapture(e.pointerId)) return;
        if (!dragged && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) return;
        dragged = true; st.mheld[kind] = true; el.classList.add('held');
        const s = panel(side).scale;
        moveMeter(geo(side), kind, from[0] + (e.clientX - down[0]) / s, from[1] + (e.clientY - down[1]) / s);
      });
      const up = () => { down = null; st.mheld[kind] = false; el.classList.remove('held'); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      el.addEventListener('click', () => {
        if (!dragged) { if (st.placing && st.placing.kind === kind) setPlacing(null); else Sim.menu.toggle(el, meterMenu(kind, side)); }
        dragged = false;
      });
      el.addEventListener('keydown', e => {
        const step = { ArrowUp: [0, -12], ArrowDown: [0, 12], ArrowLeft: [-12, 0], ArrowRight: [12, 0] }[e.key];
        if (!step) return;
        const g = geo(side), [x, y] = meterAt(g, kind);
        moveMeter(g, kind, x + step[0], y + step[1]);
        e.preventDefault();
      });
      syncs.push(() => {
        el.hidden = !st.show[kind];
        el.setAttribute('aria-label', `${cap(meterName(kind, side))}: tócalo para ver sus opciones; arrástralo para moverlo`);
      });
      // La perilla: tocar una de sus posiciones la gira ahí; tocar el centro (o compactado, la perilla) pasa
      // a la siguiente. Con las flechas también gira.
      const dial = document.createElement('button');
      dial.type = 'button'; dial.className = 'sim-dial';
      b.place(side, dial, g => {
        const [x, y] = meterAt(g, kind), sh = shape(kind), s = panel(side).scale * g.mk[kind];
        if (sh.ph && sh.c > 0.5) return null;   // la versión corta del celular solo se lee
        dial.style.width = dial.style.height = Math.max(40, (sh.kr + (sh.c > 0.5 ? 8 : 24)) * 2 * s) + 'px';
        return [x + sh.kx * g.mk[kind], y + sh.ky * g.mk[kind]];
      });
      const turn = d => b.setDial(kind, DIAL[(DIAL.indexOf(st.dial[kind]) + d + DIAL.length) % DIAL.length]);
      // Arrastrarla la gira con imán: se queda en su posición (pasada la zona muerta solo se estira un poco
      // hacia el dedo) hasta que el dedo está bien más cerca de otra, y entonces salta ahí con un rebote.
      dial.style.touchAction = 'none';
      let drag = null;
      dial.addEventListener('pointerdown', e => {
        if (shape(kind).c > 0.5) return;
        dial.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, moved: false, touch: e.pointerType === 'touch' };
      });
      dial.addEventListener('pointermove', e => {
        if (!drag || !dial.hasPointerCapture(e.pointerId)) return;
        const r = dial.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        drag.moved = true;
        if (Math.hypot(dx, dy) < 6) return;
        const a = Math.atan2(dx, -dy) * 180 / Math.PI, cur = st.dial[kind];
        const near = DIAL.reduce((best, d) => Math.abs(DANG[d] - a) < Math.abs(DANG[best] - a) ? d : best, cur);
        if (near !== cur && Math.abs(DANG[near] - a) < Math.abs(DANG[cur] - a) - 12) {
          b.setDial(kind, near);
          if (drag.touch && navigator.vibrate) try { navigator.vibrate(6); } catch (err) {}
        }
        st.dpull[kind] = Math.max(-9, Math.min(9, 0.25 * Math.sign(a - DANG[st.dial[kind]]) * Math.max(0, Math.abs(a - DANG[st.dial[kind]]) - Sim.DEAD.knob)));
        b.pw.replace(); b.pe.replace();
      });
      const letGo = () => { if (drag) { drag.done = drag.moved; drag.moved = false; } st.dpull[kind] = 0; };
      dial.addEventListener('pointerup', letGo);
      dial.addEventListener('pointercancel', letGo);
      dial.addEventListener('click', e => {
        if (drag && drag.done) { drag = null; return; }   // fue un arrastre
        drag = null;
        const r = dial.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const sh = shape(kind), s = panel(side).scale * geo(side).mk[kind];
        // con el teclado (sin puntero) o en el centro: la siguiente posición
        if (!e.detail || sh.c > 0.5 || Math.hypot(dx, dy) < sh.kr * s * 0.9) { turn(1); return; }
        const a = Math.atan2(dx, -dy) * 180 / Math.PI;
        b.setDial(kind, DIAL.reduce((best, d) => Math.abs(DANG[d] - a) < Math.abs(DANG[best] - a) ? d : best, DIAL[0]));
      });
      dial.addEventListener('keydown', e => {
        const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
        if (d) { turn(d); e.preventDefault(); }
      });
      // La rueda del ratón la gira una posición por muesca (hacia arriba, en el sentido del reloj); en las
      // orillas (OFF y Ω) se queda, como una de verdad.
      let wacc = 0;
      dial.addEventListener('wheel', e => {
        e.preventDefault();
        wacc += e.deltaMode ? e.deltaY * 40 : e.deltaY;
        if (Math.abs(wacc) < 40) return;
        const k = DIAL.indexOf(st.dial[kind]) + (wacc < 0 ? 1 : -1);
        wacc = 0;
        if (k >= 0 && k < DIAL.length) b.setDial(kind, DIAL[k]);
      }, { passive: false });
      syncs.push(() => {
        dial.hidden = !st.show[kind];
        const names = DIAL_NAMES[side];
        dial.setAttribute('aria-label', `Perilla del ${meterName(kind, side)}: ${names[st.dial[kind]]}. Tócala para girarla`);
      });
      // Dos botones físicos en el multímetro: recoger (enchufe) y compactar.
      const what = side === 'w' ? 'las mangueras' : 'los cables';
      // Son botones físicos dibujados en el multímetro: aquí solo va su zona para tocarlos.
      const button = (bi, svg, onClick) => {
        const bt = document.createElement('button');
        bt.type = 'button'; bt.className = 'sim-meter-btn phys';
        bt.addEventListener('click', e => { st.press[kind][bi] = performance.now() + 140; onClick(e); b.pw.replace(); b.pe.replace(); setTimeout(() => { b.pw.replace(); b.pe.replace(); }, 160); });
        b.place(side, bt, g => {
          const [x, y] = meterAt(g, kind), sh = shape(kind), s = panel(side).scale * g.mk[kind];
          bt.style.width = Math.max(28, (sh.bw + 6) * s) + 'px'; bt.style.height = Math.max(24, (sh.bh + 6) * s) + 'px';
          return [x + sh.btn[bi][0] * g.mk[kind], y + sh.btn[bi][1] * g.mk[kind]];
        });
        syncs.push(() => { bt.hidden = !st.show[kind]; });
        return bt;
      };
      // Interruptor: un toque deja los cables siempre tensos (y guarda los del suelo), otro los suelta.
      // Tensarlos una sola vez está en la tarjeta del multímetro.
      const rb = button(0, '', () => {
        st.taut[kind] = !st.taut[kind];
        if (st.taut[kind]) reelIn(kind);
        syncs.forEach(f => f());
      });
      reelBtns.push([rb, kind]);
      // Botón de la protección: sale de la funda cuando se bota; tocarlo la rearma.
      const tb = document.createElement('button');
      tb.type = 'button'; tb.className = 'sim-meter-btn phys';
      tb.addEventListener('click', () => { b.resetTrip(kind); b.pw.replace(); b.pe.replace(); });
      b.place(side, tb, g => {
        const s = panel(side).scale * g.mk[kind], [x, y] = meterAt(g, kind), q = tripAt(kind);
        tb.style.width = Math.max(44, 50 * s) + 'px'; tb.style.height = Math.max(32, 26 * s) + 'px';
        return [x + q.x * g.mk[kind], y + q.y * g.mk[kind]];
      });
      syncs.push(() => {
        tb.hidden = !st.show[kind] || !st.trip[kind];
        const l = `Rearmar la protección del ${meterName(kind, side)}`;
        tb.setAttribute('aria-label', l); tb.title = l;
      });
      const cb = button(1, '', () => toggleCompact(kind));
      // Invertir: la punta roja y la negra cambian de lugar (solo extendido; compactado, en su tarjeta).
      const ib = button(2, '', () => b.invert(kind));
      syncs.push(() => {
        ib.hidden = !st.show[kind] || isCompact(kind);
        const l = `Invertir ${what} del ${meterName(kind, side)}: la roja va donde estaba la negra`;
        ib.setAttribute('aria-label', l); ib.title = l;
      });
      syncs.push(() => {
        const label = st.taut[kind] ? `Soltar ${what} del ${meterName(kind, side)}` : `Tensar ${what} del ${meterName(kind, side)}`;
        rb.setAttribute('aria-label', label); rb.title = label; rb.setAttribute('aria-pressed', String(st.taut[kind]));
        const c = isCompact(kind), ph = phoneNow();
        const cl = ph ? (c ? `Abrir ${name()}, con su perilla y sus botones` : `Cerrar ${name()}: la versión corta, solo para leer`)
          : c ? `Mostrar ${name()} completo` : `Compactar ${name()}: solo la pantallita y la perilla`;
        cb.setAttribute('aria-pressed', String(c));
        cb.setAttribute('aria-label', cl); cb.title = ph ? (c ? 'Abrir' : 'Cerrar') : c ? 'Mostrar completo' : 'Compactar';
        rb.hidden = !st.show[kind] || (ph && c);   // la versión corta del celular solo se lee
      });
    }));
    syncs.push(syncReel); syncs.forEach(f => f());
    const setCompact = (kind, v) => {
      st.compact[kind] = v;
      try { localStorage.setItem('sim-compact', JSON.stringify(st.compact)); } catch (e) {}
      syncs.forEach(f => f());
    };
    // Guardar el multímetro: sus puntas entran y se va de la mesa (en Medir se vuelve a sacar).
    const putAway = kind => {
      ['w', 'e'].forEach(sd => Sim.menu.close(meterHits[kind][sd]));
      if (st.placing && st.placing.kind === kind) setPlacing(null);
      st.placed[kind] = [false, false];
      ['lift', 'floor', 'drop'].forEach(k => { st[k][kind] = [null, null]; });
      st.reel[kind] = [0, 0]; st.pend[kind] = [false, false];
      b.showMeters({ [kind]: false });
    };
    // Tarjeta del multímetro: conectar sus puntas (la acción principal), cable o indicador, invertir, la negra
    // a tierra, tensar sus cables una vez, compactarlo y guardarlo; si se fundió, cambiar su fusible. Abajo,
    // cómo son los cables (rigidez e inercia, para todos). Su rueda y sus bornes están en el aparato.
    const meterMenu = (kind, side) => {
      const w = side === 'w';
      return { float: true, title: () => cap(meterName(kind, side)), ignore: t => jackEls[kind].includes(t), rows: [
        { actions: [{ primary: true, text: 'Conectar puntas', onClick: () => { ['w', 'e'].forEach(sd => Sim.menu.close(meterHits[kind][sd])); setPlacing({ kind, i: 0 }); } }] },
        pinnedRow(side),
        { actions: [
          { text: 'Invertir puntas', onClick: () => b.invert(kind) },
          { text: w ? 'Negra a 0 psi' : 'Negra a tierra', hidden: () => series(kind), onClick: () => b.toGround(kind) },
          { text: w ? 'Tensar mangueras' : 'Tensar cables', onClick: () => reelIn(kind) },
          { text: () => phoneNow() ? (isCompact(kind) ? 'Abrir' : 'Cerrar') : st.compact[kind] ? 'Extender' : 'Compactar', onClick: () => toggleCompact(kind) },
          { text: w ? 'Cambiar su válvula' : 'Cambiar su fusible', hidden: () => !st.fuse[kind], onClick: () => b.newFuse(kind) },
          { text: 'Rearmar la protección', hidden: () => !st.trip[kind], onClick: () => b.resetTrip(kind) },
          { text: w ? 'Guardar el medidor' : 'Guardar el multímetro', onClick: () => putAway(kind) }
        ] },
        { label: 'Rigidez', range: [0, 1, 0.05], lo: 'flojo', hi: 'rígido', get: () => cable.stiff, set: v => setCable('stiff', v) },
        { label: 'Inercia', range: [0, 1, 0.05], lo: 'se frena', hi: 'se desliza', get: () => cable.inertia, set: v => setCable('inertia', v) }
      ] };
    };
    b.showMeters = show => {
      const before = MS.map(k => st.show[k]).join();
      Object.assign(st.show, show);
      // en el celular las versiones cortas van en un renglón: con uno más o uno menos la mesa se acomoda
      if (phoneNow() && MS.map(k => st.show[k]).join() !== before) {
        if (MS.includes(st.front) && !st.show[st.front]) st.front = null;
        [b.pw, b.pe].forEach(p => p.onLayout(p.W, p.H, p.mode)); syncFold();
      }
      syncReel();
      if (st.placing && !st.show[st.placing.kind]) setPlacing(null);
      syncs.forEach(f => f());
      b.pw.replace(); b.pe.replace();
    };
    // Girar la perilla: las puntas y los cables se quedan donde están, solo cambia lo que mide. Con pts (de
    // la página) las puntas van ahí. También elige el modo de color de las partículas.
    b.setDial = (kind, md, pts) => {
      if (!DIAL.includes(md)) return;
      if (st.dial[kind] !== md) {
        st.dial[kind] = md;
        Sim.setColorMode(DIAL_COLOR[md]); syncColors();
      }
      if (pts && st.placing && st.placing.kind === kind) { st.placing.prev = [true, true]; setPlacing(null); }
      if (pts) pts.forEach((q, i) => {
        st.clamps[kind][i] = q.slice(); st.placed[kind][i] = true;
        ['lift', 'floor', 'drop'].forEach(k => { st[k][kind][i] = null; });
        st.reel[kind][i] = 0; st.pend[kind][i] = false; st.tipSide[kind][i] = null;
      });
      syncs.forEach(f => f()); syncReel();
      b.pw.replace(); b.pe.replace();
    };
    // Fusible nuevo (en el agua, abrir otra vez su válvula de seguridad).
    b.newFuse = (kind = 'a') => { st.fuse[kind] = st.trip[kind] = false; syncs.forEach(f => f()); };
    // Rearmar la protección: el botón que se botó se vuelve a meter.
    b.resetTrip = (kind = 'a') => { st.trip[kind] = false; syncs.forEach(f => f()); };
    // Invertir la polaridad de un multímetro, como al cambiar de lugar sus puntas: la roja va a donde
    // estaba la negra y la negra a donde estaba la roja (se levantan y caen ahí).
    b.invert = (kind = 'a') => {
      if (st.placing) setPlacing(null);
      {
        if (st.lift[kind].some(Boolean) || st.reel[kind].some(Boolean)) return;
        const from = [0, 1].map(i => connected(kind, i) ? pose(b.gw, kind, i) : null);
        for (const k of ['clamps', 'tipSide', 'floor', 'placed']) st[k][kind].reverse();
        [0, 1].forEach(i => { st.drop[kind][i] = from[i] && st.placed[kind][i] && !st.floor[kind][i] ? { from: from[i], t: 0, dur: 0.45, arc: 0.9 } : null; });
        syncs.forEach(f => f()); syncReel();
      }
      b.pw.replace(); b.pe.replace();
    };
    // La punta negra (la manguera negra en el agua) a la tierra común: desde ahí la roja mide el voltaje de
    // cada punto del circuito, como se mide en un circuito de verdad.
    b.toGround = (kind = 'a') => {
      if (series(kind) || st.lift[kind][1] || st.reel[kind][1]) return;
      if (st.placing) setPlacing(null);
      const g = b.gw, [x, y] = b.ground(g);
      let from = connected(kind, 1) || st.floor[kind][1] ? pose(g, kind, 1) : null;
      if (!from) { const [jx, jy] = leadJack(g, kind, 1); from = { x: jx, y: jy, n: [0, 1], h: 0 }; }
      st.placed[kind][1] = true; st.floor[kind][1] = null; st.pend[kind][1] = false;
      st.clamps[kind][1] = [x, y]; st.tipSide[kind][1] = [0, -1];
      st.drop[kind][1] = { from, t: 0, dur: 0.45, arc: 0.9 };
      syncs.forEach(f => f()); syncReel();
      b.pw.replace(); b.pe.replace();
    };
    let swallow = false;
    [b.pw, b.pe].forEach(p => {
      p.box.addEventListener('pointerdown', e => {
        if (!st.placing || e.target.closest('.sim-meter-hit, .sim-meter-btn, .sim-clamp.jack, .sim-dial')) return;
        const r = p.box.getBoundingClientRect();
        const { kind, i } = st.placing;
        const x = (e.clientX - r.left - p.ox) / p.scale, y = (e.clientY - r.top - p.oy) / p.scale;
        // una punta atenuada se desliza de donde estaba a su nuevo lugar
        const from = st.pend[kind][i] ? pose(b.gw, kind, i) : null;
        st.pend[kind][i] = false; st.floor[kind][i] = null;
        moveClamp(kind, i, x, y, x, y);
        if (from) st.drop[kind][i] = { from, t: 0 };
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
    // Lo que marca la pantallita de un canal: con POWER apagado, nada; un momento después de girar una perilla,
    // lo que pide (el voltaje de COARSE + FINE o el límite de CURRENT); si no, lo que sale por sus bornes: el
    // voltaje (2 decimales, 10 mV) o la corriente (3 decimales, 1 mA). En el agua, psi y L/s (1 L/s por A).
    const lcdText = (c, w) => {
      const h = st.ch[c];
      if (!st.on) return ['    ', ''];
      const pk = h.peek && performance.now() < h.peek.until ? h.peek.k : null;
      if (pk ? pk === 'cu' : h.disp === 'A') return [digits((pk ? h.lim : Math.abs(h.io)) * (w ? MLS_PER_MA : 1) / 1000, 1, 3), w ? 'L/s' : 'A'];
      return [digits((pk ? setOf(c) : Math.abs(h.vo)) * (w ? PSI_PER_V : 1), 2, 2), w ? 'psi' : 'V'];
    };
    // Bornes − (negro), ⏚ (verde, al chasis) y + (rojo), con su nombre a la izquierda.
    const POST = () => [C.neg, '#2f9a5a', RED];
    const post = (ctx, x, y, j) => {
      D.circle(ctx, x, y, 10, POST()[j], C.ink, 1.5);
      D.circle(ctx, x, y, 4, '#0b0f12');
      const tx = x - 20;
      if (j !== 1) { D.text(ctx, j ? '+' : '−', tx, y, j ? RED : C.neg, { size: 16 }); return; }
      D.line(ctx, [[tx, y - 7], [tx, y]], 2, C.ink, 'butt');
      [[7, 0], [4.5, 3.5], [2, 7]].forEach(([hw, dy]) => D.line(ctx, [[tx - hw, y + dy], [tx + hw, y + dy]], 2, C.ink, 'butt'));
    };
    // La fuente (en el agua, la bomba) de dos canales, en sus coordenadas (SL) escaladas g.FK. Las perillas y la
    // palanca son de HTML (encima); aquí van su hueco, las pantallitas, las teclas, los LEDs, los nombres y los
    // bornes. Fuera del celular, un cuello va del símbolo del circuito al canal A, el que lo alimenta.
    const drawSource = (ctx, g) => {
      const w = g.side === 'w', L = lay(g), P = L.c, [X, Y] = boxAt(g), [sx, sy] = symAt(g), now = performance.now();
      if (!apart(g)) {
        const ax = at(g, [L.ch.A[0] + P.lcd[0], 0])[0], y0 = sy + (w ? 36 : 22), ym = (y0 + Y) / 2;
        D.line(ctx, Math.abs(ax - sx) < 1 ? [[sx, y0], [sx, Y + 2]] : [[sx, y0], [sx, ym], [ax, ym], [ax, Y + 2]], 14, C.ink);
      }
      const sel = Sim.fadeSel('src', srcOpen());
      D.chassis(ctx, X, Y, g.BW, g.BH, w, w ? 'BOMBA' : 'FUENTE', sel > 0.5);
      D.select(ctx, X - 6, Y - 6, g.BW + 12, g.BH + 12, sel, 16);
      ctx.save(); ctx.translate(X, Y); ctx.scale(g.FK, g.FK);
      L.div.forEach(ln => D.line(ctx, ln, 1.5, C.line, 'butt'));
      const well = C.dark ? '#26313b' : '#cbd4db';
      // en el celular, la tecla para abrirla (versión corta) o cerrarla
      if (apart(g) && L.fold) {
        const [fx, fy] = L.fold, fp = st.fpress > now ? 1 : 0;
        D.key(ctx, fx, fy, FOLD[0], FOLD[1], fp, false, null);
        ctx.save(); ctx.translate(fx, fy + fp * 1.5 - 0.5); ctx.scale(FOLD[1] / 16, FOLD[1] / 16); foldArrows(ctx, g.FL === 'mini'); ctx.restore();
      }
      if (g.FL === 'mini') {   // la versión corta: la pantallita del canal A con sus LEDs y COARSE
        const h = st.ch.A, P = L.c, out = st.on && h.v > 0.05;
        D.lcd(ctx, ...P.lcd, ...lcdText('A', w));
        P.leds.forEach(([ex, ey], j) => D.led(ctx, ex, ey, out && (j ? h.cc : !h.cc) ? 1 : 0, j ? '#ff4a3d' : undefined, 5));
        D.circle(ctx, P.co[0], P.co[1], P.co[2] / 2 + 3, well, C.ink, 1);
        ctx.restore();
        return;
      }
      CHS.forEach(c => {
        const h = st.ch[c], [ox, oy] = L.ch[c], q = p => [ox + p[0], oy + p[1], ...p.slice(2)];
        D.text(ctx, c, ...q(P.letter), C.ink, { size: 20, font: Sim.WIDE });
        const [lx, ly, lw, lh] = q(P.lcd);
        D.lcd(ctx, lx, ly, lw, lh, ...lcdText(c, w));
        const [kx, ky, kw, kh] = q(P.key), down = h.press > now ? 1 : 0;
        D.key(ctx, kx, ky, kw, kh, down, false, null);
        D.text(ctx, w ? 'P/Q' : 'V/A', kx, ky + down * 1.5 - 0.5, '#15212a', { size: 13, max: kw - 6 });
        // CV (verde): sale el voltaje de las perillas. CC (rojo): llegó al límite y sostiene la corriente.
        // Encienden con la salida, desde 0.05 V (0.05 psi) adentro del canal.
        const out = st.on && h.v > 0.05;
        P.leds.forEach((p, j) => {
          const [ex, ey] = q(p);
          D.led(ctx, ex, ey, out && (j ? h.cc : !h.cc) ? 1 : 0, j ? '#ff4a3d' : undefined, 5);
          D.text(ctx, w ? ['P', 'Q'][j] : ['CV', 'CC'][j], ex + 9, ey, C.ink, { size: 12, align: 'left' });
        });
        const [hv, hi] = P.head.map(q);
        D.text(ctx, w ? ['PRESIÓN', 'PRES.', 'P'] : ['VOLTAGE', 'VOLT.', 'V'], hv[0], hv[1], C.ink, { size: 13, max: hv[2] });
        D.text(ctx, w ? ['CAUDAL', 'CAUD.', 'Q'] : ['CURRENT', 'CURR.', 'I'], hi[0], hi[1], C.ink, { size: 13, max: hi[2] });
        P.caps.forEach((p, j) => { const [x, y, mw] = q(p); D.text(ctx, [['COARSE', 'CRS.'], ['FINE']][j], x, y, C.muted, { size: 12, max: mw }); });
        ['co', 'fi', 'cu'].forEach(k => { const [x, y, d] = q(P[k]); D.circle(ctx, x, y, d / 2 + 3, well, C.ink, 1); });
        P.jacks.forEach((p, j) => post(ctx, ...q(p), j));
      });
      D.text(ctx, ['POWER', 'PWR'], L.powLab[0], L.powLab[1], C.ink, { size: 13, max: L.powLab[2] });
      // teclas de los cables y de la polaridad, las mismas que las de los multímetros
      const [kx, ky] = L.cab, p = st.spress > now || st.staut ? 1 : 0;
      D.key(ctx, kx, ky, SK[0], SK[1], p, !st.staut && !awayK(g), st.staut);
      ctx.save(); ctx.translate(kx, ky + p * 1.5 - 0.5); ctx.scale(SK[1] / 16, SK[1] / 16); plug(ctx); ctx.restore();
      const [qx, qy] = L.pol, r = st.rpress > now || st.rev ? 1 : 0;
      D.key(ctx, qx, qy, SK[0], SK[1], r, false, null);
      if (st.rev) D.circle(ctx, qx + SK[0] / 2 - 3.5, qy - SK[1] / 2 + 5, 1.8, '#ff4a3d');   // su lucecita roja
      ctx.save(); ctx.translate(qx, qy + r * 1.5 - 0.5); ctx.scale(SK[1] / 16, SK[1] / 16); swap(ctx); ctx.restore();
      ctx.restore();
    };
    // Cables de la fuente (mangueras de la bomba) fuera de su lugar: rojo el del +, negro el del −. Son
    // cerrados, de su color: no se ve lo que circula por ellos. Van debajo del circuito, como los de los
    // multímetros.
    const leadCol = j => j ? C.neg : RED;
    const drawLeads = (ctx, g) => {
      const k = awayK(g), water = g.side === 'w';
      if (!k) return;
      ctx.save(); ctx.globalAlpha = k;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let j = 0; j < 2; j++) {
        const r = ropes[g.side]['s' + j];
        if (!r || !r.pts) continue;
        ctx.beginPath(); r.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        const ln = (w, c) => { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.stroke(); };
        if (water) { ln(28, C.card); ln(24, C.ink); ln(20, leadCol(j)); ctx.globalAlpha = k * 0.25; ln(6, '#ffffff'); ctx.globalAlpha = k; }   // con su brillo
        else { ln(8, C.card); ln(4, leadCol(j)); }
      }
      ctx.restore();
    };
    // Donde estaba la fuente el circuito queda abierto entre sus dos puntos, que es donde llegan sus cables
    // (en el agua, dos bocas de la tubería).
    const drawPorts = (ctx, g) => {
      const k = awayK(g), water = g.side === 'w';
      if (!k) return;
      const x0 = g.PX - SRC, x1 = g.PX + SRC, y = g.BOT, h = water ? Sim.PIPE + 9 : 9, e = water ? 4 : 5;
      ctx.save(); ctx.globalAlpha = k;
      ctx.fillStyle = C.card; ctx.fillRect(x0 + e, y - h, x1 - x0 - 2 * e, 2 * h);
      // el pedazo de cable que pasa por el hueco, encima de lo que se borró
      ctx.save(); ctx.beginPath(); ctx.rect(x0 + e, y - h, x1 - x0 - 2 * e, 2 * h); ctx.clip(); drawLeads(ctx, g); ctx.restore();
      if (water) for (const x of [x0, x1]) D.roundRect(ctx, x - 6, y - Sim.PIPE - 9, 12, 2 * Sim.PIPE + 18, 3, C.metal, C.ink, 2);
      else {
        for (const x of [x0, x1]) D.circle(ctx, x, y, 5.5, C.ink);
        D.text(ctx, st.rev ? '−' : '+', x0 + 14, y - 20, C.ink, { size: 20 });
        D.text(ctx, st.rev ? '+' : '−', x1 - 14, y - 20, C.ink, { size: 20 });
      }
      ctx.restore();
    };
    // Los bornes del bloque, rojo (+) y negro (−), a los lados del símbolo, de donde salen sus cables.
    const drawPosts = (ctx, g) => {
      const k = awayK(g), water = g.side === 'w';
      if (!k) return;
      const [x, y] = symAt(g);
      ctx.save(); ctx.globalAlpha = k;
      for (let j = 0; j < 2; j++) {
        const s = (j ? 1 : -1) * sgn(), px = x + s * SRC;
        if (water) D.roundRect(ctx, px - 5, y - Sim.PIPE - 4, 10, 2 * Sim.PIPE + 8, 3, leadCol(j), C.ink, 2);
        else { D.line(ctx, [[x + s * 22, y], [px, y]], 4, C.ink); D.circle(ctx, px, y, 7, leadCol(j), C.ink, 2); }
      }
      ctx.restore();
    };
    // Tierra común: el − de la fuente es la referencia de 0 V de todo el circuito (en el agua, la salida
    // hacia la bomba es la referencia de 0 psi). Su símbolo cuelga del cable de abajo, junto a la fuente.
    const drawGround = (ctx, g) => {
      const e = net ? geomE(st.nodes.u) : 0, r = g.side === 'w' ? Sim.PIPE + 5 : 2;
      const [x, y] = b.ground(g), y0 = y + r + ((g.side === 'w' ? RN + 5 : RN) - r) * e, yb = y0 + (27 - r) + (r - 5) * e;
      D.line(ctx, [[x, y0], [x, yb]], 3, C.ink, 'butt');
      [[13, 0], [8.5, 5], [4, 10]].forEach(([w, dy]) => D.line(ctx, [[x - w, yb + dy], [x + w, yb + dy]], 3, C.ink, 'butt'));
      D.text(ctx, g.side === 'w' ? '0 psi' : '0 V', x + 18, yb + 6, C.muted, { size: 14, align: 'left', bg: true });
    };
    const knobScales = (ctx, g) => b.knobs.forEach(k => {
      const [x, y] = k.pos(g);
      const low = D.knobScale(ctx, x, y, 36, k.scale(g.side), k.ticks);
      if (k.caption) D.knobCaption(ctx, k.caption(g.side), x, low);
    });

    // Cables (o mangueras con agua) de un medidor. Se dibujan antes que el circuito, el controlador
    // y los medidores, así que siempre pasan por debajo de ellos; solo las puntas van encima.
    // Al cambiar a indicadores el cable se desvanece; al recogerlo solo se dibuja lo que falta por
    // entrar al medidor.
    const drawCables = (ctx, g, kind) => {
      if (!st.show[kind]) return;
      const side = g.side;
      ctx.save();
      for (let j = 0; j < 2; j++) {
        const i = probeOf(kind, j), r = ropes[side][kind + j], m = ease(st.morph[kind][i]);
        if (!r || !r.A || !st.placed[kind][i] || m >= 1) continue;
        // al recoger el amperímetro, la pieza entra por el cable rojo y el negro se desvanece
        const reel = st.reel[kind][i], rp = reel && j === i ? reelPose(side, kind, i) : null;
        if (reel && j === i && !rp) continue;
        ctx.globalAlpha = (1 - m) * (reel && j !== i ? Math.max(0, 1 - reel * 3) : 1); fade(ctx, st.off[kind][i]);
        const col = dull(jackColor(kind, j), st.off[kind][i]);
        const pts = rp ? rp.rest : null;
        if (side === 'w') { D.hose(ctx, pts || ropePoints(r), col); continue; }   // con la raya de su borne
        if (pts) { ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); }
        else ropePath(ctx, r);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        {
          ctx.lineWidth = 6; ctx.strokeStyle = C.card; ctx.stroke();
          ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
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
      for (let i = 0; i < NP(kind); i++) {
        if (!st.placed[kind][i]) continue;
        const m = ease(st.morph[kind][i]);
        const q = st.reel[kind][i] ? reelPose(g.side, kind, i) : pose(g, kind, i), col = dull(jackColor(kind, i), st.off[kind][i]);
        if (!q) continue;
        const live = connected(kind, i), u = st.click[kind][i] / 0.4;
        if (u < 1) { ctx.globalAlpha = 1 - u; D.circle(ctx, q.x, q.y, 8 + 26 * u, null, col, 3); ctx.globalAlpha = 1; }
        ctx.save(); fade(ctx, st.off[kind][i]); ctx.translate(q.x, q.y);
        if (q.h > 0) {
          ctx.scale(1 + 0.12 * q.h, 1 + 0.12 * q.h);
          ctx.shadowColor = 'rgba(21,33,42,0.4)'; ctx.shadowBlur = 12 * q.h; ctx.shadowOffsetX = 4 * q.h; ctx.shadowOffsetY = 9 * q.h;
        }
        if (m < 1) {
          ctx.save(); ctx.globalAlpha *= 1 - m; ctx.rotate(Math.atan2(q.n[1], q.n[0])); ctx.scale(1 - 0.4 * m, 1 - 0.4 * m);
          const water = g.side === 'w', tl = tipLen(g.side), rope = !st.reel[kind][i] && ropes[g.side][kind + i];
          (water ? hoseTip : pen)(ctx, col);
          if (rope) { ctx.translate(tl, 0); ctx.rotate(rope.bootAng); ctx.translate(-tl, 0); }
          boot(ctx, tl, water ? [8, 8.5] : [5, 3.2], water ? '#9aa6af' : col);
          ctx.restore();
        }
        if (m > 0) pin(ctx, q.n, col, kind, m, live, i);
        ctx.restore();
        // seleccionada (su tarjeta abierta): contorno a lo largo de la punta, o alrededor del indicador
        const sa = Sim.fadeSel('t' + kind + i, tipOpen(kind, i));
        if (sa) {
          const len = (tipLen(g.side) + BOOT) * (1 - m) + (PIN_D + 16) * m, hh = 13 * (1 - m) + 21 * m;
          D.selectRot(ctx, q.x + q.n[0] * (len - 8) / 2, q.y + q.n[1] * (len - 8) / 2, Math.atan2(q.n[1], q.n[0]), (len + 16) / 2, hh, sa, 9);
        }
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
    // Multímetro: dentro de su funda de hule (ámbar; en el agua, azul), los dos bornes arriba (VΩA y COM),
    // la pantallita y la rueda grande. Compactado solo quedan la pantallita y una rueda chica.
    const KNOB = { body: '#2a3540', bar: '#3d4b58' };
    const drawMeter = (ctx, g, kind) => {
      if (!st.show[kind]) return;
      const water = g.side === 'w', [x, y] = meterAt(g, kind), sh = shape(kind), md = st.dial[kind], col = MCOL[md];
      ctx.save(); ctx.translate(x, y); ctx.scale(g.mk[kind], g.mk[kind]);
      const placing = st.placing && st.placing.kind === kind, warn = live(kind), blown = md === 'A' && st.fuse[kind], tripped = md === 'A' && st.trip[kind];
      const T = sh.top, H = sh.bottom - T;
      if (placing) {   // borde del color de lo que mide mientras espera dónde conectarse
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
        ctx.globalAlpha = 0.35 + 0.4 * pulse;
        D.roundRect(ctx, -sh.hw - 6, T - 6, 2 * sh.hw + 12, H + 12, 15, null, col, 6);
        ctx.globalAlpha = 1;
      }
      ctx.save();
      if (st.mheld[kind]) { ctx.shadowColor = 'rgba(21,33,42,0.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6; D.roundRect(ctx, -sh.hw, T, 2 * sh.hw, H, Sim.CHASSIS.r, C.inst); }   // levantado mientras se mueve
      ctx.restore();
      const sel = Sim.fadeSel('m' + kind, meterOpen(kind));
      const nm = meterName(kind, g.side).toUpperCase();
      D.chassis(ctx, -sh.hw, T, 2 * sh.hw, H, water, [nm, nm.replace('MULTÍMETRO', 'MULTÍM.'), nm.replace('MULTÍMETRO', 'MULT.').replace('MEDIDOR', 'MED.')], sel > 0.5, 2 * sh.hw - 20);
      if (!placing) D.select(ctx, -sh.hw - 7, T - 7, 2 * sh.hw + 14, H + 14, sel, 16);
      D.lcd(ctx, sh.lx, sh.lcd, sh.lw, sh.lh, ...meterText(kind, g.side));
      compare(ctx, kind, sh, water);
      dialKnob(ctx, kind, sh, water);
      sh.btn.forEach((p, i) => physButton(ctx, kind, i, p, sh));
      ctx.restore();
      // bornes en su placa, sobre la orilla de la funda: VΩA (rojo) y COM (negro); los distingue el color (su
      // nombre no cabe en la placa con la letra mínima de 14 px)
      ctx.save(); ctx.translate(x, y); ctx.scale(g.mk[kind], g.mk[kind]);
      const gap = jackGap(sh), [, , , , total] = rim(sh, 0), plate = [];
      for (let d = -gap - 11; d <= gap + 11; d += 3) plate.push(rim(sh, st.jpos[kind] + d / total).slice(0, 2));
      D.line(ctx, plate, 21, C.ink, 'round');
      D.line(ctx, plate, 17, KNOB.body, 'round');
      [[0, RED], [1, C.neg]].forEach(([j, c]) => {
        const [px, py] = jackLocal(kind, j);
        D.circle(ctx, px, py, 6.5, '#0d1318');
        D.circle(ctx, px, py, 4.5, c, '#ffffff55', 1);
      });
      tripButton(ctx, kind);
      // avisos arriba del multímetro (abajo si arriba no hay lugar), más arriba si ahí está la placa
      const [, cny] = rim(sh, st.jpos[kind]), up = y + (T - 52) * g.mk[kind] > 4;
      const ly = up ? T - 40 - (cny < T ? 6 : 0) : sh.bottom + 22 + (cny > sh.bottom ? 8 : 0);
      if (placing) {
        D.text(ctx, 'toca el circuito para', 0, ly, col, { size: 14, bg: true });
        D.text(ctx, `la ${water ? 'manguera' : 'punta'} ${st.placing.i ? 'negra (−)' : 'roja (+)'}`, 0, ly + 18, st.placing.i ? C.neg : RED, { size: 14, bg: true });
      } else if (blown) {   // en A con las puntas en dos nodos: corto, y la fuente daba de más
        D.text(ctx, water ? '⚠ se rompió su válvula' : '⚠ fusible fundido', 0, ly, C.danger, { size: 14, weight: 700, bg: true });
        D.text(ctx, 'cámbialo en su tarjeta', 0, ly + 18, C.danger, { size: 14, bg: true });
      } else if (tripped) {   // corto, pero su protección alcanzó: se botó su botón
        D.text(ctx, water ? '⚠ se cerró su válvula' : '⚠ se botó la protección', 0, ly, C.danger, { size: 14, weight: 700, bg: true });
        D.text(ctx, 'en A va en serie · toca el botón', 0, ly + 18, C.danger, { size: 14, bg: true });
      } else if (warn) {   // en Ω con voltaje: la lectura no sirve
        D.text(ctx, '⚠ hay ' + (water ? 'presión' : 'voltaje'), 0, ly, C.danger, { size: 14, weight: 700, bg: true });
        D.text(ctx, 'apaga la ' + (water ? 'bomba' : 'fuente'), 0, ly + 18, C.danger, { size: 14, bg: true });
      }
      ctx.restore();
    };
    // Botón de la protección: en la orilla de la funda, del lado contrario a los bornes. Sale (pop de 0 a 1,
    // con un rebote) cuando se bota y regresa al rearmarla.
    const tripButton = (ctx, kind) => {
      const p = st.pop[kind];
      if (p <= 0.01) return;
      const sh = shape(kind), [x, y, tx, ty] = rim(sh, tripU(kind)), a = Math.atan2(-ty, -tx);   // gira para que salga hacia afuera
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      const out = 14 * Math.max(0, p);   // cuánto sobresale
      D.roundRect(ctx, -17, -3, 34, 6 + out, 4, '#1b242c');   // su tallo
      D.roundRect(ctx, -21, out - 2, 42, 12, 5, RED, '#1b242c', 1.5);   // la tapa roja (el aviso de arriba dice qué hacer)
      ctx.restore();
    };
    // Botones físicos del multímetro: de hule gris, con su ícono; se hunden un instante al tocarlos.
    st.press = { a: [0, 0, 0], b: [0, 0, 0] };
    // Ícono de enchufe (el botón de los cables), centrado, en una tecla de 16 de alto.
    const plug = ctx => {
      const ink = '#1b242c';
      D.line(ctx, [[-2.5, -6], [-2.5, -3]], 1.6, ink); D.line(ctx, [[2.5, -6], [2.5, -3]], 1.6, ink);
      D.line(ctx, [[-5, -3], [5, -3], [5, 0], [0, 4], [-5, 0], [-5, -3]], 1.6, ink);
      D.line(ctx, [[0, 4], [0, 7]], 1.6, ink);
    };
    // Ícono de abrir (o mostrar completo: flechas hacia afuera, out) o de cerrar (o compactar: hacia adentro),
    // centrado, en una tecla de 16 de alto. Lo llevan los multímetros y, en el celular, la fuente.
    const foldArrows = (ctx, out, ink = '#1b242c') => {
      const o = out ? 1 : -1;
      [[-1, -1], [1, 1]].forEach(([sx, sy]) => {
        const a = [sx * 6, sy * 6], z = [sx * 1.5, sy * 1.5], tip = o > 0 ? a : z, tail = o > 0 ? z : a;
        D.line(ctx, [tail, tip], 1.6, ink);
        D.line(ctx, [[tip[0] - sx * o * 3, tip[1]], tip, [tip[0], tip[1] - sy * o * 3]], 1.6, ink);
      });
    };
    // Ícono de invertir: dos flechas, una hacia cada lado.
    const swap = (ctx, col = '#1b242c') => {
      D.line(ctx, [[-6, -2.5], [5, -2.5]], 1.6, col); D.line(ctx, [[2.5, -5], [5.5, -2.5], [2.5, 0]], 1.6, col);
      D.line(ctx, [[6, 2.5], [-5, 2.5]], 1.6, col); D.line(ctx, [[-2.5, 0], [-5.5, 2.5], [-2.5, 5]], 1.6, col);
    };
    const physButton = (ctx, kind, i, [bx, by], sh) => {
      const on = i === 0 && st.taut[kind];   // el de los cables se queda hundido mientras está encendido
      const p = st.press[kind][i] > performance.now() || on ? 1 : 0, off = i === 0 && !on && !st.placed[kind].some(Boolean);
      ctx.save();
      if (i === 2 || (i === 0 && sh.ph)) { if (sh.c >= 1) { ctx.restore(); return; } ctx.globalAlpha *= 1 - sh.c; }
      D.key(ctx, bx, by, sh.bw, sh.bh, p, off, i === 0 ? on : null);
      ctx.translate(bx, by + p * 1.5 - 0.5);
      const k = sh.bh / 16, ink = '#1b242c';
      ctx.scale(k, k);
      if (i === 0) plug(ctx);   // enchufe: los cables
      else if (i === 2) swap(ctx);   // invertir
      else foldArrows(ctx, isCompact(kind));   // compactar o mostrar completo (en el celular: abrir o cerrar)
      ctx.restore();
    };
    // Formato extendido: abajo de la pantallita, la comparación de la punta roja (+) con la negra (−): el
    // voltaje (presión) de cada una, con su barra en la misma escala; la pantallita en V marca la resta.
    const compare = (ctx, kind, sh, water) => {
      if (sh.c >= 1) return;
      const r = st.probe[kind], ok = st.show[kind] && ready(kind) && r, s = water ? PSI_PER_V : 1, u = water ? 'psi' : 'V';
      ctx.save(); ctx.globalAlpha *= 1 - sh.c;
      [[r && r.va, RED], [r && r.vb, C.neg]].forEach(([v, col], i) => {
        const y = sh.cmp + i * 20, f = ok ? Math.max(0, Math.min(1, v / b.vScale())) : 0;   // separadas lo que mide su letra
        // el + y el − de cada una, de rayitas (una letra no cabe en el puntito)
        const sc = col === RED ? '#fff' : C.card;
        D.circle(ctx, -58, y, 4.5, col);
        D.line(ctx, [[-60.5, y], [-55.5, y]], 1.4, sc, 'butt');
        if (!i) D.line(ctx, [[-58, y - 2.5], [-58, y + 2.5]], 1.4, sc, 'butt');
        // la lectura a la derecha y la barra en lo que queda
        const t = ok ? Sim.reading(v * s) + ' ' + u : '—';
        D.font(ctx, 11); const bw = Math.max(20, Math.min(66, 106 - ctx.measureText(t).width));
        D.roundRect(ctx, -50, y - 3.5, bw, 7, 3.5, C.card, C.muted, 1);
        if (ok) D.roundRect(ctx, -50, y - 3.5, Math.max(7, bw * f), 7, 3.5, Sim.speedColor(v / b.vScale()));   // del color de las partículas en presión
        D.text(ctx, t, 62, y, C.ink, { size: 11, weight: 700, align: 'right' });
      });
      ctx.restore();
    };
    // Rueda del multímetro: grande, oscura, con su barra que apunta a la posición elegida (raya blanca en
    // la punta) y alrededor las posiciones con su marca (la elegida, del color de lo que mide). dang gira
    // poco a poco.
    const dialKnob = (ctx, kind, sh, water) => {
      const { kx, ky, kr, c } = sh, a = st.dang[kind] * Math.PI / 180, names = DIAL_NAMES[water ? 'w' : 'e'];
      if (kr < 3) return;   // la versión corta del celular no la lleva
      if (c < 1) {
        ctx.save(); ctx.globalAlpha *= 1 - c;
        DIAL.forEach(d => {
          const t = DANG[d] * Math.PI / 180, on = d === st.dial[kind], sx = Math.sin(t), cy = Math.cos(t);
          D.line(ctx, [[kx + sx * (kr + 3), ky - cy * (kr + 3)], [kx + sx * (kr + 7), ky - cy * (kr + 7)]], 2.5, on ? MCOL[d] : C.muted);
          // su nombre afuera de su raya, a una distancia según lo que mide (la letra nunca baja de 14 px)
          const px = D.font(ctx, 13, Sim.FONT, on ? 800 : 600), dd = kr + 6 + D.reach(sx, cy, ctx.measureText(names[d]).width / 2, px * 0.4);
          D.text(ctx, names[d], kx + sx * dd, ky - cy * dd, on ? MCOL[d] : C.ink, { size: 13, weight: on ? 800 : 600 });
        });
        ctx.restore();
      }
      D.circle(ctx, kx, ky, kr + 2, C.dark ? '#9aa6af' : '#56626d');
      D.circle(ctx, kx, ky, kr, KNOB.body);
      ctx.save(); ctx.translate(kx, ky); ctx.rotate(a);
      const bw = Math.max(5, kr * 0.42);
      D.roundRect(ctx, -bw / 2, -kr + 2, bw, 2 * kr - 4, bw / 2, KNOB.bar, '#141c23', 1);
      D.line(ctx, [[0, -kr + 5], [0, -kr * 0.35]], Math.max(2, kr * 0.12), '#fff');
      ctx.restore();
      D.circle(ctx, kx + Math.sin(a) * (kr - 5), ky - Math.cos(a) * (kr - 5), Math.max(2, kr * 0.09), MCOL[st.dial[kind]]);
    };
    // El corte de cada multímetro en A: entre sus dos puntas el cable (o el tubo) ya no está; la corriente
    // da la vuelta por el multímetro. Se tapa ese pedazo y se dibujan los extremos que quedan.
    const drawCuts = (ctx, g) => {
      const water = g.side === 'w';
      for (const k of MS) {
        const r = st.probe[k], ct = r && st.show[k] && series(k) && ready(k) && r.cut, sg = ct && st.segs[ct.k];
        if (!sg) continue;
        const a = ct.d0 + 3, z = ct.d1 - 3;
        if (z <= a) continue;
        // en la vista de nodos el punto del nodo se queda (el cable se corta a sus dos lados)
        const keep = (st.nodes.u > 0.5 ? sg.zones || [] : []).filter(q => q.d > a && q.d < z);
        let runs = [[a, z]];
        keep.forEach(q => { runs = runs.flatMap(([u, v]) => q.d > u && q.d < v ? [[u, q.d - RN - 5], [q.d + RN + 5, v]] : [[u, v]]).filter(([u, v]) => v > u); });
        runs.forEach(([u, v]) => {
          const pts = [];
          for (let d = u; d < v; d += 4) pts.push(D.pointAt(sg.pts, d));
          pts.push(D.pointAt(sg.pts, v));
          D.line(ctx, pts, water ? 2 * Sim.PIPE + 14 : 12, C.card, 'butt');
        });
        for (const [d, s] of [[a, 1], [z, -1]]) {   // extremos: el cable termina (en el agua, un tapón)
          const [px, py, tx, ty] = D.frameAt(sg.pts, d);
          if (water) D.line(ctx, [[px - ty * (Sim.PIPE + 5), py + tx * (Sim.PIPE + 5)], [px + ty * (Sim.PIPE + 5), py - tx * (Sim.PIPE + 5)]], 5, C.pipe, 'butt');
          else D.circle(ctx, px, py, 3, C.ink);
        }
      }
    };
    // Refuerzo a lo largo de +x desde x0 (donde termina la punta), del ancho h[0] al h[1]: funda
    // del color de la punta con anillos, que se angosta hacia el cable.
    const boot = (ctx, x0, [h0, h1], col) => {
      const x1 = x0 + BOOT;
      ctx.beginPath();
      ctx.moveTo(x0 - 1, -h0); ctx.lineTo(x1 - 3, -h1); ctx.quadraticCurveTo(x1, -h1, x1, 0);
      ctx.quadraticCurveTo(x1, h1, x1 - 3, h1); ctx.lineTo(x0 - 1, h0); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.ink; ctx.stroke();
      ctx.strokeStyle = col === C.neg && !C.dark ? 'rgba(255,255,255,0.45)' : 'rgba(21,33,42,0.45)'; ctx.lineWidth = 1.5;
      for (let k = 1; k <= 3; k++) {
        const x = x0 + BOOT * k / 4, h = h0 + (h1 - h0) * k / 4 - 1;
        ctx.beginPath(); ctx.moveTo(x, -h); ctx.lineTo(x, h); ctx.stroke();
      }
    };
    // Indicador (con el contacto en el origen): anillo que abraza el cable y, unido por un palito, un
    // círculo grande del color de la punta con + o − (A en la pinza), con halo para verse de lejos.
    // m de 0 a 1: el palito crece y el círculo aparece con un pequeño rebote. Sin conectar, el
    // anillo va punteado.
    const pin = (ctx, n, col, kind, m, live, i) => {
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
      D.text(ctx, i ? '−' : '+', 0, 1, i && C.dark ? C.card : '#fff', { size: 20, weight: 800 });
      ctx.restore();
      ctx.globalAlpha = a0;
    };
    // Lectura y unidad de un multímetro; desde 1000 mA (o mL/s) pasa a la unidad grande: 1.00 A (o L/s).
    const probeText = (kind, scale, unit, big) => {
      if (!ready(kind) || !st.probe[kind]) return [' ----', unit];
      const v = st.probe[kind].value * scale;
      return big && Math.abs(v) >= 999.95 ? [Sim.reading(v / 1000), big] : [Sim.reading(v), unit];
    };
    // Lo que marca la pantallita según la perilla, de cada lado. En Ω pasa a kΩ y MΩ; sin camino, O.L.
    // Apagado, la pantallita se queda vacía.
    const meterText = (kind, side) => {
      const md = st.dial[kind], w = side === 'w';
      if (md === 'off') return ['    ', ''];
      if (md === 'V') return probeText(kind, w ? PSI_PER_V : 1, w ? 'psi' : 'V');
      if (md === 'A') return probeText(kind, w ? MLS_PER_MA : 1, w ? 'mL/s' : 'mA', w ? 'L/s' : 'A');
      const r = st.probe[kind];
      if (!ready(kind) || !r || Number.isNaN(r.value)) return [' ----', 'Ω'];
      const v = r.value, a = Math.abs(v);
      if (!isFinite(v)) return [' O.L', 'MΩ'];
      return a < 999.95 ? [Sim.reading(v), 'Ω'] : a < 999950 ? [Sim.reading(v / 1000), 'kΩ'] : [Sim.reading(v / 1e6), 'MΩ'];
    };

    // El circuito de la página y los cables de los medidores. En la vista de nodos (o mientras se
    // transforma) el dibujo de la página se desvanece y encima va el de los nodos; los cables de los
    // medidores siempre pasan por debajo del circuito.
    const circuitAndCables = (ctx, g, m, drawPage) => {
      const u = net ? st.nodes.u : 0;
      if (!u) { MS.forEach(k => drawCables(ctx, g, k)); drawLeads(ctx, g); drawPage(ctx, g, m); drawPorts(ctx, g); drawCuts(ctx, g); drawSel(ctx, g); return; }
      if (u < 1) {
        drawPage(ctx, g, m);
        ctx.save(); ctx.globalAlpha = Math.min(1, u / 0.3); ctx.fillStyle = C.card;   // hasta la mesa
        if (g.mode === 'lateral') ctx.fillRect(-4000, -4000, 4000 + g.DESK, 8000); else ctx.fillRect(-4000, -4000, 8000, 4000 + g.DESK);
        ctx.restore();
      }
      MS.forEach(k => drawCables(ctx, g, k));
      drawLeads(ctx, g);
      drawNodes(ctx, g, m, u);
      drawPorts(ctx, g);
      drawCuts(ctx, g);
      drawSel(ctx, g);
    };
    // Componente seleccionado (su tarjeta abierta, pr de b.pinch o b.part): un contorno azul a lo largo de su
    // cable, de su ancho (half) y lo que sobresale (ext); en la vista de nodos, donde quedó.
    const drawSel = (ctx, g) => {
      const water = g.side === 'w';
      for (const sg of st.list || []) for (const c of sg.comps || []) {
        if (!c.pr || !c.pr.open) continue;
        const a = Sim.fadeSel(c.pr, c.pr.open());
        if (!a) continue;
        const nc = net && st.nodes.u && net.comps.find(q => q.c === c);
        let x, y, ang;
        if (nc && nc.pose) ({ x, y, ang } = nc.pose);
        else { const f = D.frameAt(sg.pts, project(sg.pts, ...c.at).d); [x, y] = f; ang = Math.atan2(f[3], f[2]); }
        D.selectRot(ctx, x, y, ang, c.half + 8, extOf(c, water) + 6, a);
      }
    };
    // Cuánto sobresale un componente a cada lado de su cable (ext de la página, un número o ext(water)).
    const extOf = (c, water) => typeof c.ext === 'function' ? c.ext(water) : c.ext || 22;
    const nodeText = (v, water) => Sim.fmt(Math.abs(v) < 0.005 ? 0 : v, 2) + (water ? ' psi' : ' V');
    const drawNodes = (ctx, g, m, u) => {
      const water = g.side === 'w', kw = Math.min(1, u / 0.3), kn = Math.max(0, (u - 0.5) / 0.5);
      const c0 = [0, 0];
      net.nodes.forEach(n => { c0[0] += n.p[0] / net.nodes.length; c0[1] += n.p[1] / net.nodes.length; });
      ctx.save(); ctx.globalAlpha = kw;
      // cables (tuberías): de su color de siempre; el voltaje (presión) lo muestran las partículas
      const src = st.segs.find(sg => sg.source);
      if (src) water ? D.pipe(ctx, src.pts) : D.wire(ctx, src.pts);
      for (const p of net.pieces) if (water) D.pipe(ctx, p.m); else D.wire(ctx, p.m);
      // lo que circula, por cada tramo
      st.segs.forEach((sg, k) => { if (!sg.source) D.flow(ctx, sg.pts, st.nph[k] || 0, water ? C.water : C.charge, { gap: 30, r: water ? 3.6 : 4.5 }); });
      // componentes: el dibujo de la página, movido y girado a su lugar (sin sus letreros)
      for (const c of net.comps) (water ? D.pipe : D.wire)(ctx, [c.pose.a, c.pose.b]);   // el cable sigue por debajo
      const quiet = D.text, quietBg = D.backdrop;
      for (const c of net.comps) {
        const P = c.pose;
        ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(P.ang - c.a0); ctx.translate(-c.c.at[0], -c.c.at[1]);
        D.text = D.backdrop = () => {};
        try {
          if (c.c.draw) c.c.draw(ctx, water, g, m);
          else { D.roundRect(ctx, c.c.at[0] - c.half, c.c.at[1] - 14, 2 * c.half, 28, 6, C.card, C.ink, 2.5); }
        } finally { D.text = quiet; D.backdrop = quietBg; }
        ctx.restore();
      }
      ctx.restore();
      if (!kn) return;
      ctx.save(); ctx.globalAlpha = kn;
      // Etiquetas derechas (las de los componentes y el valor de cada nodo), donde no tapen nada: de varios
      // lugares alrededor se escoge el que choca con menos cables, componentes, nodos y otras etiquetas,
      // sin salirse de lo que se ve y de preferencia hacia afuera del circuito.
      const dots = [], boxes = [];
      for (const p of net.pieces) for (let j = 1; j < p.m.length; j++) {
        const A = p.m[j - 1], B = p.m[j], n = Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 6);
        for (let t = 0; t <= n; t++) dots.push([A[0] + (B[0] - A[0]) * t / (n || 1), A[1] + (B[1] - A[1]) * t / (n || 1), water ? 12 : 4]);
      }
      for (const c of net.comps) {
        const n = Math.ceil(2 * c.half / 8);
        for (let t = 0; t <= n; t++) dots.push([c.pose.a[0] + (c.pose.b[0] - c.pose.a[0]) * t / n, c.pose.a[1] + (c.pose.b[1] - c.pose.a[1]) * t / n, extOf(c.c, water)]);
      }
      net.nodes.forEach(n => dots.push([n.p[0], n.p[1], RN + 10]));
      for (const kind of MS) if (st.show[kind]) st.clamps[kind].slice(0, NP(kind)).forEach((_, i) => {
        if (!connected(kind, i)) return;
        const q = pose(g, kind, i);   // la punta y el principio de su cable, que salen hacia afuera
        for (let d = 0; d <= 60; d += 15) dots.push([q.x + q.n[0] * d, q.y + q.n[1] * d, d ? 16 : 24]);
      });
      // los controles de la página que están sobre el dibujo (un selector, un botón)
      const q = panel(g.side);
      if (q.box.clientWidth) for (const it of q.items) {
        const el = it.el;
        if (el.hidden || !el.offsetParent || el.matches('.sim-clamp, .sim-hit, .sim-pinch, .sim-meter-hit, .sim-meter-btn, .sim-dial, .sim-power, .knob')) continue;
        const r = el.getBoundingClientRect(), pr = q.box.getBoundingClientRect(), X = v => (v - pr.left - q.ox) / q.scale, Y = v => (v - pr.top - q.oy) / q.scale;
        if (r.width) boxes.push([X(r.left), Y(r.top), X(r.right), Y(r.bottom)]);
      }
      const gn = net.nodes.find(n => n.ground);
      if (gn) boxes.push([gn.p[0] - 16, gn.p[1] + RN, gn.p[0] + 60, gn.p[1] + RN + 44]);
      const x0 = g.VX + 6, x1 = g.VX + g.W - 6, y0 = b.labelTop[g.side] || 6, y1 = g.BOT + 30;
      const place = (w, h, cands) => {
        let best = null;
        for (const [x, y, pref] of cands) {
          const r = [x - w / 2 - 3, y - h / 2 - 3, x + w / 2 + 3, y + h / 2 + 3];
          let score = -pref * 4;
          if (r[0] < x0 || r[2] > x1 || r[1] < y0 || r[3] > y1) score += 1000;
          for (const [dx, dy, rr] of dots) {
            const ex = Math.max(r[0] - dx, 0, dx - r[2]), ey = Math.max(r[1] - dy, 0, dy - r[3]);
            if (ex * ex + ey * ey < rr * rr) score += 10;
          }
          for (const q of boxes) if (r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]) score += 300;
          if (!best || score < best.score) best = { x, y, score, r };
        }
        boxes.push(best.r);
        return best;
      };
      const out = (x, y) => { const dx = x - c0[0], dy = y - c0[1], l = Math.hypot(dx, dy); return l < 1 ? [0, -1] : [dx / l, dy / l]; };
      const TH = Math.round(Sim.px(16, ctx) * 1.3);
      for (const c of net.comps) {
        const tg = c.c.tag && c.c.tag(water);
        if (!tg) continue;
        const P = c.pose, o = out(P.x, P.y), ext = extOf(c.c, water) + 8;
        const w = D.tagWidth(ctx, tg[0], tg[1], tg[3]);
        const cands = [];
        for (const s of [1, -1]) for (const slide of [0, -0.5, 0.5, -1, 1, -1.6, 1.6]) for (const more of [0, 24]) {
          const px = -Math.sin(P.ang) * s, py = Math.cos(P.ang) * s, tx = Math.cos(P.ang), ty = Math.sin(P.ang);
          const off = ext + more + Math.abs(px) * w / 2 + Math.abs(py) * TH / 2;
          cands.push([P.x + px * off + tx * slide * c.half, P.y + py * off + ty * slide * c.half, px * o[0] + py * o[1] - Math.abs(slide) - more / 12]);
        }
        const q = place(w, TH, cands);
        b.tag(ctx, c.c.pr, q.x, q.y, tg[0], tg[1], tg[2], false, tg[3]);
      }
      // nodos: un punto de soldadura (en el agua, una cámara) del color de su cable, con su valor
      for (const n of net.nodes) {
        const [x, y] = n.p;
        if (water) {
          D.circle(ctx, x, y, RN + 8, C.pipe);
          D.circle(ctx, x, y, RN + 3, C['water-soft']);
        } else D.circle(ctx, x, y, RN, C.ink);
      }
      for (const n of net.nodes) {
        if (n.ground) continue;   // la tierra lleva su símbolo con 0 V
        const [x, y] = n.p, t = nodeText(n.v, water), o = out(x, y);
        const px = D.font(ctx, 16, Sim.MONO, 600);
        const w = ctx.measureText(t).width + 14, h = Math.round(px * 1.45), cands = [];
        for (let k = 0; k < 16; k++) for (const more of [0, 28, 56]) {
          const a = k * Math.PI / 8, dx = Math.cos(a), dy = Math.sin(a), off = RN + (water ? 14 : 8) + more + Math.abs(dx) * w / 2 + Math.abs(dy) * h / 2;
          cands.push([x + dx * off, y + dy * off, dx * o[0] + dy * o[1] - more / 14]);
        }
        const q = place(w, h, cands);
        D.roundRect(ctx, q.x - w / 2, q.y - h / 2, w, h, h / 2, C.card, water ? C.pipe : C.ink, 2);
        D.text(ctx, t, q.x, q.y + 0.5, C.ink, { size: 16, font: Sim.MONO, weight: 600 });
      }
      ctx.restore();
    };

    // La mesa de trabajo: una franja de otro tono debajo del circuito (a la derecha en el celular acostado),
    // con el lugar punteado del segundo multímetro.
    const drawDesk = (ctx, g) => {
      ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = C.bg;
      if (g.mode === 'lateral') ctx.fillRect(g.DESK, -2000, 4000, 4000);
      else ctx.fillRect(-2000, g.DESK, 4000, 4000);
      ctx.restore();
      if (!slotOpen()) return;
      const [x, y] = homeAt(g, 'b'), sh = shape('b'), k = g.mk.b;
      ctx.save(); ctx.setLineDash([7, 6]);
      D.roundRect(ctx, x - sh.hw * k, y + sh.top * k, 2 * sh.hw * k, (sh.bottom - sh.top) * k, Sim.CHASSIS.r, null, C.muted, 2);
      ctx.restore();
    };
    function drawWater() {
      const g = b.gw, m = st.m, ctx = b.pw.begin();
      drawDesk(ctx, g);
      circuitAndCables(ctx, g, m, o.drawW);
      drawGround(ctx, g);
      knobScales(ctx, g);
      // el bloque de la bomba va encima de los medidores: es lo que se arrastra a donde haya lugar
      MS.forEach(k => drawMeter(ctx, g, k));
      drawSource(ctx, g);
      D.pump(ctx, ...symAt(g), st.rotor, st.omega);
      drawPosts(ctx, g);
      MS.forEach(k => drawTips(ctx, g, k));
      o.overlay && o.overlay(ctx, g, m);
    }
    function drawElectric() {
      const g = b.ge, m = st.m, ctx = b.pe.begin();
      drawDesk(ctx, g);
      circuitAndCables(ctx, g, m, o.drawE);
      drawGround(ctx, g);
      knobScales(ctx, g);
      MS.forEach(k => drawMeter(ctx, g, k));
      drawSource(ctx, g);
      { const [x, y] = symAt(g); ctx.save(); ctx.translate(x, y); ctx.scale(sgn(), 1); D.source(ctx, 0, 0); ctx.restore(); }   // invertida, al revés
      drawPosts(ctx, g);
      MS.forEach(k => drawTips(ctx, g, k));
      o.overlay && o.overlay(ctx, g, m);
    }

    // ---------- animación ----------
    // La inercia es el tiempo que tarda todo en arrancar o detenerse por completo.
    // También los cambios bruscos del circuito (abrir una válvula, romper o cambiar una rueda, pasar a
    // paralelo): la corriente va de su valor anterior al nuevo en el tiempo de la inercia, con curva suave.
    // Los cambios por la perilla o el encendido ya vienen suaves por el voltaje y pasan sin más.
    // Si algo se rompe (b.halt) no hay inercia que valga: el flujo se frena de golpe, en HALT segundos
    // y desacelerando fuerte desde el principio, para que se vea que choca y no que se congela.
    const HALT = 0.18;
    const flat = m => [m.I, ...(m.branch || [])];
    const smooth = { raw: null, vPrev: 0, off: null, from: null, t: 0, dur: 0, sharp: false, halt: false };
    b.halt = () => { smooth.halt = true; };
    const inertia = V => {
      const m = o.model(V), now = flat(m);
      if (smooth.raw && !o.stateful) {
        const before = flat(o.model(smooth.vPrev));   // el circuito de ahora con el voltaje de antes
        if (before.length !== smooth.raw.length || before.some((x, k) => Math.abs(x - smooth.raw[k]) > 1e-6)) {
          // hubo un cambio en el circuito: arranca desde lo que se veía
          const shown = smooth.raw.map((x, k) => x + (smooth.off ? smooth.off[k] || 0 : 0));
          smooth.from = now.map((x, k) => (shown[k] ?? shown[0]) - x);
          smooth.t = 0; smooth.sharp = smooth.halt;
          smooth.dur = smooth.sharp ? Math.min(HALT, st.tau) : st.tau;
        }
      }
      smooth.raw = now; smooth.vPrev = V; smooth.halt = false;
      if (smooth.from) {
        const u = smooth.dur > 0 ? Math.min(1, smooth.t / smooth.dur) : 1;
        const k = smooth.sharp ? (1 - u) * (1 - u) : 1 - u * u * (3 - 2 * u);
        smooth.off = smooth.from.map(x => x * k);
        if (u >= 1) smooth.from = smooth.off = null;
      }
      if (!smooth.off) return m;
      // de lo que se veía a lo nuevo (pasa por cero si cambió de sentido, como al invertir la polaridad)
      const out = { ...m, I: m.I + smooth.off[0] };
      if (m.branch) out.branch = m.branch.map((x, k) => x + smooth.off[k + 1]);
      return out;
    };
    // Transiciones de las puntas: cable ⇄ indicador, recoger o sacar el cable y la caída al conectarse.
    const animate = dt => {
      let moved = false;
      for (const kind of MS) {
        for (let i = 0; i < NP(kind); i++) {
          // al recoger una punta del suelo primero se vuelve cable y luego entra al medidor
          const m0 = st.morph[kind][i], r0 = st.reel[kind][i];
          st.morph[kind][i] = st.pinned[kind] && !r0 ? Math.min(1, m0 + dt / MORPH) : Math.max(0, m0 - dt / MORPH);
          if (r0 && !st.morph[kind][i]) st.reel[kind][i] = Math.min(1, r0 + dt / REEL);
          if (st.reel[kind][i] >= 1) {   // ya entró: queda guardada hasta que se vuelva a poner
            st.reel[kind][i] = 0; st.placed[kind][i] = false; st.floor[kind][i] = null;
            syncs.forEach(f => f()); syncReel();
          }
          if (st.morph[kind][i] !== m0 || st.reel[kind][i] !== r0) moved = true;
          const dr = st.drop[kind][i], lf = st.lift[kind][i], o0 = st.off[kind][i];
          st.off[kind][i] = connected(kind, i) && !st.pend[kind][i] ? Math.max(0, o0 - dt / 0.2) : Math.min(1, o0 + dt / 0.2);
          st.click[kind][i] += dt;
          // levantada, la punta gira poco a poco para que su contacto mire a la línea más cercana
          // (si se agarró del anillo, el círculo solo lo sigue)
          if (lf) { const k = Math.exp(-dt * 18); lf.ox *= k; lf.oy *= k; moved = true; }
          const [cx, cy] = lf ? liftContact(kind, i) : [0, 0];
          const p = lf && lf.mode !== 'magnet' && st.segs.length && snap(st.segs, cx, cy, true, kind);
          if (p && p.dist > 1) {
            const a0 = Math.atan2(lf.n[1], lf.n[0]), a1 = Math.atan2(cy - p.y, cx - p.x);
            const d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)), an = a0 + d * (1 - Math.exp(-dt * 14));
            if (Math.abs(d) > 1e-3) { lf.n = [Math.cos(an), Math.sin(an)]; moved = true; }
          }
          if (dr && (dr.t += dt) >= (dr.dur || DROP)) { st.drop[kind][i] = null; st.click[kind][i] = 0; }
          if (dr) moved = true;
        }
      }
      for (const kind of MS) {
        const c0 = st.cmp[kind];
        st.cmp[kind] = isCompact(kind) ? Math.min(1, c0 + dt / 0.3) : Math.max(0, c0 - dt / 0.3);
        if (st.cmp[kind] !== c0) moved = true;
        // el botón de la protección sale de golpe con un rebote, o se mete al rearmarla
        const pt = st.trip[kind] ? 1 : 0;
        if (Math.abs(pt - st.pop[kind]) > 0.002 || Math.abs(st.popv[kind]) > 0.02) {
          const h = dt / 4;
          for (let i = 0; i < 4; i++) {
            st.popv[kind] += (pt ? 700 * (pt - st.pop[kind]) - 18 * st.popv[kind] : 900 * (pt - st.pop[kind]) - 60 * st.popv[kind]) * h;
            st.pop[kind] += st.popv[kind] * h;
          }
          if (Sim.REDUCE.matches) { st.pop[kind] = pt; st.popv[kind] = 0; }
          moved = true;
        } else if (st.pop[kind] !== pt) { st.pop[kind] = pt; st.popv[kind] = 0; moved = true; }
        // la placa de los bornes se recorre por la orilla hacia donde van los cables
        const jt = jackTarget(b.ge, kind);
        if (jt != null) {
          const du = ((jt - st.jpos[kind]) % 1 + 1.5) % 1 - 0.5;
          if (Math.abs(du) > 1e-4) { st.jpos[kind] = (st.jpos[kind] + du * (1 - Math.exp(-dt * 7)) + 1) % 1; moved = true; }
        }
        // la rueda va a su posición (más su estirón hacia el dedo) como jalada por un imán: con un rebote
        const a0 = st.dang[kind], to = DANG[st.dial[kind]] + st.dpull[kind];
        if (Math.abs(to - a0) > 0.05 || Math.abs(st.dvel[kind]) > 0.5) {
          const h = dt / 4;
          for (let i = 0; i < 4; i++) {
            st.dvel[kind] += (420 * (to - st.dang[kind]) - 20 * st.dvel[kind]) * h;
            st.dang[kind] += st.dvel[kind] * h;
          }
          moved = true;
        } else if (a0 !== to) { st.dang[kind] = to; st.dvel[kind] = 0; moved = true; }
      }
      // la fuente soltada cerca de su lugar regresa como jalada por un imán, con un rebote
      const sk = b.ge.mode, so = st.spos[sk];
      if (st.svel && so) {
        const h = dt / 4;
        for (let i = 0; i < 4; i++) for (let c = 0; c < 2; c++) {
          st.svel[c] += (-260 * so[c] - 18 * st.svel[c]) * h;
          so[c] += st.svel[c] * h;
        }
        if (Math.hypot(...so) < 0.3 && Math.hypot(...st.svel) < 4) { delete st.spos[sk]; st.svel = null; }
        moved = true;
      } else if (st.svel) st.svel = null;
      if (moved) { b.pw.replace(); b.pe.replace(); }
    };
    // Voltaje que sale de un canal con el de adentro Vs: el mismo si la corriente no pasa de su límite; si
    // pasaría, el que da justo el límite (la corriente crece con el voltaje, así que se busca partiendo a la
    // mitad). El canal A alimenta el circuito de la página; el B no tiene nada conectado (no pasa corriente).
    const load = c => c === 'A' ? V => o.model(sgn() * V).I : () => 0;
    const regulate = (c, Vs) => {
      const I = load(c), over = V => Math.abs(I(V)) > st.ch[c].lim;
      if (Vs <= 0 || !over(Vs)) return [Math.max(0, Vs), false];
      let lo = 0, hi = Vs;
      for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (over(mid)) hi = mid; else lo = mid; }
      return [lo, true];
    };
    b.start = () => Sim.run(dt => {
      for (const c of CHS) {
        const h = st.ch[c];
        h.v = h.level.step(st.on ? setOf(c) : 0, st.tau, dt);
        [h.vo, h.cc] = regulate(c, h.v);
      }
      const A = st.ch.A;
      st.v = A.v; st.cc = A.cc;
      if (b.vScale() !== st.vs) { st.vs = b.vScale(); syncColors(); }   // la escala de colores cambia de tope
      st.vo = A.vo * sgn();   // con la polaridad invertida sale al revés
      smooth.t += dt;
      st.m = inertia(st.vo);
      A.io = st.m.I;   // lo que marca su pantallita en A, con la inercia, igual que el multímetro
      st.list = circuitList(b.gw, st.m, st.vo);
      st.segs = buildSegs(nodeView(st.list, dt));
      if (st.nodes.u) st.segs.forEach((sg, k) => { st.nph[k] = ((st.nph[k] || 0) + Math.sign(sg.I) * Math.min(Math.abs(sg.I), 60) * 6 * dt) % 1e4; });
      const before = JSON.stringify(st.clamps);
      st.probe = measure(st.segs);
      if (JSON.stringify(st.clamps) !== before) { b.pw.replace(); b.pe.replace(); }
      animate(dt);
      colorWhileDragging();
      for (const [side, g] of [['w', b.gw], ['e', b.ge]]) for (const kind of MS) for (let j = 0; j < 2; j++) ropeStep(side, g, kind, j, dt);
      for (const [side, g] of [['w', b.gw], ['e', b.ge]]) for (let j = 0; j < 2; j++) leadStep(side, g, j, dt);
      st.rpm = st.m.I * RPM_PER_MA;                                // 100 rpm por cada mL/s
      st.omega = -st.rpm / 60 * 2 * Math.PI;                       // rad/s, a la velocidad real
      st.rotor += st.omega * dt;
      o.step && o.step(dt, st.m);
      drawWater(); drawElectric();
    });
    Sim.benchNow = b;   // el banco de la página, para probar desde la consola
    return b;
  };
})();
