// Taller de Electrónica: la protoboard (Sim.protoboard), con su pila (en el agua, la bomba), su bandeja de piezas y la
// red de nodos que la resuelve. La usan Protoboard (libre: cables y resistencias de la bandeja) y las páginas del armado
// guiado (o.guide: cada paso pone una pieza en agujeros dados, con su lugar punteado, y se revisa solo).
(() => {
  const { C, draw: D, fmt } = Sim;

  // o.tray: lo que trae la bandeja en el modo libre ('wire', 'res', 'led'); o.guide: los pasos del armado guiado,
  // [{ name, piece: { type, a: [c, r], b: [c, r], R, led, color } }] (columnas c de 0 a 15 y filas r de ROWNAME;
  // en el LED, a es la pata + y b la −; en el pulsador, a y b son las dos patas de arriba, en la misma fila).
  // Da { st, make, hole, load, clear, steps }: la página pone sus piezas con load y, si no es guiada, sus pasos.
  Sim.protoboard = (o = {}) => {
    // ---------- la protoboard ----------
    // Todo se guarda en coordenadas de la protoboard (u, v), en pasos entre agujeros: u avanza por
    // las columnas (1 a 16) y v por las filas. En pantallas horizontales u va a la derecha; en las
    // verticales la protoboard se acuesta y u va hacia abajo, para que se vea grande.
    const P = 34, N = 16;
    const ROWV = [0, 1, 2.5, 3.5, 4.5, 5.5, 6.5, 8, 9, 10, 11, 12, 13.5, 14.5];
    const ROWNAME = ['+', '−', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', '+', '−'];
    const BOARD = [-1, -0.8, N, 15.3];          // u0, v0, u1, v1
    const TERM = { '+': [-2.3, 1.6], '-': [-2.3, 4.4] };
    // La pila (en el agua, la bomba) es un instrumento: su chasis (CH) lleva el nombre arriba, la pila adentro
    // y su palanca ON/OFF; el lugar de la pila (bat) y de la palanca (power) cambia con la orientación (ver GEO). En
    // vertical la caja es más baja: la rueda va a la derecha del nombre y un poco abajo, para no taparlo.
    const CH = [-5.9, -0.5, -2.3, 7.6];
    const TRAY = [-5.6, 7.7, -2.2, 14.6];
    // Las piezas de la bandeja (tipo y v). En vertical van paradas y el valor de la resistencia queda a su lado:
    // se separan para que no tape al LED. En el armado guiado, solo la pieza del paso, al centro.
    const TRAYITEMS = { h: [['wire', 8.7], ['res', 11.05], ['led', 13.4]], v: [['wire', 8.3], ['res', 10.3], ['led', 13.9]] };
    const TRAYMID = (TRAY[1] + TRAY[3]) / 2;
    const guide = o.guide || null, trayTypes = o.tray || ['wire', 'res'];
    const V0 = 9, RINT = 1, FUSE = 1, RD = 15, RW = 0.05, IMAX = Sim.LED_IMAX;
    const VIOLET = '#8b5cf6', OKC = '#0ea371', REDW = '#d6392b', BLACKW = '#15212a';
    const RVALUES = Sim.series(100, 10000);   // valores comunes (serie E12)
    const vf = k => Sim.led(k.led).vf;        // cada color de LED necesita otro voltaje
    const COLORS = ['#1f9d55', '#e0a400', '#2563eb', '#ea7a1a', '#d6392b', BLACKW];

    // Arriba queda una franja (BAND) para el selector del color de las partículas y su escala.
    const BAND = 70;
    const GEO = {
      h: { W: 765, H: 581 + BAND, pt: (u, v) => [(u + 6.2) * P, (v + 1.3) * P + BAND], uv: (x, y) => [x / P - 6.2, (y - BAND) / P - 1.3], bat: [-5.6, 0.7, -2.95, 3.8], power: [-3.9, 5.7] },
      v: { W: 581, H: 765 + BAND, pt: (u, v) => [(v + 1.3) * P, (u + 6.2) * P + BAND], uv: (x, y) => [(y - BAND) / P - 6.2, x / P - 1.3], bat: [-5.4, 2.5, -2.75, 5.6], power: [-3.9, 6.6] }
    };
    const group = (c, r) => r === 0 ? 'R0p' : r === 1 ? 'R0n' : r === 12 ? 'R1p' : r === 13 ? 'R1n' : (r < 7 ? 'T' : 'B') + c;
    const groupHoles = g => {
      if (g[0] === 'R') { const r = { R0p: 0, R0n: 1, R1p: 12, R1n: 13 }[g]; return [...Array(N).keys()].map(c => [c, r]); }
      const c = +g.slice(1), r0 = g[0] === 'T' ? 2 : 7;
      return [0, 1, 2, 3, 4].map(k => [c, r0 + k]);
    };
    const GROUPS = ['R0p', 'R0n', 'R1p', 'R1n'];
    for (let c = 0; c < N; c++) GROUPS.push('T' + c, 'B' + c);

    // ---------- estado ----------
    // step: el paso de la barra; touched: si se movió algo desde el último ejemplo (entonces cambiar de paso ya no
    // pone el ejemplo de ese paso).
    const st = { on: true, fuse: true, fuseHeat: 0, inside: true, comps: [], sel: null, drag: null, nextId: 1, colorK: 0,
      V: {}, reach: new Set(), Ibat: 0, phase: new Map(), pump: 0, blowT: 9, step: 0, touched: false };
    try { st.inside = localStorage.getItem('pb-dentro') !== '0'; } catch (e) {}
    const legUV = l => l.term ? TERM[l.term] : l.c != null ? [l.c, ROWV[l.r]] : [l.u, l.v];
    const legNode = l => l.term ? (l.term === '+' ? 'bp' : 'bn') : l.c != null ? group(l.c, l.r) : null;
    // El pulsador (de 6 mm, cuatro patas) va montado sobre el canal del centro: sus patas a y a2 (de un lado) están unidas
    // por dentro, igual que b y b2; apretarlo une un lado con el otro.
    const legsOf = k => k.type === 'push' ? [k.a, k.b, k.a2, k.b2] : [k.a, k.b];
    const make = (type, a, b, extra = {}) => ({ id: 'id' in extra ? extra.id : st.nextId++, type, a, b, I: 0, on: false, burnt: false, ang: 0, breakT: 9, R: 470, led: 'rojo', ...extra });
    const hole = (c, r) => ({ c, r });
    // Pulsador con su pata a en (c, r): b dos columnas a la derecha y a2, b2 en la fila siguiente (de e a f cruza el canal).
    const pushHoles = (c, r) => [hole(c, r), hole(c + 2, r), hole(c, r + 1), hole(c + 2, r + 1)];
    const okPush = (c, r) => c >= 0 && c + 2 < N && r >= 2 && r + 1 <= 11;
    const makePush = (a, b, a2, b2, extra = {}) => make('push', a, b, { a2, b2, Ia: 0, Ib: 0, press: false, ...extra });
    // Calor de una resistencia (¼ W) o de un LED (Vf · 30 mA), ver Sim.heat; su menú lo muestra.
    const heatOf = k => k.h || (k.h = Sim.heat(k.type === 'led' ? { ...Sim.HEAT.led, pMax: () => Sim.led(k.led).vf * IMAX / 1000 } : Sim.HEAT.res));
    const defaultLeads = () => [make('lead', { term: '+' }, hole(0, 0), { color: REDW }), make('lead', { term: '-' }, hole(0, 1), { color: BLACKW })];

    const occupied = skip => {
      const s = new Set();
      for (const k of st.comps) if (k !== skip) for (const l of legsOf(k)) if (l.c != null) s.add(l.c + ',' + l.r);
      return s;
    };
    const nearestHole = (u, v, occ, maxD = 0.75) => {
      let best = null, bd = maxD;
      const c0 = Math.round(u);
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        if (c < 0 || c >= N) continue;
        for (let r = 0; r < ROWV.length; r++) {
          const d = Math.hypot(u - c, v - ROWV[r]);
          if (d < bd && !occ.has(c + ',' + r)) { bd = d; best = hole(c, r); }
        }
      }
      return best;
    };
    const inBoard = (u, v) => u > BOARD[0] && u < BOARD[2] && v > BOARD[1] && v < BOARD[3];

    // ---------- el circuito: análisis de nodos ----------
    // Cada tira de 5 agujeros y cada riel es un nodo. La pila es una fuente de 9 V con 1 Ω por dentro
    // y un fusible de 1 A; el LED necesita el voltaje de su color (1,8 V el rojo) y tiene 15 Ω; los cables
    // y los contactos del pulsador, 0,05 Ω.
    function solve() {
      const idx = new Map(), names = [];
      const id = n => { if (n === 'bn') return -1; if (!idx.has(n)) { idx.set(n, names.length); names.push(n); } return idx.get(n); };
      id('bp');
      // cada elemento: entre dos nodos, con su resistencia (o el LED) y a dónde va su corriente (put, en mA)
      const els = [];
      const add2 = (k, l1, l2, R, put) => {
        const n1 = legNode(l1), n2 = legNode(l2);
        if (!n1 || !n2 || n1 === n2) return;
        els.push({ k, n1, n2, i: id(n1), j: id(n2), R, put });
      };
      for (const k of st.comps) {
        k.I = 0;
        if (k.type === 'push') {
          k.Ia = k.Ib = 0;
          add2(k, k.a, k.a2, RW, I => { k.Ia = I; });
          add2(k, k.b, k.b2, RW, I => { k.Ib = I; });
          if (k.press) add2(k, k.a, k.b, RW, I => { k.I = I; });
          continue;
        }
        if (k.burnt) { if (k.type === 'led') k.on = false; continue; }
        const n = els.length;
        add2(k, k.a, k.b, k.type === 'res' ? k.R : k.type === 'led' ? null : RW, I => { k.I = I; });
        if (k.type === 'led' && els.length === n) k.on = false;
      }
      const n = names.length, src = st.on && st.fuse;
      let V = new Float64Array(n);
      for (let iter = 0; iter < 20; iter++) {
        const G = Array.from({ length: n }, () => new Float64Array(n + 1));
        const add = (i, j, g) => { if (i >= 0) G[i][i] += g; if (j >= 0) G[j][j] += g; if (i >= 0 && j >= 0) { G[i][j] -= g; G[j][i] -= g; } };
        const inj = (i, x) => { if (i >= 0) G[i][n] += x; };
        for (let i = 0; i < n; i++) G[i][i] += 1e-9;
        if (src) { add(0, -1, 1 / RINT); inj(0, V0 / RINT); }
        for (const e of els) {
          if (e.R == null) { if (e.k.on) { add(e.i, e.j, 1 / RD); inj(e.i, vf(e.k) / RD); inj(e.j, -vf(e.k) / RD); } }
          else add(e.i, e.j, 1 / e.R);
        }
        V = gauss(G, n);
        let changed = false;
        for (const e of els) if (e.R == null) {
          const dv = (e.i >= 0 ? V[e.i] : 0) - (e.j >= 0 ? V[e.j] : 0);
          const on = e.k.on ? dv - vf(e.k) > -1e-9 : dv > vf(e.k);
          if (on !== e.k.on) { e.k.on = on; changed = true; }
        }
        if (!changed) break;
      }
      const v = i => i >= 0 ? V[i] : 0;
      for (const e of els) {
        const dv = v(e.i) - v(e.j);
        e.put(1000 * (e.R == null ? (e.k.on ? (dv - vf(e.k)) / RD : 0) : dv / e.R));
      }
      st.Ibat = src ? 1000 * (V0 - v(0)) / RINT : 0;
      st.V = { bn: 0 };
      names.forEach((nm, i) => st.V[nm] = V[i]);
      // Qué nodos están unidos a la pila por algo que conduce (para no mostrar voltaje en tiras sueltas).
      const adj = new Map(), link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); };
      for (const e of els) if (e.R != null || e.k.on) { link(e.n1, e.n2); link(e.n2, e.n1); }
      const seen = new Set(['bp', 'bn']), q = ['bp', 'bn'];
      while (q.length) for (const m of adj.get(q.pop()) || []) if (!seen.has(m)) { seen.add(m); q.push(m); }
      st.reach = seen;
    }
    function gauss(A, n) {
      for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
        [A[c], A[p]] = [A[p], A[c]];
        const d = A[c][c] || 1e-12;
        for (let r = 0; r < n; r++) if (r !== c && A[r][c]) {
          const f = A[r][c] / d;
          for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
        }
      }
      return Float64Array.from({ length: n }, (_, i) => A[i][n] / (A[i][i] || 1e-12));
    }
    // Lo que entra a la tira por cada pata (mA): la corriente de un componente va de a a b por dentro.
    const legCurrents = k => k.type === 'push'
      ? [[k.a, -(k.I + k.Ia)], [k.b, k.I - k.Ib], [k.a2, k.Ia], [k.b2, k.Ib]]
      : [[k.a, -k.I], [k.b, k.I]];

    // ---------- paneles ----------
    const size = (w, h) => {
      const s = m => Math.min(w / GEO[m].W, h / GEO[m].H);
      const m = s('v') > s('h') * 1.05 ? 'v' : 'h';
      // Si a los lados sobra lugar para el selector del color (unos 250 px) pero no en cada lado, el dibujo se
      // recorre a la izquierda y el selector va a su derecha; si no cabe, en la franja de arriba.
      const k = s(m), free = w - GEO[m].W * k, extra = free >= 290 && free < 470 ? 250 / k + 20 : 0;
      return [GEO[m].W + extra, GEO[m].H, 0, m];
    };
    const panels = { w: Sim.panel(document.getElementById('pw'), size), e: Sim.panel(document.getElementById('pe'), size) };
    panels.w.mirror = panels.e; panels.e.mirror = panels.w;
    const geo = p => GEO[p.mode || 'h'];

    // Switch Agua / Electricidad y Ambos, igual que en las demás simulaciones.
    Sim.viewSwitch();

    // Color de las partículas: el selector con su escala, arriba a la derecha, en la franja de arriba (como en las
    // demás simulaciones).
    Sim.colorPicker(panels, { top: BAND, spot: side => [panels[side].W - 6, 2], ends: side => ({
      v: ['lento', 'rápido'],
      p: side === 'w' ? ['0 psi', V0 + ' psi'] : ['0 V', V0 + ' V'],
      q: ['0', side === 'w' ? IMAX + ' mL/s' : IMAX + ' mA']
    })[Sim.shownColorMode()] });

    // Por fuera · Por dentro (si la página lo trae, #dentro): las tiras de metal (o canales) que unen los agujeros.
    const dentro = document.getElementById('dentro');
    if (dentro) {
      const syncDentro = () => dentro.querySelectorAll('button').forEach(bt => bt.setAttribute('aria-pressed', String(bt.dataset.v === (st.inside ? '1' : '0'))));
      dentro.querySelectorAll('button').forEach(bt => bt.addEventListener('click', () => {
        st.inside = bt.dataset.v === '1'; syncDentro(); try { localStorage.setItem('pb-dentro', st.inside ? '1' : '0'); } catch (e) {}
      }));
      syncDentro();
    }

    // Interruptor de encendido de la bomba y de la pila, uno en cada panel.
    const powers = Object.entries(panels).map(([side, p]) => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'sim-power'; el.innerHTML = Sim.SWITCH;
      p.box.querySelector('.sim-layer').appendChild(el);
      p.at(el, () => geo(p).pt(...geo(p).power));
      el.addEventListener('click', () => { st.on = !st.on; syncPower(); });
      return [side, el];
    });
    const syncPower = () => powers.forEach(([side, el]) => {
      el.setAttribute('aria-pressed', String(st.on));
      el.setAttribute('aria-label', (st.on ? 'Apagar ' : 'Encender ') + (side === 'w' ? 'la bomba' : 'la pila'));
    });
    syncPower();
    Object.values(panels).forEach(p => { p.onLayout = () => p.replace(); p.refit(); });

    // ---------- dibujo ----------
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const mean = pts => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
    // Curva de un cable entre dos puntos: se levanta un poco hacia un lado.
    const curve = (A, B, k = 0.18, n = 12) => {
      const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
      const M = [(A[0] + B[0]) / 2 - dy / L * L * k, (A[1] + B[1]) / 2 + dx / L * L * k];
      return Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return lerp(lerp(A, M, t), lerp(M, B, t), t); });
    };
    const compPath = (k, A, B) => k.type === 'wire' || k.type === 'lead' ? curve(A, B, k.type === 'lead' ? 0.12 : 0.18) : [A, B];
    const rectW = (g, u0, v0, u1, v1) => {
      const [x0, y0] = g.pt(u0, v0), [x1, y1] = g.pt(u1, v1);
      return [Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)];
    };
    const bandColors = R => {
      const BAND = ['#111', '#7a4a1f', '#d6392b', '#ea7a1a', '#f2c418', '#1f9d55', '#2563eb', '#7c3aed', '#8b959c', '#fff'];
      const e = Math.floor(Math.log10(R)) - 1, d = Math.round(R / 10 ** e);
      return [BAND[Math.floor(d / 10)], BAND[d % 10], BAND[e], '#c9a227'];
    };
    const ohm = Sim.ohm;
    const narrowHalf = R => Math.max(1, 4.6 - 1.8 * Math.log10(R / 100));
    // Puntos que avanzan por un recorrido; phase crece con la corriente. Con f = { v(t), I } cada punto toma el
    // color del modo elegido (Sim.colorMode): presión (voltaje) de 0 a 9 V, v(t) a lo largo del recorrido (t de 0
    // a 1), y caudal (corriente) |I| de 0 a 30 mA, lo más que aguanta un LED. En el agua, en modo rapidez, por
    // su rapidez; en la electricidad, en modo normal, del color de siempre.
    let fieldNow = [0, 0];
    Sim.field = () => fieldNow;
    const flowDots = (ctx, pts, phase, col, gap, r, f) => {
      const L = D.len(pts); if (L < 2) return;
      const off = ((phase % gap) + gap) % gap, speed = col === C.water && f ? Math.min(420, Math.abs(f.I) * 4) / 200 : null;
      ctx.fillStyle = col;
      for (let d = off; d < L; d += gap) {
        const [x, y] = D.pointAt(pts, d);
        if (f) { fieldNow = [f.v(d / L) / V0, Math.abs(f.I) / IMAX]; ctx.fillStyle = Sim.particleColor(x, y, speed, col); }
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    };
    // Voltaje de la tira (o del borne) donde está una pata; null si está suelta o la tira no llega a la pila.
    const vOf = l => { const n = legNode(l); return n && st.reach.has(n) ? st.V[n] ?? 0 : null; };
    // En modo presión (voltaje) también se ve el agua quieta: con presión pero sin caudal.
    const still = () => Sim.shownColorMode() === 'p';
    const phaseOf = (key, I, dt) => {
      const ph = (st.phase.get(key) || 0) + Math.sign(I) * Math.min(420, Math.abs(I) * 4) * dt;
      st.phase.set(key, ph); return ph;
    };

    // El cable negro (−) se ve gris claro en el modo oscuro.
    const wireColor = c => c === BLACKW ? C.neg : c;

    function drawBoard(ctx, g, side) {
      const water = side === 'w';
      D.roundRect(ctx, ...rectW(g, ...BOARD), 10, water ? (C.dark ? '#24313b' : '#e4eaee') : (C.dark ? '#2c2e31' : '#f7f5ef'), C.line, 2);
      // canal del centro
      D.roundRect(ctx, ...rectW(g, BOARD[0] + 0.3, 7.08, BOARD[2] - 0.3, 7.42), 4, water ? (C.dark ? '#1b262e' : '#d3dbe1') : (C.dark ? '#222427' : '#e7e3d8'));
      // líneas de los rieles
      for (const [v, col] of [[-0.5, REDW], [1.5, C.neg], [13.0, REDW], [15.0, C.neg]]) D.line(ctx, [g.pt(BOARD[0] + 0.4, v), g.pt(BOARD[2] - 0.4, v)], 2.5, col, 'butt');
      for (const [r, v] of [[0, 0], [1, 1], [12, 13.5], [13, 14.5]]) {
        for (const u of [-0.6, N - 0.4]) D.text(ctx, ROWNAME[r], ...g.pt(u, v), r === 0 || r === 12 ? REDW : C.neg, { size: 18 });
      }
      for (let r = 2; r < 12; r++) for (const u of [-0.6, N - 0.4]) D.text(ctx, ROWNAME[r], ...g.pt(u, ROWV[r]), C.muted, { size: 14, weight: 400 });
      // los números de las columnas; si con la letra mínima no caben todos, como en una protoboard real: 1, 5, 10, 15
      D.font(ctx, 14, Sim.MONO, 500);
      const all = ctx.measureText('16').width + 6 < Math.hypot(...[0, 1].map(i => g.pt(1, 0)[i] - g.pt(0, 0)[i]));
      for (let c = 0; c < N; c++) if (all || !c || (c + 1) % 5 === 0) for (const v of [1.9, 12.6]) D.text(ctx, String(c + 1), ...g.pt(c, v), C.muted, { size: 14, font: Sim.MONO, weight: 500 });
      // por dentro: tiras de metal (o canales de agua) que unen los agujeros
      for (const gr of GROUPS) {
        const sel = st.sel === gr;
        if (!st.inside && !sel) continue;
        const hs = groupHoles(gr), [c0, r0] = hs[0], [c1, r1] = hs[hs.length - 1];
        const R = rectW(g, c0 - 0.36, ROWV[r0] - 0.36, c1 + 0.36, ROWV[r1] + 0.36);
        if (st.inside) D.roundRect(ctx, ...R, 8, water ? C['water-soft'] : C.dark ? '#4a5660' : '#cfd6dc', water ? C.pipe : C.dark ? '#7d8a95' : '#9aa6b0', 2);
        if (sel) D.roundRect(ctx, R[0] - 4, R[1] - 4, R[2] + 8, R[3] + 8, 11, null, VIOLET, 3);
      }
      // agujeros
      for (let c = 0; c < N; c++) for (let r = 0; r < ROWV.length; r++) {
        const [x, y] = g.pt(c, ROWV[r]);
        if (water) D.circle(ctx, x, y, 6, st.inside ? C['water-soft'] : C.dark ? '#0f161c' : '#56646e', C.pipe, 2);
        else D.roundRect(ctx, x - 6, y - 6, 12, 12, 2, C.dark ? '#121619' : '#3d4850');
        if (st.sel === group(c, r)) D.circle(ctx, x, y, 9.5, null, VIOLET, 2.5);
      }
    }

    // Corriente dentro de las tiras y rieles, de un agujero al siguiente: en cada agujero entra o
    // sale la corriente de lo que está conectado ahí y lo que sobra sigue por la tira.
    function drawStripFlow(ctx, g, side, dt) {
      if (!st.inside) return;
      const by = new Map(), sv = still();
      for (const k of st.comps) for (const [l, I] of legCurrents(k)) if (l.c != null && (I || sv)) {
        const gr = group(l.c, l.r);
        (by.get(gr) || by.set(gr, []).get(gr)).push({ pos: gr[0] === 'R' ? l.c : l.r, uv: legUV(l), I });
      }
      // en modo presión, toda la tira (o el riel) que llega a la pila, también lo que está quieto
      if (sv) for (const gr of GROUPS) if (st.reach.has(gr) && !by.has(gr)) by.set(gr, []);
      for (const [gr, list] of by) {
        list.sort((p, q) => p.pos - q.pos);
        const whole = sv && st.reach.has(gr), v = st.V[gr] ?? 0;
        if (whole) {
          const hs = groupHoles(gr), uv = ([c, r]) => [c, ROWV[r]];
          list.unshift({ uv: uv(hs[0]), I: 0 }); list.push({ uv: uv(hs[hs.length - 1]), I: 0 });
        }
        let sum = 0;
        for (let i = 0; i < list.length - 1; i++) {
          sum += list[i].I;
          if (Math.abs(sum) < 0.01 && !whole) continue;
          const pts = [g.pt(...list[i].uv), g.pt(...list[i + 1].uv)];
          const ph = phaseOf(gr + i + side, Math.abs(sum) < 0.01 ? 0 : sum, dt);
          flowDots(ctx, pts, ph, side === 'w' ? C.water : C.charge, side === 'w' ? 16 : 18, 3.2, { v: () => v, I: sum });
        }
      }
    }

    // El pulsador, visto desde arriba: el cuerpo cuadrado con sus cuatro patas (dos por lado) y la tapa redonda al centro.
    // En el agua es la válvula con resorte: dos canales, uno por lado (sus patas siempre unidas), y entre ellos el paso
    // con su compuerta roja, que se abre al apretar la tapa. Puntos de las patas: A, B, A2, B2.
    const PUSH_HALF = 36, CAP = 15;
    function drawPush(ctx, k, pts, side, dt, ghost) {
      const water = side === 'w', [A, B, A2, B2] = pts, M = mean(pts);
      const ex = Math.atan2(B[1] - A[1], B[0] - A[0]);
      const loc = q => { const dx = q[0] - M[0], dy = q[1] - M[1]; return [dx * Math.cos(ex) + dy * Math.sin(ex), -dx * Math.sin(ex) + dy * Math.cos(ex)]; };
      const [ax, ay] = loc(A), [, a2y] = loc(A2), [bx] = loc(B);
      const kp = k.key ? k.key.p : 0, h = PUSH_HALF;
      if (ghost) ctx.globalAlpha = 0.45;
      ctx.save(); ctx.translate(...M); ctx.rotate(ex);
      // las patas: salen de los dos lados del cuerpo, frente a cada agujero
      for (const [x, y] of [[ax, ay], [bx, ay], [ax, a2y], [bx, a2y]]) {
        const s = Math.sign(x) || 1;
        D.line(ctx, [[s * (h - 2), y], [s * (h + 7), y], [x, y]], 4, water ? C.pipe : '#a9b2b9', 'round');
        if (water) D.circle(ctx, x, y, 5, C['water-soft'], C.pipe, 2);
      }
      if (water) {
        D.roundRect(ctx, -h, -h, 2 * h, 2 * h, 8, C.metal, C.ink, 2.5);
        // los dos canales de los lados y el paso de en medio
        for (const x of [ax, bx]) { D.line(ctx, [[x, ay], [x, a2y]], 14, C.pipe, 'butt'); D.line(ctx, [[x, ay], [x, a2y]], 9, C['water-soft'], 'butt'); }
        D.line(ctx, [[ax, 0], [bx, 0]], 14, C.pipe, 'butt'); D.line(ctx, [[ax, 0], [bx, 0]], 9, C['water-soft'], 'butt');
        // la tapa con la compuerta: suelta tapa el paso; apretada, su ventana queda en el paso
        D.circle(ctx, 0, 0, CAP, C.metal, C.ink, 2.5);
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, CAP - 3, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = C.danger; ctx.fillRect(-CAP, -CAP, 2 * CAP, 2 * CAP);
        const win = -12 + 12 * kp;
        ctx.fillStyle = C['water-soft']; ctx.fillRect(-CAP, win - 4.5, 2 * CAP, 9);
        ctx.restore();
      } else {
        D.roundRect(ctx, -h, -h, 2 * h, 2 * h, 6, '#2f3439', C.ink, 2);
        D.roundRect(ctx, -h + 6, -h + 6, 2 * h - 12, 2 * h - 12, 4, '#8d969d');
        for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) D.circle(ctx, x * (h - 11), y * (h - 11), 3, '#2f3439');
        const r = CAP + 3 - 2 * kp;
        D.circle(ctx, 0, 0, r + 2, '#1d2125');
        D.circle(ctx, 0, 0, r, kp > 0.5 ? '#3a4046' : '#4b5259', '#1d2125', 2);
      }
      ctx.restore();
      if (!ghost && k.key && k.key.ringA > 0) {
        const rr = CAP + 7;
        ctx.save(); ctx.globalAlpha *= k.key.ringA; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(...M, rr, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = C.line; ctx.stroke();
        ctx.beginPath(); ctx.arc(...M, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k.key.ring));
        ctx.lineWidth = 3.5; ctx.strokeStyle = C.sel; ctx.stroke();
        ctx.restore();
      }
      // el agua (o las cargas): de a, por su lado, al paso y por el otro lado a b
      const va = vOf(k.a), vb = vOf(k.b);
      if (!ghost && (Math.abs(k.I) > 0.01 || (still() && va != null && vb != null && k.press))) {
        const ma = lerp(A, A2, 0.5), mb = lerp(B, B2, 0.5), path = [A, ma, mb, B];
        flowDots(ctx, path, phaseOf(k.id + side, k.I, dt), water ? C.water : C.charge, water ? 16 : 18, 3.2, { v: t => (va ?? 0) + ((vb ?? 0) - (va ?? 0)) * t, I: k.I });
      }
      ctx.globalAlpha = 1;
    }

    function drawComp(ctx, k, g, side, dt, ghost) {
      if (k.type === 'push') return drawPush(ctx, k, legsOf(k).map(l => g.pt(...legUV(l))), side, dt, ghost);
      const A = g.pt(...legUV(k.a)), B = g.pt(...legUV(k.b));
      const water = side === 'w', path = compPath(k, A, B);
      const ang = Math.atan2(B[1] - A[1], B[0] - A[0]), L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const M = lerp(A, B, 0.5), nx = -Math.sin(ang), ny = Math.cos(ang);
      const hot = Math.abs(k.I) > FUSE * 1000;
      if (ghost) ctx.globalAlpha = 0.45;
      if (k.type === 'wire' || k.type === 'lead') {
        if (water) {
          D.line(ctx, path, 16, C.pipe); D.line(ctx, path, 10, C['water-soft']);
          D.circle(ctx, ...B, 5, wireColor(k.color));
          if (k.type === 'lead') D.circle(ctx, ...A, 5, wireColor(k.color));
        } else {
          D.line(ctx, path, 8, 'rgba(0,0,0,0.35)'); D.line(ctx, path, 5.5, hot ? '#ff5a2a' : wireColor(k.color));
          D.circle(ctx, ...B, 3.5, '#b8c0c6', '#6f7a83', 1.5);
        }
      } else if (k.type === 'res') {
        if (!k.burnt && !ghost) D.heatGlow(ctx, ...M, heatOf(k).glow, 36);
        if (water) {
          ctx.save(); ctx.translate(...M); ctx.rotate(ang);
          const h0 = 6, hn = narrowHalf(k.R), s1 = Math.min(L / 2, 26), s2 = Math.min(L / 2 - 2, 16);
          const shape = (e, col) => {
            ctx.beginPath();
            ctx.moveTo(-L / 2, -h0 - e); ctx.lineTo(-s1, -h0 - e); ctx.lineTo(-s2, -hn - e); ctx.lineTo(s2, -hn - e); ctx.lineTo(s1, -h0 - e); ctx.lineTo(L / 2, -h0 - e);
            ctx.lineTo(L / 2, h0 + e); ctx.lineTo(s1, h0 + e); ctx.lineTo(s2, hn + e); ctx.lineTo(-s2, hn + e); ctx.lineTo(-s1, h0 + e); ctx.lineTo(-L / 2, h0 + e);
            ctx.closePath(); ctx.fillStyle = col; ctx.fill();
          };
          shape(3, C.pipe); shape(0, C['water-soft']);
          // reventado: una grieta arriba y otra abajo
          if (k.burnt) for (const sg of [-1, 1]) D.line(ctx, [[-8, sg * (hn + 3)], [-3, sg * (hn - 1)], [3, sg * (hn + 5)], [8, sg * (hn + 1)]], 2.5, C.danger);
          ctx.restore();
        } else {
          D.line(ctx, [A, B], 2.5, '#8d969d');
          const bl = Math.max(26, Math.min(48, L - 18));
          ctx.save(); ctx.translate(...M); ctx.rotate(ang);
          D.roundRect(ctx, -bl / 2, -7, bl, 14, 7, '#e8cf9e', '#a8895a', 1.5);
          bandColors(k.R).forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(-bl / 2 + 6 + i * (bl - 12) / 3.4 + (i === 3 ? 3 : 0), -7, 3.5, 14); });
          if (k.burnt) {   // quemada: tiznada y partida
            ctx.fillStyle = 'rgba(30, 20, 15, 0.6)'; ctx.beginPath(); ctx.ellipse(0, 0, bl / 2 - 2, 8, 0, 0, Math.PI * 2); ctx.fill();
            D.line(ctx, [[-2, -8], [2, -2], [-2, 2], [2, 8]], 3, C.card);
          }
          ctx.restore();
        }
        const f = ny > 0 ? -1 : 1;   // el valor va del lado de arriba (o a la izquierda si está parada)
        const o = 19 + 20 * Math.abs(nx);   // parada, la etiqueta necesita más espacio a un lado
        const lx = M[0] + f * nx * o, ly = M[1] + f * ny * o;
        if (!ghost && k.burnt) D.pill(ctx, water ? 'reventado' : 'quemada', lx, ly, C.danger, true);   // su estado, en una pastilla
        else if (!ghost) D.text(ctx, ohm(k.R), lx, ly, k === menuK && selOpen() ? C.sel : C.ink, { size: 14, font: Sim.MONO, weight: 600, bg: true });
        if (k.burnt && !water) D.smoke(ctx, M[0], M[1] - 8, k.breakT);
      } else if (k.type === 'led') {
        const glowK = k.burnt ? 0 : Math.min(1, k.I / 20), [cr, cg, cb] = Sim.led(k.led).rgb;
        if (!k.burnt && !ghost) D.heatGlow(ctx, ...M, heatOf(k).glow, 40);
        const tone = (f, w) => `rgb(${[cr, cg, cb].map(c => Math.round((c + (255 - c) * w) * f)).join(', ')})`;   // más claro (w) o más oscuro (f)
        if (water) {
          D.line(ctx, [A, B], 14, C.pipe); D.line(ctx, [A, B], 8, C['water-soft']);
          D.circle(ctx, ...M, 15, C.metal, k.burnt ? C.danger : C.ink, 2);
          D.circle(ctx, ...M, 11, C['water-soft']);
          if (!k.burnt) D.rotor(ctx, ...M, 9, k.ang, k.I * Sim.WHEEL_RPM_PER_MA / 60 * 2 * Math.PI, 4, C.ink);
          else D.rotor(ctx, ...M, 4, 0.5, 0, 4, C.muted);
          D.circle(ctx, ...M, 3.5, `rgb(${cr}, ${cg}, ${cb})`, C.ink, 1.5);   // el color del LED
          // flecha: el único sentido en que la compuerta deja pasar el agua (de la pata + a la −)
          const dv = (st.V[legNode(k.a)] ?? 0) - (st.V[legNode(k.b)] ?? 0);
          const blocked = !k.burnt && dv < -0.5;
          const ax = M[0] - nx * 25, ay = M[1] - ny * 25;
          D.line(ctx, [[ax - Math.cos(ang) * 7, ay - Math.sin(ang) * 7], [ax + Math.cos(ang) * 3, ay + Math.sin(ang) * 3]], 2.5, blocked ? C.danger : C.muted);
          D.arrow(ctx, ax + Math.cos(ang) * 4, ay + Math.sin(ang) * 4, ang, 6, blocked ? C.danger : C.muted);
        } else {
          // pata + (ánodo) con un doblez, como la pata larga de un LED de verdad
          const K = lerp(A, M, 0.5);
          D.line(ctx, [A, [K[0] + nx * 4, K[1] + ny * 4], M], 2.5, '#8d969d');
          D.line(ctx, [M, B], 2.5, '#8d969d');
          if (glowK > 0) {
            const gr = ctx.createRadialGradient(...M, 4, ...M, 46);
            gr.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.8 * glowK})`); gr.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(...M, 46, 0, Math.PI * 2); ctx.fill();
          }
          D.circle(ctx, ...M, 13, k.burnt ? '#5b5f63' : glowK > 0 ? tone(1, 0.4 - 0.4 * glowK) : tone(1, 0.55), k.burnt ? '#2b2f33' : tone(0.62, 0), 2);
          // lado plano del lado − (cátodo)
          ctx.save(); ctx.translate(...M); ctx.rotate(ang);
          D.line(ctx, [[11, -7], [11, 7]], 3, k.burnt ? '#2b2f33' : tone(0.62, 0), 'butt');
          ctx.restore();
          D.circle(ctx, M[0] - 4, M[1] - 4, 3.5, 'rgba(255,255,255,0.7)');
          D.text(ctx, '+', A[0] - nx * 13, A[1] - ny * 13, REDW, { size: 14 });
          if (k.burnt) { D.line(ctx, [[M[0] - 9, M[1] - 9], [M[0] + 9, M[1] + 9]], 3.5, C.danger); D.line(ctx, [[M[0] + 9, M[1] - 9], [M[0] - 9, M[1] + 9]], 3.5, C.danger); }
        }
        if (k.burnt) {
          const t = k.breakT;
          if (t < 1.4) for (let j = 0; j < 3; j++) {
            const u = Math.max(0, t - j * 0.15);
            D.circle(ctx, M[0] + (j - 1) * 7, M[1] - 12 - 45 * u, 5 + 16 * u, `rgba(120,120,120,${0.45 * Math.max(0, 1 - u / 1.4)})`);
          }
        }
      }
      const va = vOf(k.a), vb = vOf(k.b), quiet = still() && va != null && vb != null;
      if (!ghost && (Math.abs(k.I) > 0.01 || quiet)) {
        const ph = phaseOf(k.id + side, k.I, dt);
        flowDots(ctx, path, ph, water ? C.water : C.charge, water ? 16 : 18, 3.2, { v: t => (va ?? 0) + ((vb ?? 0) - (va ?? 0)) * t, I: k.I });
      }
      ctx.globalAlpha = 1;
    }

    function drawBattery(ctx, g, side) {
      const water = side === 'w';
      const B = g.bat, [cx, cy] = g.pt((B[0] + B[2]) / 2, (B[1] + B[3]) / 2), tp = g.pt(...TERM['+']), tn = g.pt(...TERM['-']);
      const sel = selOpen() && menuK === BATK;
      D.chassis(ctx, ...rectW(g, ...CH), water, water ? 'BOMBA' : 'PILA', sel);
      if (water) {
        D.line(ctx, [[cx, cy], tp], 16, C.pipe); D.line(ctx, [[cx, cy], tp], 10, C['water-soft']);
        D.line(ctx, [[cx, cy], tn], 16, C.pipe); D.line(ctx, [[cx, cy], tn], 10, C['water-soft']);
        D.pump(ctx, cx, cy, st.pump, st.on && st.fuse ? Math.min(40, st.Ibat * 0.6) : 0);
        D.circle(ctx, ...tp, 7, REDW); D.circle(ctx, ...tn, 7, C.neg);
      } else {
        const R = rectW(g, ...B);
        D.roundRect(ctx, ...R, 8, '#2b3640', C.ink, 2);
        // la franja de color de la pila; con el fusible fundido se pone gris y lo dice
        D.roundRect(ctx, R[0] + 6, R[1] + 6, R[2] - 12, R[3] * 0.32, 4, st.fuse ? '#c77d00' : '#5b6670');
        if (!st.fuse) D.text(ctx, 'fusible fundido', R[0] + R[2] / 2, R[1] + 6 + R[3] * 0.16, '#ffb3a8', { size: 14 });
        D.text(ctx, '9 V', cx, cy + 6, '#fff', { size: 22 });
        D.circle(ctx, ...tp, 7, '#d8dde1', C.ink, 2); D.circle(ctx, ...tn, 7, '#d8dde1', C.ink, 2);
        const [lx, ly] = g.pt(TERM['+'][0] - 0.3, TERM['+'][1] - 0.55), [mx, my] = g.pt(TERM['-'][0] - 0.3, TERM['-'][1] - 0.55);
        D.text(ctx, '+', lx, ly, REDW, { size: 20 }); D.text(ctx, '−', mx, my, C.neg, { size: 20 });
      }
      if (st.fuseHeat > 0 && st.fuse) {
        const gr = ctx.createRadialGradient(cx, cy, 5, cx, cy, 70);
        gr.addColorStop(0, `rgba(255, 80, 40, ${0.6 * st.fuseHeat})`); gr.addColorStop(1, 'rgba(255,80,40,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Aviso de la válvula de seguridad: se dibuja al final para que las mangueras no lo tapen.
    function drawValveNote(ctx, g) {
      if (st.fuse) return;
      // en vertical no cabe arriba de la bomba: va entre la bomba y la protoboard
      const [x, y] = g === GEO.h ? [g.pt(-3.9, 3)[0], g.pt(-3.9, 3)[1] - 62] : g.pt(-1.75, 3);
      D.tag(ctx, x, y, ['válvula de seguridad', 'válvula'], '', { danger: true, state: 'cerrada', max: 190 });
    }

    // ---------- la bandeja ----------
    // Una pieza de la bandeja, centrada en (−3,9, vy) y acostada (el pulsador, con sus patas de arriba en vy − 0,75).
    function trayComp(type, vy, extra = {}) {
      if (type === 'push') {
        const u0 = -4.9, a = vy - 0.75, b = vy + 0.75;
        return makePush({ u: u0, v: a }, { u: u0 + 2, v: a }, { u: u0, v: b }, { u: u0 + 2, v: b }, { id: 0, ...extra });
      }
      const span = type === 'led' ? 1 : 2.4, u0 = -3.9 - span / 2;
      return make(type, { u: u0, v: vy }, { u: u0 + span, v: vy }, { id: 0, color: COLORS[st.colorK % COLORS.length], ...extra });
    }
    // Lo que hay en la bandeja ahora: en el modo libre, una de cada cosa; en el guiado, la pieza del paso si aún falta.
    function trayList(mode) {
      if (guide) {
        const s = guide[st.step];
        if (!s || fits(st.step)) return [];
        const { type, a, b, ...extra } = s.piece;
        return [trayComp(type, TRAYMID, extra)];
      }
      return TRAYITEMS[mode].filter(([t]) => trayTypes.includes(t)).map(([t, vy]) => trayComp(t, vy));
    }
    function drawTray(ctx, g, side, dt) {
      D.roundRect(ctx, ...rectW(g, ...TRAY), 10, C.bg || '#eaf0f3', C.line, 1.5);
      for (const k of trayList(g === GEO.v ? 'v' : 'h')) drawComp(ctx, k, g, side, dt, false);
    }

    // ---------- el armado guiado ----------
    // La pieza de un paso, en sus agujeros.
    const target = j => {
      const { type, a, b, ...extra } = guide[j].piece;
      if (type === 'push') return makePush(...pushHoles(...a), { id: -1, ...extra });
      return make(type, hole(...a), hole(...b), { id: -1, ...extra });
    };
    // Si una pieza está donde la pide el paso: sus patas en las mismas tiras (cualquier agujero de la tira es el mismo
    // nodo). El LED, además, con su pata + donde va la +.
    const same = (k, t) => {
      if (k.type !== t.type || k.burnt) return false;
      if (legsOf(k).some(l => l.c == null)) return false;
      if (t.type === 'led') return legNode(k.a) === legNode(t.a) && legNode(k.b) === legNode(t.b);
      const ns = x => legsOf(x).map(legNode).sort().join();
      return ns(k) === ns(t);
    };
    const fits = j => { const t = target(j); return st.comps.some(k => same(k, t)); };
    // Poner la pieza de un paso en su lugar (quita lo que ocupe sus agujeros).
    const putTarget = j => {
      const t = target(j), hs = new Set(legsOf(t).map(l => l.c + ',' + l.r));
      st.comps = st.comps.filter(k => k.type === 'lead' || !legsOf(k).some(l => l.c != null && hs.has(l.c + ',' + l.r)));
      t.id = st.nextId++;
      st.comps.push(t);
      return t;
    };
    // Lugar punteado de la pieza del paso: su contorno y sus agujeros (en el LED, con su +).
    function drawSpot(ctx, g, side) {
      if (!guide || !guide[st.step] || fits(st.step)) return;
      const t = target(st.step), pts = legsOf(t).map(l => g.pt(...legUV(l)));
      const [A, B] = pts, M = mean(pts), ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
      ctx.save(); ctx.setLineDash([7, 6]);
      const col = C.muted;
      if (t.type === 'wire') D.line(ctx, compPath(t, A, B), 3, col);
      else if (t.type === 'push') D.roundRect(ctx, M[0] - PUSH_HALF, M[1] - PUSH_HALF, 2 * PUSH_HALF, 2 * PUSH_HALF, 8, null, col, 2);
      else {
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]), hw = t.type === 'led' ? 16 : side === 'w' ? Math.min(L / 2, 26) : 24, hh = t.type === 'led' ? 16 : 11;
        ctx.save(); ctx.translate(...M); ctx.rotate(ang);
        D.roundRect(ctx, -hw, -hh, 2 * hw, 2 * hh, hh, null, col, 2);
        ctx.restore();
      }
      for (const q of pts) D.circle(ctx, ...q, 10, null, col, 2);
      ctx.restore();
      if (t.type === 'led') {
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        D.text(ctx, '+', A[0] - nx * 18, A[1] - ny * 18, REDW, { size: 16 });
      }
    }

    // Voltaje (o presión) de la tira o riel elegido, junto al agujero que se tocó.
    function drawSelLabel(ctx, g, side) {
      if (!st.sel) return;
      const [x, y] = g.pt(...st.selAt);
      const has = st.reach.has(st.sel), v = st.V[st.sel] ?? 0;
      const t = !has ? 'sin conexión' : side === 'w' ? fmt(v) + ' psi' : fmt(v) + ' V';
      const px = D.font(ctx, 15, Sim.MONO, 500), w = ctx.measureText(t).width + 18, h = Math.round(px * 1.7);
      const ly = y - 30 < 14 ? y + 30 : y - 30;
      D.roundRect(ctx, x - w / 2, ly - h / 2, w, h, h / 2, C.card, VIOLET, 2);
      D.text(ctx, t, x, ly, has ? VIOLET : C.muted, { size: 15, font: Sim.MONO, weight: 500 });
    }

    const placed = k => legsOf(k).every(l => l.c != null);
    function render(side, dt) {
      const p = panels[side];
      if (!p.box.clientWidth) return;
      const g = geo(p), ctx = p.begin();
      drawBoard(ctx, g, side);
      drawStripFlow(ctx, g, side, dt);
      drawTray(ctx, g, side, dt);
      drawBattery(ctx, g, side);
      drawSpot(ctx, g, side);
      const dr = st.drag;
      for (const k of st.comps) {
        const out = dr && dr.k === k && dr.moved && dr.kind === 'body' && !inBoard(...mean(legsOf(k).map(legUV)));
        drawComp(ctx, k, g, side, dt, out);
      }
      // a dónde caería cada pata que se está arrastrando
      if (dr && dr.moved) for (const h of dropHoles(dr)) D.circle(ctx, ...g.pt(h.c, ROWV[h.r]), 10, null, OKC, 3);
      if (side === 'w') drawValveNote(ctx, g);
      drawSelLabel(ctx, g, side);
      // lo que tiene su tarjeta abierta: contorno azul a lo largo de él (o alrededor de la pila)
      const sa = Sim.fadeSel('pb', selOpen());
      if (sa && menuK) {
        if (menuK === BATK) { const R = rectW(g, ...CH); D.select(ctx, R[0] - 7, R[1] - 7, R[2] + 14, R[3] + 14, sa, 16); }
        else if (menuK.type === 'push') { const M = g.pt(...centerUV(menuK)), h = PUSH_HALF + 16; D.select(ctx, M[0] - h, M[1] - h, 2 * h, 2 * h, sa, 14); }
        else {
          const A = g.pt(...legUV(menuK.a)), B = g.pt(...legUV(menuK.b)), M = lerp(A, B, 0.5);
          const hh = menuK.type === 'led' ? 21 : menuK.type === 'res' ? 15 : 12;
          D.selectRot(ctx, M[0], M[1], Math.atan2(B[1] - A[1], B[0] - A[0]), Math.hypot(B[0] - A[0], B[1] - A[1]) / 2 + 12, hh, sa, 10);
        }
      }
      p.replace();   // la tapa del pulsador sigue a su pulsador
    }

    // ---------- tarjeta de cada cosa ----------
    // Tocar una resistencia, un LED, un pulsador o un cable abre su tarjeta (Sim.menu) junto a él: su valor o su color,
    // girarlo, ponerlo nuevo y quitarlo; tocar la pila (la bomba) abre la suya: su fusible. Un marcador en cada
    // panel (sin dibujo) sirve para colocar la tarjeta; la cosa elegida (menuK) queda con su contorno azul.
    // En Componentes hay un renglón por cada una, que abre la misma tarjeta.
    const anchors = {};
    let menuK = null;
    const BATK = { type: 'bat' };
    const centerUV = k => k === BATK ? [(CH[0] + CH[2]) / 2, (CH[1] + CH[3]) / 2] : mean(legsOf(k).map(legUV));
    Object.entries(panels).forEach(([side, p]) => {
      const el = document.createElement('div');
      el.className = 'pb-anchor';
      p.box.querySelector('.sim-layer').appendChild(el);
      p.at(el, () => menuK ? geo(p).pt(...centerUV(menuK)) : [-999, -999]);
      anchors[side] = el;
    });
    const selOpen = () => !!menuK && (Sim.menu.isOpen(anchors.w) || Sim.menu.isOpen(anchors.e));
    const shownSide = () => Sim.view === 'w' ? 'w' : 'e';
    const WIRES = [['#1f9d55', 'Verde'], ['#e0a400', 'Amarillo'], ['#2563eb', 'Azul'], ['#ea7a1a', 'Naranja'], [REDW, 'Rojo'], [BLACKW, 'Negro']];
    const nameOf = k => {
      if (k === BATK) return 'Pila 9 V';
      const n = st.comps.filter(c => c.type === k.type).indexOf(k) + 1;
      return n ? String(n) : '';
    };
    const menuFor = (side, k) => {
      const water = side === 'w';
      const remove = { text: 'Quitar de la protoboard', danger: true, onClick: () => { st.comps = st.comps.filter(c => c !== k); Sim.menu.close(anchors.w); Sim.menu.close(anchors.e); } };
      if (k === BATK) return { title: water ? 'Bomba' : 'Pila 9 V', rows: [
        { actions: [{ text: water ? 'Abrir la válvula de seguridad' : 'Poner un fusible nuevo', primary: true, hidden: () => st.fuse, onClick: () => { st.fuse = true; st.fuseHeat = 0; } }] },
        { heat: () => ({ label: water ? 'Caudal' : 'Corriente', rated: water ? '1000 mL/s' : '1 A', now: water ? Math.round(st.Ibat) + ' mL/s' : (st.Ibat >= 1000 ? fmt(st.Ibat / 1000, 2) + ' A' : Math.round(st.Ibat) + ' mA'),
          over: st.Ibat > FUSE * 1000, f: st.fuse ? Math.min(1, st.fuseHeat) : 1, burnt: !st.fuse, name: water ? 'Válvula de seguridad' : 'Fusible',
          val: st.fuse ? (water ? 'abierta' : 'bien') : (water ? 'cerrada' : 'fundido'), end: water ? 'cierra' : 'se funde' }) }] };
      if (k.type === 'wire') return { title: (water ? 'Manguera ' : 'Cable ') + nameOf(k), rows: [
        { label: 'Color', get: () => k.color, set: c => { k.color = c; }, options: WIRES.map(([c, t]) => ({ value: c, text: t, color: c })) },
        { actions: [remove] }] };
      // el pulsador de la protoboard es normalmente abierto (como los de 6 mm del taller); se aprieta en su tapa
      if (k.type === 'push') return { title: (water ? 'Válvula con resorte ' : 'Pulsador ') + nameOf(k), rows: [{ actions: [remove] }] };
      const m = k.type === 'res'
        ? Sim.resistorMenu({ values: RVALUES, get: () => k.R, set: R => { k.R = R; }, format: ohm, heat: heatOf(k), broken: () => k.burnt, actions: [
          { text: water ? 'Poner un tubo nuevo' : 'Poner una resistencia nueva', hidden: () => !k.burnt, onClick: () => { k.burnt = false; heatOf(k).reset(); } },
          remove] })(side)
        : Sim.ledMenu({ get: () => k.led, set: id => { k.led = id; }, heat: heatOf(k), broken: () => k.burnt, actions: [
          { text: water ? 'Girar la rueda' : 'Girar el LED', onClick: () => { const t = k.a; k.a = k.b; k.b = t; } },
          { text: water ? 'Poner una rueda nueva' : 'Poner un LED nuevo', hidden: () => !k.burnt, onClick: () => { k.burnt = false; heatOf(k).reset(); } },
          remove] })(side);
      m.title = m.title + ' ' + nameOf(k);
      return m;
    };
    const openMenu = (side, k) => {
      menuK = k; panels.w.replace(); panels.e.replace();
      const m = menuFor(side, k);
      // tocar la protoboard no la cierra aquí: lo decide el toque (otra cosa abre su tarjeta)
      m.ignore = t => t === panels.w.canvas || t === panels.e.canvas;
      Sim.menu.open(anchors[side], m);
    };
    const toggleMenu = (side, k) => { if (menuK === k && selOpen()) { Sim.menu.close(anchors.w); Sim.menu.close(anchors.e); } else openMenu(side, k); };
    // Renglones de Componentes: la pila y cada resistencia, LED, pulsador y cable que está en la protoboard.
    const rows = new Map();
    const syncRows = () => {
      if (!Sim.side) return;
      const want = [BATK, ...st.comps.filter(k => k.type !== 'lead')];
      for (const [k, r] of rows) if (!want.includes(k)) { r.remove(); rows.delete(k); }
      for (const k of want) if (!rows.has(k)) rows.set(k, Sim.side.part({
        anchor: () => anchors[shownSide()], menu: () => menuFor(shownSide(), k),
        isOpen: () => menuK === k && selOpen(), toggle: () => toggleMenu(shownSide(), k),
        visible: () => true   // su marcador solo se pone junto a lo que tiene la tarjeta abierta
      }));
    };
    setInterval(syncRows, 250); syncRows();

    // ---------- la tapa del pulsador ----------
    // Es un mando (Sim.pushKey): un toque lo aprieta un momento y dejarlo apretado lo enclava hasta tocarlo otra vez.
    // Una zona para tocar en cada panel, sobre la tapa de cada pulsador que está en la protoboard.
    const keyOf = k => {
      if (k.key) return k.key;
      k.key = Sim.pushKey(v => { k.press = v; });
      Object.entries(panels).forEach(([side, p]) => {
        const el = document.createElement('div');
        el.className = 'sim-hit'; el.tabIndex = 0; el.setAttribute('role', 'button');
        el.setAttribute('aria-label', (side === 'w' ? 'Tapa de la válvula' : 'Pulsador') +
          ' (un toque lo aprieta un momento; dejarlo apretado lo deja así hasta tocarlo otra vez)');
        Object.assign(el.style, { touchAction: 'none', userSelect: 'none' });
        p.box.querySelector('.sim-layer').appendChild(el);
        p.at(el, () => {
          if (!st.comps.includes(k) || !placed(k) || (st.drag && st.drag.k === k)) return null;
          el.style.width = Math.max(40, 2 * (CAP + 4) * p.scale) + 'px';
          return geo(p).pt(...centerUV(k));
        });
        k.key.bind(el);
      });
      return k.key;
    };

    // ---------- tocar y arrastrar ----------
    const distSeg = (p, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], s = dx * dx + dy * dy;
      const t = s ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / s)) : 0;
      return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
    };
    const copyLeg = l => ({ ...l });
    const setLeg = (l, h) => { Object.keys(l).forEach(x => delete l[x]); Object.assign(l, h); };
    // Si un punto (u, v) toca el cuerpo de un componente.
    const onBody = (k, q) => {
      if (k.type === 'push') { const [cu, cv] = centerUV(k), h = PUSH_HALF / P + 0.1; return Math.abs(q[0] - cu) < h && Math.abs(q[1] - cv) < h; }
      const a = legUV(k.a), b = legUV(k.b), m = lerp(a, b, 0.5);
      return distSeg(q, a, b) < 0.35 || Math.hypot(q[0] - m[0], q[1] - m[1]) < 0.5;
    };
    // Los agujeros donde caería lo que se arrastra (null si no cabe). El pulsador cae con su pata a en el agujero más
    // cercano y las demás en su lugar.
    const holesFor = (k, occ) => {
      if (k.type === 'push') {
        const h = nearestHole(...legUV(k.a), occ);
        if (!h || !okPush(h.c, h.r)) return null;
        const hs = pushHoles(h.c, h.r);
        return hs.every(x => !occ.has(x.c + ',' + x.r)) ? hs : null;
      }
      const o2 = new Set(occ), ha = nearestHole(...legUV(k.a), o2);
      if (ha) o2.add(ha.c + ',' + ha.r);
      const hb = nearestHole(...legUV(k.b), o2);
      return ha && hb ? [ha, hb] : null;
    };
    const dropHoles = d => {
      if (d.kind === 'leg') { const h = nearestHole(...legUV(d.leg), occupied(null)); return h ? [h] : []; }
      if (d.kind !== 'body') return [];
      return holesFor(d.k, occupied(d.k)) || [];
    };
    // Tocar algo de la bandeja lo pone: en el armado guiado, en su lugar; si no, en el primer lugar libre.
    const autoPlace = k => {
      const occ = occupied(k);
      if (guide && k.type === guide[st.step].piece.type) {
        const t = target(st.step), hs = legsOf(t);
        if (hs.every(l => !occ.has(l.c + ',' + l.r))) { legsOf(k).forEach((l, i) => setLeg(l, { c: hs[i].c, r: hs[i].r })); return true; }
      }
      if (k.type === 'push') {
        for (let c = 1; c + 2 < N; c++) {
          const hs = pushHoles(c, 6);
          if (hs.every(x => !occ.has(x.c + ',' + x.r))) { legsOf(k).forEach((l, i) => setLeg(l, hs[i])); return true; }
        }
        return false;
      }
      const span = k.type === 'led' ? 1 : k.type === 'res' ? 4 : 3;
      for (const r of [3, 9, 4, 10, 5, 11, 2, 8])
        for (let c = 1; c + span < N; c++) if (!occ.has(c + ',' + r) && !occ.has(c + span + ',' + r)) { setLeg(k.a, hole(c, r)); setLeg(k.b, hole(c + span, r)); return true; }
      return false;
    };
    Object.entries(panels).forEach(([side, p]) => {
      const cv = p.canvas;
      const toUV = e => {
        const r = cv.getBoundingClientRect();
        return geo(p).uv((e.clientX - r.left - p.ox) / p.scale, (e.clientY - r.top - p.oy) / p.scale);
      };
      cv.addEventListener('pointerdown', e => {
        if (st.drag) return;
        const q = toUV(e), hit = Math.max(0.42, 18 / (p.scale * P));
        const d = { start: q, last: q, moved: false, id: e.pointerId, sx: e.clientX, sy: e.clientY, menu: Sim.menu.isOpen(anchors[side]) ? menuK : null };
        Sim.menu.close();
        // 1) una pata (menos en el foquito de un LED: tocarlo abre su menú; el pulsador se mueve entero)
        let best = null, bd = hit;
        const onLed = st.comps.find(k => k.type === 'led' && Math.hypot(...lerp(legUV(k.a), legUV(k.b), 0.5).map((x, i) => x - q[i])) < 0.4);
        if (onLed) bd = 0;
        for (const k of st.comps) if (k.type !== 'push') for (const leg of k.type === 'lead' ? ['b'] : ['a', 'b']) {
          const dd = Math.hypot(...legUV(k[leg]).map((x, i) => x - q[i]));
          if (dd < bd) { bd = dd; best = { k, leg }; }
        }
        if (best) Object.assign(d, { kind: 'leg', k: best.k, leg: best.k[best.leg], orig: copyLeg(best.k[best.leg]) });
        const grab = k => Object.assign(d, { kind: 'body', k, orig: legsOf(k).map(copyLeg), o: legsOf(k).map(legUV) });
        // 2) el cuerpo de un componente
        if (onLed) grab(onLed);
        if (!d.kind) for (const k of [...st.comps].reverse()) if (k.type !== 'lead' && onBody(k, q)) { grab(k); break; }
        // 3) la bandeja: sale un componente nuevo
        if (!d.kind && q[0] > TRAY[0] && q[0] < TRAY[2]) for (const k of trayList(p.mode === 'v' ? 'v' : 'h')) {
          if (onBody(k, q) || (k.type !== 'push' && Math.abs(q[1] - legUV(k.a)[1]) < 0.7)) {
            k.id = st.nextId++; st.colorK++;
            st.comps.push(k);
            grab(k); d.isNew = true; break;
          }
        }
        if (!d.kind && q[0] > CH[0] && q[0] < CH[2] && q[1] > CH[1] && q[1] < CH[3]) d.kind = 'battery';
        if (!d.kind) d.kind = 'tap';
        st.drag = d;
        cv.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      cv.addEventListener('pointermove', e => {
        const d = st.drag;
        if (!d || d.id !== e.pointerId) return;
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.moved = true;
        if (!d.moved) return;
        const q = toUV(e);
        if (d.kind === 'leg') setLeg(d.leg, { u: q[0], v: q[1] });
        else if (d.kind === 'body') {
          const du = q[0] - d.start[0], dv = q[1] - d.start[1];
          legsOf(d.k).forEach((l, i) => setLeg(l, { u: d.o[i][0] + du, v: d.o[i][1] + dv }));
        }
      });
      const up = e => {
        const d = st.drag;
        if (!d || d.id !== e.pointerId) return;
        st.drag = null;
        if (d.moved || d.isNew) st.touched = true;
        const q = toUV(e);
        const restore = () => { if (d.kind === 'leg') setLeg(d.leg, d.orig); else legsOf(d.k).forEach((l, i) => setLeg(l, d.orig[i])); };
        const remove = () => { st.comps = st.comps.filter(k => k !== d.k); };
        if (!d.moved || e.type === 'pointercancel') {
          if (d.kind === 'body' && d.isNew) { if (!autoPlace(d.k)) remove(); }
          else if (d.kind === 'body') {
            if (d.k === d.menu) Sim.menu.close(anchors[side]);   // tocarlo otra vez lo cierra
            else openMenu(side, d.k);
          } else if (d.kind === 'battery') { if (d.menu !== BATK) openMenu(side, BATK); }
          else {
            const at = d.kind === 'leg' ? d.leg : nearestHole(...q, new Set(), 0.5);
            if (at && at.c != null) {
              const gr = group(at.c, at.r);
              if (st.sel === gr && d.kind !== 'leg') st.sel = null; else { st.sel = gr; st.selAt = [at.c, ROWV[at.r]]; }
            } else st.sel = null;
          }
          return;
        }
        if (d.kind === 'leg') {
          const h = nearestHole(...q, occupied(null));
          if (h) setLeg(d.leg, h); else restore();
        } else if (d.kind === 'body') {
          const k = d.k;
          if (!inBoard(...mean(legsOf(k).map(legUV)))) { remove(); return; }
          const hs = holesFor(k, occupied(k));
          if (hs) legsOf(k).forEach((l, i) => setLeg(l, hs[i]));
          else if (d.isNew) remove(); else restore();
        }
      };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') st.sel = null; });

    // ---------- animación ----------
    Sim.run(dt => {
      solve();
      // Fusible: arriba de 1 A se calienta y se funde en unos 0,3 s (cortocircuito).
      if (st.fuse && st.Ibat > FUSE * 1000) { st.fuseHeat += dt / 0.3; if (st.fuseHeat >= 1) { st.fuse = false; st.fuseHeat = 0; } }
      else st.fuseHeat = Math.max(0, st.fuseHeat - dt);
      // El LED se calienta con Vf · I (arriba de 30 mA se pasa) y la resistencia con I²·R (arriba de ¼ W):
      // si se pasan se queman, más rápido entre más se pasan (como en Interruptor y LED), y se abren.
      for (const k of st.comps) {
        if (k.type === 'push') { keyOf(k).step(dt); continue; }
        if (k.type !== 'led' && k.type !== 'res') continue;
        const I = Math.abs(k.I) / 1000, Pw = k.burnt ? 0 : k.type === 'led' ? Sim.led(k.led).vf * I : I * I * k.R;
        if (heatOf(k).step(Pw, dt) && !k.burnt) { k.burnt = true; k.breakT = 0; }
        k.breakT += dt;
        if (k.type === 'led') k.ang -= k.I * Sim.WHEEL_RPM_PER_MA / 60 * 2 * Math.PI * dt;
      }
      st.pump += (st.on && st.fuse ? Math.min(40, st.Ibat * 0.6) : 0) * dt;
      render('w', dt); render('e', dt);
    });

    // ---------- lo que usa la página ----------
    const pb = {
      st, make, hole, defaultLeads,
      // Poner estas piezas (con las puntas de la pila) y dejar la pila como nueva.
      load(list) { st.comps = [...defaultLeads(), ...list]; st.sel = null; st.fuse = true; st.fuseHeat = 0; st.touched = false; },
      clear() { pb.load([]); st.touched = true; },
      live: t => st.comps.filter(k => k.type === t && !k.burnt && Math.abs(k.I) > 0.05),
      fits
    };
    // Armado guiado: un paso por pieza. Ir a un paso pone las piezas de los anteriores que falten y quita las de ese
    // paso en adelante (así cada paso se vuelve a hacer); el paso se cumple cuando su pieza está en su lugar.
    if (guide) {
      pb.load([]);
      Sim.steps(guide.map(s => s.name), k => {
        st.step = k;
        guide.forEach((s, j) => { if (j >= k) { const t = target(j); st.comps = st.comps.filter(c => !same(c, t)); } });
        for (let j = 0; j < k; j++) if (!fits(j)) putTarget(j);
        if (menuK && menuK !== BATK && !st.comps.includes(menuK)) { Sim.menu.close(anchors.w); Sim.menu.close(anchors.e); }
      }, fits);
    }
    Sim.pbNow = pb;
    return pb;
  };
})();
