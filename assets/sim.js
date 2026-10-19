// Herramientas comunes para todas las simulaciones del taller:
// paneles que llenan la pantalla, dibujo de tuberías y cables, perillas e inercia.
(() => {
  const Sim = {};
  const C = {};
  Sim.C = C;
  Sim.FONT = '"Atkinson Hyperlegible", "Segoe UI", sans-serif';
  Sim.MONO = '"JetBrains Mono", ui-monospace, monospace';
  Sim.PIPE = 13; // medio ancho interior de una tubería normal

  Sim.readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    ['card', 'ink', 'muted', 'line', 'pipe', 'water-soft', 'water', 'charge', 'charge-soft', 'danger', 'ok', 'metal']
      .forEach(k => C[k] = cs.getPropertyValue('--' + k).trim());
  };

  Sim.fmt = (x, d = 1) => x.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });

  // ---------- panel: un canvas con tamaño lógico W×H que se escala para llenar su caja ----------
  // size puede ser [W, H] fijo o una función (ancho, alto de la caja) → [W, H], para que el dibujo
  // aproveche la forma de la pantalla; cuando cambia se llama p.onLayout().
  // Los controles HTML dentro de .sim-layer se colocan con p.at(el, () => [x, y]) en coordenadas del dibujo.
  Sim.panel = (box, size) => {
    const canvas = box.querySelector('canvas');
    const p = { box, canvas, W: 0, H: 0, scale: 1, ox: 0, oy: 0, dpr: 1, items: [], onLayout: null };
    const place = it => {
      const [x, y] = it.pos();
      it.el.style.left = (p.ox + x * p.scale) + 'px';
      it.el.style.top = (p.oy + y * p.scale) + 'px';
    };
    const fit = () => {
      let w = box.clientWidth, h = box.clientHeight;
      // un panel oculto se acomoda igual que el otro, para que los dos compartan el mismo dibujo
      if ((!w || !h) && p.mirror) { w = p.mirror.box.clientWidth; h = p.mirror.box.clientHeight; }
      if (!w || !h) return;
      // [W, H, x0, modo]: x0 es la x del dibujo que queda en el borde izquierdo
      const [W, H, x0 = 0, mode = ''] = typeof size === 'function' ? size(w, h) : size;
      const changed = W !== p.W || H !== p.H || x0 !== p.x0 || mode !== p.mode;
      p.W = W; p.H = H; p.x0 = x0; p.mode = mode;
      p.scale = Math.min(w / W, h / H);
      p.ox = (w - W * p.scale) / 2 - x0 * p.scale;
      p.oy = (h - H * p.scale) / 2;
      p.dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * p.dpr);
      canvas.height = Math.round(h * p.dpr);
      box.style.setProperty('--s', p.scale);
      if (changed && p.onLayout) p.onLayout(W, H, mode);
      p.items.forEach(place);
      if (p.mirror && !p.mirror.box.clientWidth) p.mirror.refit();
    };
    p.at = (el, pos) => { const it = { el, pos }; p.items.push(it); place(it); return el; };
    p.refit = fit;
    p.replace = () => p.items.forEach(place);   // volver a acomodar controles que cambian de lugar
    p.begin = () => {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = C.card; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const k = p.dpr * p.scale;
      ctx.setTransform(k, 0, 0, k, p.dpr * p.ox, p.dpr * p.oy);
      return ctx;
    };
    new ResizeObserver(fit).observe(box);
    fit();
    return p;
  };
  // Tamaño lógico con ancho fijo W y alto que sigue la forma de la caja, entre hMin y hMax.
  Sim.fitHeight = (W, hMin, hMax) => (w, h) => [W, Math.round(Math.max(hMin, Math.min(hMax, W * h / w)))];

  // ---------- dibujo ----------
  const D = {};
  Sim.draw = D;
  D.rect = (x0, y0, x1, y1) => [[x0, y1], [x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  D.len = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  D.pointAt = (pts, d) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], s = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= s) { const t = d / s; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
      d -= s;
    }
    return pts[pts.length - 1];
  };
  // Punto y dirección (tx, ty) a la distancia d del recorrido.
  D.frameAt = (pts, d) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], s = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= s || i === pts.length - 1) { const tx = (b[0] - a[0]) / s, ty = (b[1] - a[1]) / s; return [a[0] + tx * d, a[1] + ty * d, tx, ty]; }
      d -= s;
    }
  };
  D.line = (ctx, pts, w, col, cap = 'round') => {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = cap; ctx.stroke();
  };
  D.circle = (ctx, x, y, r, fill, line, lw = 2) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (line) { ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.stroke(); }
  };
  D.roundRect = (ctx, x, y, w, h, r, fill, line, lw = 2) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (line) { ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.stroke(); }
  };
  D.text = (ctx, t, x, y, col, { align = 'center', size = 16, font = Sim.FONT, weight = 700 } = {}) => {
    ctx.fillStyle = col; ctx.font = `${weight} ${Sim.compact ? Math.round(size * 1.15) : size}px ${font}`;   // en el celular, letra un poco más grande
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y);
  };
  D.arrow = (ctx, x, y, angle, size, col) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, -size * 0.8); ctx.lineTo(-size * 0.7, size * 0.8); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  // Tubería: borde gris y agua clara por dentro. Cable: línea delgada.
  D.pipe = (ctx, pts, inner = 2 * Sim.PIPE) => { D.line(ctx, pts, inner + 10, C.pipe); D.line(ctx, pts, inner, C['water-soft']); };
  D.wire = (ctx, pts) => D.line(ctx, pts, 4, C.ink);
  // Puntos que avanzan por el recorrido; phase crece con la corriente.
  D.flow = (ctx, pts, phase, col, { gap = 30, r = 4.5 } = {}) => {
    const L = D.len(pts), off = ((phase % gap) + gap) % gap;
    ctx.fillStyle = col;
    for (let d = off, i = 0; d < L; d += gap, i++) {
      const [x, y] = D.pointAt(pts, d), [jx, jy] = Sim.jitter(x, y, i);
      ctx.beginPath(); ctx.arc(x + jx, y + jy, r, 0, Math.PI * 2); ctx.fill();
    }
  };
  // Vibración de las partículas donde hay presión (voltaje) pero no corriente: el banco pone en
  // Sim.shake(x, y) la amplitud en cada punto; seed hace que cada partícula vibre a su ritmo.
  Sim.shake = null;
  // Devuelve [dx, dy, rapidez]: la rapidez media de la vibración sirve para colorear la partícula.
  Sim.jitter = (x, y, seed) => {
    const a = Sim.shake ? Sim.shake(x, y) : 0;
    if (!a) return [0, 0, 0];
    const t = performance.now() / 1000, ph = seed * 2.399;
    return [a * Math.sin(t * 31 + ph), a * Math.cos(t * 27 + ph * 1.7), a * 29];
  };
  // Tramo angosto de tubería con medio ancho interior hn (la tubería normal mide Sim.PIPE).
  D.narrow = (ctx, x, y, hn) => {
    const h0 = Sim.PIPE;
    const shape = (hf, h, col) => {
      ctx.beginPath();
      ctx.moveTo(x - 46, y - hf); ctx.lineTo(x - 24, y - h); ctx.lineTo(x + 24, y - h); ctx.lineTo(x + 46, y - hf);
      ctx.lineTo(x + 46, y + hf); ctx.lineTo(x + 24, y + h); ctx.lineTo(x - 24, y + h); ctx.lineTo(x - 46, y + hf);
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    };
    ctx.fillStyle = C.card; ctx.fillRect(x - 47, y - h0 - 6, 94, 2 * h0 + 12);
    shape(h0 + 5, hn + 5, C.pipe);
    shape(h0, hn, C['water-soft']);
  };
  // Medio ancho del tramo angosto según la resistencia en ohmios (470 Ω = casi sin estrechar).
  Sim.narrowHalf = R => Math.max(3, Math.min(Sim.PIPE, Sim.PIPE * Math.sqrt(470 / R)));
  // Perfil del tramo angosto centrado en la distancia dc del recorrido, para Sim.water.
  Sim.narrowProfile = (dc, hn) => d => {
    const dx = Math.abs(d - dc);
    if (dx <= 24) return hn;
    if (dx >= 46) return Sim.PIPE;
    return hn + (Sim.PIPE - hn) * (dx - 24) / 22;
  };
  // Junta varios perfiles: en cada punto manda el más angosto.
  Sim.profile = (...fs) => d => fs.reduce((h, f) => Math.min(h, f(d)), Sim.PIPE);
  D.resistor = (ctx, x, y) => {
    ctx.fillStyle = C.card; ctx.fillRect(x - 46, y - 16, 92, 32);
    ctx.beginPath(); ctx.moveTo(x - 46, y); ctx.lineTo(x - 36, y);
    for (let k = 0; k < 6; k++) ctx.lineTo(x - 36 + (k + 0.5) * 12, y + (k % 2 ? 12 : -12));
    ctx.lineTo(x + 36, y); ctx.lineTo(x + 46, y);
    ctx.lineWidth = 3.5; ctx.strokeStyle = C.ink; ctx.lineJoin = 'miter'; ctx.stroke();
  };
  // Medidor de aguja; frac de 0 a 1 (puede pasarse un poco si la aguja rebota).
  D.dial = (ctx, x, y, r, frac, col, letter) => {
    D.circle(ctx, x, y, r, C.card, C.ink, 3);
    ctx.lineWidth = 2; ctx.strokeStyle = C.muted;
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + i / 10 * Math.PI * 1.5, l = i % 5 ? 6 : 11;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4));
      ctx.lineTo(x + Math.cos(a) * (r - 4 - l), y + Math.sin(a) * (r - 4 - l)); ctx.stroke();
    }
    const a = Math.PI * 0.75 + Math.max(-0.03, Math.min(1.03, frac)) * Math.PI * 1.5;
    ctx.lineWidth = 3.5; ctx.strokeStyle = col; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (r - 9), y + Math.sin(a) * (r - 9)); ctx.stroke();
    D.circle(ctx, x, y, 4, C.ink);
    if (letter) D.text(ctx, letter, x, y + r * 0.5, C.muted, { size: 14, font: Sim.MONO, weight: 500 });
  };
  // Escala alrededor de una perilla (de −135° a +135°, 0° arriba).
  D.knobScale = (ctx, x, y, r, labels, ticks = 12) => {
    ctx.lineWidth = 2; ctx.strokeStyle = C.muted;
    for (let i = 0; i <= ticks; i++) {
      const a = (-135 + i * 270 / ticks - 90) * Math.PI / 180, l = ticks === 12 && i % 6 ? 5 : 9;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a) * (r + l), y + Math.sin(a) * (r + l)); ctx.stroke();
    }
    labels.forEach(([t, frac]) => {
      const a = (-135 + frac * 270 - 90) * Math.PI / 180;
      D.text(ctx, t, x + Math.cos(a) * (r + 20), y + Math.sin(a) * (r + 20), C.muted, { size: 13, font: Sim.MONO, weight: 500 });
    });
  };

  // LED indicador pequeño; on de 0 a 1 (brillo).
  D.led = (ctx, x, y, on, col = '#22e05a', r = 7) => {
    if (on > 0) {
      const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3.2);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.55 * on; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    D.circle(ctx, x, y, r, on > 0 ? col : '#8b959c', C.ink, 1.5);   // verde encendido, gris apagado
    D.circle(ctx, x - r * 0.3, y - r * 0.3, r * 0.3, on > 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)');
  };
  // Rotor con aspas; omega en rad/s. Las aspas se dibujan con el desenfoque de una foto
  // tomada con exposición de 1/30 s: a más velocidad, más borrosas, hasta verse como un disco.
  D.rotor = (ctx, x, y, r, angle, omega, blades, col) => {
    const sweep = Math.min(Math.abs(omega) / 30, 2 * Math.PI / blades);
    const n = Math.max(1, Math.min(28, Math.ceil(sweep / 0.04)));
    ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.lineCap = 'round';
    ctx.globalAlpha = n === 1 ? 1 : Math.min(1, 2.2 / n);
    for (let j = 0; j < n; j++) {
      const a0 = angle - Math.sign(omega) * sweep * j / n;
      for (let k = 0; k < blades; k++) {
        const a = a0 + k * 2 * Math.PI / blades;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  // ---------- componentes ----------
  // Bomba dentro de la tubería: carcasa y rotor (omega en rad/s, a la velocidad real).
  D.pump = (ctx, x, y, angle, omega) => {
    D.circle(ctx, x, y, 40, C.metal, C.ink, 2.5);
    D.circle(ctx, x, y, 33, C['water-soft']);
    D.rotor(ctx, x, y, 27, angle, omega, 4, C.water);
    D.circle(ctx, x, y, 6, C.ink);
  };
  // Símbolo de fuente en un cable horizontal: placa larga (+) a la izquierda.
  D.source = (ctx, x, y) => {
    ctx.fillStyle = C.card; ctx.fillRect(x - 22, y - 26, 44, 52);
    D.line(ctx, [[x - 22, y], [x - 9, y]], 4, C.ink); D.line(ctx, [[x + 9, y], [x + 22, y]], 4, C.ink);
    D.line(ctx, [[x - 9, y - 24], [x - 9, y + 24]], 4, C.ink, 'butt');
    D.line(ctx, [[x + 9, y - 12], [x + 9, y + 12]], 9, C.ink, 'butt');
    D.text(ctx, '+', x - 26, y - 30, C.ink, { size: 20 });
  };
  // Las ruedas giran lento (4 rpm por mA, unas 2 vueltas por segundo a 30 mA) para que se vea
  // cómo cambia su velocidad con la resistencia; la bomba sí gira a 10 rpm por mL/s.
  Sim.WHEEL_RPM_PER_MA = 4;
  // Rueda de molino dentro de la tubería (el LED del lado del agua). Gira con la corriente y tiene
  // una compuerta que solo deja pasar el agua hacia la derecha; rev = al revés, broken = rota.
  D.wheel = (ctx, x, y, { angle = 0, omega = 0, broken = false, rev = false, label = '' } = {}) => {
    D.circle(ctx, x, y, 30, C.metal, broken ? C.danger : C.ink, 2.5);
    D.circle(ctx, x, y, 24, C['water-soft']);
    if (broken) D.rotor(ctx, x, y, 7, 0.5, 0, 4, C.muted);   // solo quedan los muñones de las aspas
    else D.rotor(ctx, x, y, 19, angle, omega, 4, C.ink);
    D.circle(ctx, x, y, 4, C.ink);
    D.arrow(ctx, x, y - 42, rev ? Math.PI : 0, 8, rev ? C.danger : C.muted);
    if (broken) {
      D.line(ctx, [[x - 15, y - 15], [x + 15, y + 15]], 4, C.danger);
      D.line(ctx, [[x + 15, y - 15], [x - 15, y + 15]], 4, C.danger);
    }
    const t = broken ? 'rueda rota' : rev ? 'compuerta cerrada' : label;
    if (t) D.text(ctx, t, x, y + 48, broken || rev ? C.danger : C.muted, { size: 15 });
  };
  // LED en un cable horizontal; I en mA decide el brillo. La corriente entra por la izquierda.
  D.ledSymbol = (ctx, x, y, { I = 0, broken = false, rev = false, label = 'LED' } = {}) => {
    const dir = rev ? -1 : 1;
    ctx.fillStyle = C.card; ctx.fillRect(x - 26, y - 26, 52, 52);
    const glow = broken ? 0 : Math.min(1, I / 30);   // brilla más con más corriente, hasta los 30 mA que aguanta
    if (glow > 0) {
      const g = ctx.createRadialGradient(x, y, 3, x, y, 40);
      g.addColorStop(0, `rgba(255, 70, 50, ${0.75 * glow})`); g.addColorStop(1, 'rgba(255, 70, 50, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.fill();
    }
    D.line(ctx, [[x - 26, y], [x - 12, y]], 4, C.ink); D.line(ctx, [[x + 12, y], [x + 26, y]], 4, C.ink);
    ctx.beginPath(); ctx.moveTo(x - 12 * dir, y - 13); ctx.lineTo(x - 12 * dir, y + 13); ctx.lineTo(x + 11 * dir, y); ctx.closePath();
    ctx.fillStyle = !broken && glow > 0 ? `rgba(255, 90, 60, ${0.3 + 0.7 * glow})` : C.card; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = broken ? C.muted : C.ink; ctx.lineJoin = 'miter'; ctx.stroke();
    D.line(ctx, [[x + 12 * dir, y - 13], [x + 12 * dir, y + 13]], 3, broken ? C.muted : C.ink);
    D.line(ctx, [[x + 3, y - 17], [x + 12, y - 26]], 2, C.muted); D.line(ctx, [[x + 11, y - 14], [x + 20, y - 23]], 2, C.muted);
    if (broken) { D.line(ctx, [[x - 13, y - 13], [x + 13, y + 13]], 4, C.danger); D.line(ctx, [[x + 13, y - 13], [x - 13, y + 13]], 4, C.danger); }
    const t = broken ? label + ' quemado' : rev ? label + ' al revés' : label;
    D.text(ctx, t, x, y + 48, broken || rev ? C.danger : C.muted, { size: 15 });
  };
  // Válvula en una tubería horizontal.
  D.valve = (ctx, x, y, open) => {
    D.circle(ctx, x, y, 19, C.metal, C.ink, 2.5);
    if (open) { ctx.fillStyle = C['water-soft']; ctx.fillRect(x - 16, y - 7, 32, 14); }
    else { ctx.fillStyle = C.danger; ctx.fillRect(x - 4, y - 17, 8, 34); }
    D.line(ctx, [[x, y - 19], [x, y - 32]], 4, C.ink);
    D.line(ctx, open ? [[x, y - 32], [x, y - 44]] : [[x - 13, y - 32], [x + 13, y - 32]], 6, C.ink);
    D.text(ctx, open ? 'válvula abierta' : 'válvula cerrada', x, y + 48, open ? C.muted : C.danger, { size: 15 });
  };
  // Interruptor de cuchilla en un cable horizontal.
  D.knifeSwitch = (ctx, x, y, closed) => {
    ctx.fillStyle = C.card; ctx.fillRect(x - 28, y - 30, 56, 40);
    D.circle(ctx, x - 22, y, 5, C.card, C.ink, 2.5); D.circle(ctx, x + 22, y, 5, C.card, C.ink, 2.5);
    D.line(ctx, closed ? [[x - 18, y], [x + 18, y]] : [[x - 18, y - 3], [x + 16, y - 26]], 3.5, C.ink);
    D.text(ctx, closed ? 'interruptor cerrado' : 'interruptor abierto', x, y + 48, closed ? C.muted : C.danger, { size: 15 });
  };

  // ---------- medidores: ruedita con aguja y pantallita de siete segmentos ----------
  const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc',
    '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
  Sim.LCD = { bg: '#121c16', on: '#8ef7a6', off: 'rgba(142, 247, 166, 0.09)', unit: '#5fb478' };
  // Dígitos de siete segmentos; (x, y) es la esquina derecha del texto, centrada en alto.
  D.segments = (ctx, text, x, y, h) => {
    const cw = h * 0.52, gap = h * 0.32, t = h * 0.12, chars = [];
    for (const ch of text) { if (ch === '.' && chars.length) chars[chars.length - 1].dot = true; else chars.push({ ch }); }
    let x0 = x - chars.length * (cw + gap) + gap;
    const y0 = y - h / 2, ym = y, y1 = y + h / 2, k = t * 0.7;
    const segs = (cx) => ({
      a: [[cx + k, y0], [cx + cw - k, y0]], d: [[cx + k, y1], [cx + cw - k, y1]], g: [[cx + k, ym], [cx + cw - k, ym]],
      f: [[cx, y0 + k], [cx, ym - k]], b: [[cx + cw, y0 + k], [cx + cw, ym - k]],
      e: [[cx, ym + k], [cx, y1 - k]], c: [[cx + cw, ym + k], [cx + cw, y1 - k]]
    });
    ctx.lineCap = 'round';
    for (const c of chars) {
      const sg = segs(x0), lit = SEG[c.ch] ?? '';
      for (const name of 'abcdefg') {
        ctx.beginPath(); ctx.moveTo(...sg[name][0]); ctx.lineTo(...sg[name][1]);
        ctx.lineWidth = t; ctx.strokeStyle = lit.includes(name) ? Sim.LCD.on : Sim.LCD.off; ctx.stroke();
      }
      ctx.fillStyle = c.dot ? Sim.LCD.on : Sim.LCD.off;
      ctx.beginPath(); ctx.arc(x0 + cw + gap / 2, y1, t * 0.6, 0, Math.PI * 2); ctx.fill();
      x0 += cw + gap;
    }
  };
  // Pantallita: rectángulo oscuro con el número y la unidad. (x, y) es el centro.
  D.lcd = (ctx, x, y, w, h, text, unit) => {
    D.roundRect(ctx, x - w / 2, y - h / 2, w, h, 5, Sim.LCD.bg, C.ink, 1.5);
    const uw = unit ? unit.length * (Sim.compact ? 8 : 7) + 6 : 0;
    D.segments(ctx, text, x + w / 2 - 8 - uw, y, h * 0.58);
    if (unit) D.text(ctx, unit, x + w / 2 - 6, y + h * 0.12, Sim.LCD.unit, { align: 'right', size: 12, font: Sim.MONO, weight: 500 });
  };
  // Número con ancho fijo para la pantallita (espacios a la izquierda).
  Sim.digits = (v, width, d) => {
    const s = Math.abs(v) < 0.5 * Math.pow(10, -d) ? (0).toFixed(d) : v.toFixed(d);
    return s.padStart(width + (d ? 1 : 0), ' ');
  };
  // Medidor completo: caja, ruedita con aguja y pantallita debajo ('below') o a la derecha ('right').
  // Devuelve la caja que ocupa, para acomodar la etiqueta.
  D.meter = (ctx, x, y, { r = 34, frac = 0, text = '', unit = '', label = '', color, lcd = 'below', lcdW = 100 }) => {
    let box;
    if (lcd === 'right') {
      box = [x - r - 10, y - r - 10, 2 * r + 20 + lcdW + 6, 2 * r + 20];
    } else {
      const w = Math.max(2 * r + 20, lcdW + 16);
      box = [x - w / 2, y - r - 10, w, 2 * r + 56];
    }
    D.roundRect(ctx, ...box, 10, C.metal, C.ink, 2);
    D.dial(ctx, x, y, r, frac, color);
    if (lcd === 'right') D.lcd(ctx, x + r + 10 + lcdW / 2, y, lcdW, 32, text, unit);
    else D.lcd(ctx, x, y + r + 24, lcdW, 30, text, unit);
    if (label) D.text(ctx, label, box[0] + box[2] / 2, box[1] + box[3] + 16, C.muted, { size: 15 });
    return box;
  };

  // ---------- agua como partículas ----------
  // Cada partícula avanza según el volumen que pasa: donde la tubería se angosta, va más rápido.
  // Dentro de la tubería las del centro van más rápido que las de las orillas, como en un tubo real.
  // El color indica la rapidez: azul lento, rojo rápido.
  Sim.speedColor = t => `hsl(${Math.round(215 - 215 * Math.max(0, Math.min(1, t)))} 85% 50%)`;
  // Partículas del agua: en pantallas chicas (Sim.compact) van menos y más grandes para que se distingan.
  Sim.compact = false;
  Sim.water = (pts, halfAt = () => Sim.PIPE, {
    spacing = Sim.compact ? 21 : 14, lanes = Sim.compact ? [-0.6, 0, 0.6] : [-0.72, -0.36, 0, 0.36, 0.72],
    radius = Sim.compact ? 3.8 : 2.8, vmax = 200 } = {}) => {
    const L = D.len(pts), N = Math.ceil(L / 2), ds = L / N;
    const Hs = new Float32Array(N + 1), Vs = new Float32Array(N + 1);
    let VT = 0;
    // Perfil de la tubería (medio ancho según la distancia); se puede cambiar sin perder las partículas.
    const setProfile = f => {
      const old = VT;
      for (let i = 0; i <= N; i++) {
        Hs[i] = f(i * ds);
        if (i) Vs[i] = Vs[i - 1] + (Hs[i] + Hs[i - 1]) / 2 * ds;
      }
      VT = Vs[N];
      if (old) for (const p of parts) p.v = p.v / old * VT;
    };
    const mean = lanes.reduce((a, f) => a + 1 - f * f, 0) / lanes.length;
    const parts = [];
    setProfile(halfAt);
    lanes.forEach((f, j) => {
      const n = Math.floor(L / spacing), u = (1 - f * f) / mean;
      for (let k = 0; k < n; k++) parts.push({ f, u, v: (k + (j % 2) * 0.5) * VT / n });
    });
    const locate = v => {
      let lo = 0, hi = N;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (Vs[m] <= v) lo = m; else hi = m; }
      const span = Vs[hi] - Vs[lo];
      return [lo * ds + (span ? (v - Vs[lo]) / span : 0) * ds, Hs[lo]];
    };
    let rate = 0;
    return {
      parts, setProfile,
      // flow: caudal en unidades de "rapidez media en la tubería normal" (unidades de dibujo por segundo).
      step(flow, dt) {
        rate = flow * Sim.PIPE;
        for (const p of parts) { p.v = (p.v + rate * p.u * dt) % VT; if (p.v < 0) p.v += VT; }
      },
      draw(ctx, r = radius) {
        parts.forEach((p, i) => {
          const [d, h] = locate(p.v);
          const [x, y, tx, ty] = D.frameAt(pts, d);
          const off = p.f * h, [jx, jy, js] = Sim.jitter(x, y, i);
          ctx.fillStyle = Sim.speedColor(Math.max(Math.abs(rate * p.u / h), js) / vmax);
          ctx.beginPath(); ctx.arc(x - ty * off + jx, y + tx * off + jy, r, 0, Math.PI * 2); ctx.fill();
        });
      }
    };
  };
  // Barra de colores para leer la rapidez del agua.
  D.speedLegend = (ctx, x, y, w) => {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, Sim.speedColor(i / 6));
    ctx.fillStyle = g; ctx.fillRect(x, y - 5, w, 10);
    D.text(ctx, 'lento', x, y + 16, C.muted, { align: 'left', size: 13, weight: 400 });
    D.text(ctx, 'rápido', x + w, y + 16, C.muted, { align: 'right', size: 13, weight: 400 });
  };

  // ---------- inercia ----------
  // Retraso de primer orden: se acerca al objetivo con constante de tiempo tau (s). tau = 0 es instantáneo.
  // Rampa suave: va del valor actual al objetivo en exactamente T segundos (curva en S).
  // Si el objetivo cambia a medio camino, arranca de nuevo desde donde va. T = 0 es instantáneo.
  Sim.ramp = (x = 0) => ({
    x, from: x, to: x, t: 0,
    step(target, T, dt) {
      if (target !== this.to) { this.from = this.x; this.to = target; this.t = 0; }
      this.t += dt;
      const u = T <= 0 ? 1 : Math.min(1, this.t / T);
      this.x = this.from + (this.to - this.from) * u * u * (3 - 2 * u);
      return this.x;
    }
  });
  Sim.lag = (value, target, tau, dt) => tau <= 0 ? target : target + (value - target) * Math.exp(-dt / tau);
  // Aguja con masa y resorte: tarda en llegar y rebota un poco. tau = 0 es instantánea.
  Sim.needle = (x = 0) => ({
    x, v: 0,
    step(target, tau, dt) {
      if (tau <= 0.01) { this.x = target; this.v = 0; return this.x; }
      const w = 2.5 / tau, z = 0.4, n = Math.ceil(dt / 0.004), h = dt / n;
      for (let i = 0; i < n; i++) { this.v += (w * w * (target - this.x) - 2 * z * w * this.v) * h; this.x += this.v * h; }
      return this.x;
    }
  });

  // ---------- perilla ----------
  // el: un elemento vacío; se le agrega la tapa con su marca. Se gira arrastrando, con la rueda del ratón o con las flechas.
  Sim.knob = (el, { min, max, step, value, label, format, onInput }) => {
    el.classList.add('knob');
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', label);
    el.setAttribute('aria-valuemin', min);
    el.setAttribute('aria-valuemax', max);
    el.innerHTML = '<div class="knob-cap"><span class="knob-mark"></span></div>';
    const cap = el.firstChild;
    const k = { value: min };
    // quiet = true cambia la perilla sin avisar (para perillas enlazadas).
    k.set = (v, quiet) => {
      v = Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
      k.value = v;
      cap.style.transform = `rotate(${-135 + 270 * (v - min) / (max - min)}deg)`;
      el.setAttribute('aria-valuenow', v);
      el.setAttribute('aria-valuetext', format ? format(v) : String(v));
      if (!quiet && onInput) onInput(v);
    };
    const fromPointer = e => {
      const r = el.getBoundingClientRect();
      let a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
      a = Math.max(-135, Math.min(135, a));
      k.set(min + (a + 135) / 270 * (max - min));
    };
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); el.focus(); fromPointer(e); e.preventDefault(); });
    el.addEventListener('pointermove', e => { if (el.hasPointerCapture(e.pointerId)) fromPointer(e); });
    el.addEventListener('wheel', e => { e.preventDefault(); k.set(k.value + (e.deltaY < 0 ? step : -step)); }, { passive: false });
    el.addEventListener('keydown', e => {
      const d = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: 4 * step, PageDown: -4 * step }[e.key];
      if (d) { k.set(k.value + d); e.preventDefault(); }
      else if (e.key === 'Home') { k.set(min); e.preventDefault(); }
      else if (e.key === 'End') { k.set(max); e.preventDefault(); }
    });
    k.set(value, true);
    return k;
  };

  // ---------- animación ----------
  Sim.run = fn => {
    let last = performance.now();
    const frame = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      Sim.readColors();
      fn(dt);
      requestAnimationFrame(frame);
    };
    Sim.readColors();
    requestAnimationFrame(frame);
  };

  window.Sim = Sim;
})();
