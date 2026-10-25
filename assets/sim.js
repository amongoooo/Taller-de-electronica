// Herramientas comunes para todas las simulaciones del taller:
// paneles que llenan la pantalla, dibujo de tuberías y cables, perillas e inercia.
(() => {
  const Sim = {};
  const C = {};
  Sim.C = C;
  Sim.FONT = '"Archivo Narrow", "Arial Narrow", sans-serif';
  Sim.MONO = Sim.FONT;   // los números también en Archivo Narrow (sus cifras son de ancho fijo)
  Sim.WIDE = '"Saira", "Segoe UI", sans-serif';   // títulos y rótulos importantes, en su versión ancha (ver D.text)
  Sim.PIPE = 13; // medio ancho interior de una tubería normal

  Sim.readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    ['bg', 'card', 'ink', 'muted', 'line', 'pipe', 'water-soft', 'water', 'charge', 'charge-soft', 'danger', 'ok', 'metal', 'inst', 'neg', 'sel']
      .forEach(k => C[k] = cs.getPropertyValue('--' + k).trim());
    C.dark = document.documentElement.dataset.theme === 'dark';
  };

  // Tema: el modo oscuro se pone con data-theme="dark" en <html> (cada página lo pone desde el <head>
  // para que no parpadee); el dibujo lee los colores de nuevo en cada cuadro.
  Sim.theme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  Sim.setTheme = t => {
    if (t === 'dark') document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('sim-theme', t); } catch (e) {}
  };

  Sim.fmt = (x, d = 1) => x.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  // Resistencia como se escribe en todas las páginas: 470 Ω, 1 kΩ, 2.2 kΩ (sin ceros de más).
  Sim.ohm = R => R >= 1000 ? (R / 1000).toLocaleString('es-MX') + ' kΩ' : Math.round(R) + ' Ω';

  // ---------- panel: un canvas con tamaño lógico W×H que se escala para llenar su caja ----------
  // size puede ser [W, H] fijo o una función (ancho, alto de la caja) → [W, H], para que el dibujo
  // aproveche la forma de la pantalla; cuando cambia se llama p.onLayout().
  // Los controles HTML dentro de .sim-layer se colocan con p.at(el, () => [x, y]) en coordenadas del dibujo.
  Sim.panels = [];   // todos los paneles de la página (el menú busca dónde hay lugar a la derecha)
  Sim.panel = (box, size) => {
    const canvas = box.querySelector('canvas');
    const p = { box, canvas, W: 0, H: 0, scale: 1, ox: 0, oy: 0, dpr: 1, items: [], onLayout: null };
    Sim.panels.push(p);
    // pos() puede dar null: ese control no va en el acomodo de ahora y se esconde (.sim-off)
    // (también lo que queda muy abajo del dibujo: un instrumento guardado, ver Sim.instMenu)
    const place = it => {
      const q = it.pos(), off = !q || q[1] > p.H + 60;
      it.el.classList.toggle('sim-off', off);
      if (off) return;
      const [x, y] = q;
      it.el.style.left = (p.ox + x * p.scale) + 'px';
      it.el.style.top = (p.oy + y * p.scale) + 'px';
    };
    const fit = () => {
      let w = box.clientWidth, h = box.clientHeight;
      // un panel oculto se acomoda igual que el otro, para que los dos compartan el mismo dibujo
      if ((!w || !h) && p.mirror) { w = p.mirror.box.clientWidth; h = p.mirror.box.clientHeight; }
      if (!w || !h) return;
      // p.inset(): los px de abajo que el dibujo deja libres (el menú de los instrumentos del celular)
      const full = h;
      h -= p.inset ? p.inset() : 0;
      // [W, H, x0, modo, y0]: x0 es la x del dibujo que queda en el borde izquierdo y y0 la y que queda arriba
      // (negativa: una franja libre arriba del dibujo)
      const [W, H, x0 = 0, mode = '', y0 = 0] = typeof size === 'function' ? size(w, h) : size;
      const changed = W !== p.W || H !== p.H || x0 !== p.x0 || y0 !== p.y0 || mode !== p.mode;
      p.W = W; p.H = H; p.x0 = x0; p.y0 = y0; p.mode = mode;
      p.scale = Math.min(w / W, h / H);
      p.ox = (w - W * p.scale) / 2 - x0 * p.scale;
      p.oy = (h - H * p.scale) / 2 - y0 * p.scale;
      p.dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * p.dpr);
      canvas.height = Math.round(full * p.dpr);
      box.style.setProperty('--s', p.scale);
      if (changed && p.onLayout) p.onLayout(W, H, mode);
      p.items.forEach(place);
      if (p.mirror && !p.mirror.box.clientWidth) p.mirror.refit();
    };
    p.at = (el, pos) => { const it = { el, pos }; p.items.push(it); place(it); return el; };
    p.refit = fit;
    p.replace = () => p.items.forEach(place);   // volver a acomodar controles que cambian de lugar
    // Dónde acaba (x del dibujo) el letrero Agua / Electricidad del panel si un rótulo a la altura y lo tocaría;
    // -Infinity si no se ve o queda más arriba o más abajo. Sirve de orilla izquierda a D.tagRow.
    const tag = box.querySelector('.sim-tag');
    p.tagEdge = y => {
      if (!tag || !tag.offsetWidth) return -Infinity;
      const py = p.oy + y * p.scale, top = tag.offsetTop, bot = top + tag.offsetHeight;
      if (py + 16 < top || py - 16 > bot) return -Infinity;
      return (tag.offsetLeft + tag.offsetWidth + 8 - p.ox) / p.scale;
    };
    p.begin = () => {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = C.card; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const k = p.dpr * p.scale;
      ctx.setTransform(k, 0, 0, k, p.dpr * p.ox, p.dpr * p.oy);
      Sim.S = p.scale;   // escala del panel que se dibuja (para gruesos en px de pantalla)
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
  // Distancia sobre el recorrido del punto más cercano a (x, y), y qué tan lejos queda: { d, dist }.
  D.project = (pts, x, y) => {
    let best = null, d0 = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], s = Math.hypot(bx - ax, by - ay);
      const t = s ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (s * s))) : 0;
      const dist = Math.hypot(x - ax - (bx - ax) * t, y - ay - (by - ay) * t);
      if (!best || dist < best.dist) best = { d: d0 + t * s, dist };
      d0 += s;
    }
    return best;
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
  // bg: los letreros del dibujo llevan detrás un fondo del color de la tarjeta, para que una tubería,
  // un cable o una manguera que pase por ahí no los tape (se ve como si pasara por debajo).
  // Letra de size en unidades del dibujo: en el celular un poco más grande y nunca menos de 14 px en pantalla
  // (Sim.S es la escala del panel que se dibuja). Si un rótulo así ya no cabe, se acorta (ver D.text max).
  // Con ctx se toma la escala con la que se dibuja de verdad (un instrumento chico se dibuja escalado).
  Sim.MIN_PX = 14;
  Sim.px = (size, ctx) => {
    let k = Sim.S;
    if (ctx) { const m = ctx.getTransform(); k = Math.hypot(m.a, m.b) / (window.devicePixelRatio || 1); }
    return Math.max(Sim.compact ? Math.round(size * 1.15) : size, Sim.MIN_PX / k);
  };
  D.font = (ctx, size = 16, font = Sim.FONT, weight = 700) => {
    const px = Sim.px(size, ctx);
    ctx.font = `${weight} ${px}px ${font}`;
    ctx.fontStretch = font === Sim.WIDE ? 'expanded' : 'normal';
    return px;
  };
  // t puede ser una lista de rótulos, del más largo al más corto: se usa el primero que cabe en max (ancho
  // en el dibujo), o el último.
  D.text = (ctx, t, x, y, col, { align = 'center', size = 16, font = Sim.FONT, weight = 700, bg = false, max = 0 } = {}) => {
    const px = D.font(ctx, size, font, weight);
    if (Array.isArray(t)) t = t.find(s => !max || ctx.measureText(s).width <= max) ?? t[t.length - 1];
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (bg && t) {
      const w = ctx.measureText(t).width, x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
      D.backdrop(ctx, x0, y, w, px);
    }
    ctx.fillStyle = col; ctx.fillText(t, x, y);
  };
  // El fondo de un letrero de ancho w que empieza en x, centrado en y, con letra de px.
  D.backdrop = (ctx, x, y, w, px) => {
    const h = Math.round(px * 1.3);
    D.roundRect(ctx, x - 5, y - h / 2, w + 10, h, h / 2, C.card);
  };
  // Etiqueta de un componente, en una línea: «nombre valor», el nombre en gris y el valor en tinta (los dos en
  // azul si está seleccionado; el nombre en rojo con danger). Su estado («cerrado», «quemada») va en una
  // pastilla al lado, roja con danger. align 'center' (x es el centro) o 'left' (x es donde empieza).
  const TAG_GAP = 7;
  const tagParts = (ctx, name, value, state) => {
    D.font(ctx, 15); const w1 = ctx.measureText(name).width;
    D.font(ctx, 16, Sim.MONO, 600); const w2 = value ? ctx.measureText(value).width : 0;
    const px = D.font(ctx, 14), w3 = state ? ctx.measureText(state).width + 16 : 0;
    const w = w1 + (value ? TAG_GAP + w2 : 0);
    return { w1, w2, w3, w, all: w + (state ? (w ? TAG_GAP + 6 : 0) + w3 : 0), px };
  };
  D.tagWidth = (ctx, name, value, state) => tagParts(ctx, name, value, state).all;
  // name puede ser una lista, del más largo al más corto: se usa el primero con el que todo cabe en max.
  D.tag = (ctx, x, y, name, value, { sel = false, danger = false, state = '', align = 'center', max = 0 } = {}) => {
    if (Array.isArray(name)) name = name.find(n => !max || D.tagWidth(ctx, n, value, state) <= max) ?? name[name.length - 1];
    const q = tagParts(ctx, name, value, state), x0 = align === 'left' ? x : x - q.all / 2;
    const vcol = sel ? C.sel : C.ink, ncol = danger && !state ? C.danger : sel ? C.sel : C.muted;
    if (q.w) {
      D.backdrop(ctx, x0, y, q.w, Sim.px(16, ctx));
      D.text(ctx, name, x0, y, ncol, { size: 15, align: 'left' });
      if (value) D.text(ctx, value, x0 + q.w1 + TAG_GAP, y + 0.5, vcol, { size: 16, font: Sim.MONO, weight: 600, align: 'left' });
    }
    if (state) D.pill(ctx, state, x0 + q.all - q.w3 / 2, y, danger ? C.danger : sel ? C.sel : C.ink, danger);
    return q.all;
  };
  // Varias etiquetas en un renglón a la altura y, cada una centrada sobre su componente (x). Si se enciman se
  // separan un poco (sin salirse de [x0, x1]); si para eso alguna tendría que alejarse más de SLIDE de su
  // componente, el nombre se acorta (name puede ser una lista, del más largo al más corto) y se prueba otra vez.
  // Cada una es { x, name, value, sel, danger, state }.
  D.tagRow = (ctx, y, items, x0 = -Infinity, x1 = Infinity) => {
    const G = 12, SLIDE = 24, L = items.map(it => ({ ...it, names: [].concat(it.name), k: 0 })).sort((a, b) => a.x - b.x);
    const width = t => D.tagWidth(ctx, t.names[t.k], t.value, t.state);
    L.forEach(t => { t.w = width(t); });
    const spread = () => {
      const cx = L.map(t => t.x);
      for (let n = 0; n < 60; n++) {
        let moved = false;
        for (let i = 1; i < L.length; i++) {
          const d = cx[i - 1] + L[i - 1].w / 2 + G - (cx[i] - L[i].w / 2);
          if (d > 0.5) { cx[i - 1] -= d / 2; cx[i] += d / 2; moved = true; }
        }
        L.forEach((t, i) => { cx[i] = Math.max(x0 + t.w / 2, Math.min(x1 - t.w / 2, cx[i])); });
        if (!moved) break;
      }
      return cx;
    };
    let cx = spread();
    for (;;) {
      const far = L.map((t, i) => [Math.abs(cx[i] - t.x), i]).filter(([d, i]) => d > SLIDE);
      if (!far.length) break;
      // se acorta la más ancha de las que se movieron de más o de sus vecinas
      const near = new Set(far.flatMap(([, i]) => [i - 1, i, i + 1]));
      const c = L.filter((t, i) => near.has(i) && t.k < t.names.length - 1).sort((a, b) => b.w - a.w)[0];
      if (!c) break;
      c.k++; c.w = width(c); cx = spread();
    }
    L.forEach((t, i) => D.tag(ctx, cx[i], y, t.names[t.k], t.value, t));
  };
  // Pastilla pequeña con un estado, centrada en (x, y).
  D.pill = (ctx, t, x, y, col, strong = false) => {
    const px = D.font(ctx, 14), w = ctx.measureText(t).width + 16, h = Math.round(px * 1.4);
    D.roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2, strong ? C.card : C.bg, strong ? col : C.line, 1.5 / Sim.S);
    D.text(ctx, t, x, y + 0.5, col, { size: 14 });
  };
  D.arrow = (ctx, x, y, angle, size, col) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, -size * 0.8); ctx.lineTo(-size * 0.7, size * 0.8); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  // Tubería: borde gris y agua clara por dentro. Cable: línea delgada.
  D.pipe = (ctx, pts, inner = 2 * Sim.PIPE) => { D.line(ctx, pts, inner + 10, C.pipe); D.line(ctx, pts, inner, C['water-soft']); };
  D.wire = (ctx, pts) => D.line(ctx, pts, 4, C.ink);
  // Manguera de un medidor por el recorrido pts: tubo claro con agua adentro y una raya del color
  // de su borne a lo largo (roja la del +, negra la del −).
  D.hose = (ctx, pts, col) => {
    const ln = (w, c) => { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.stroke(); };
    const path = q => { ctx.beginPath(); q.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    path(pts); ln(14, C.card); ln(12, C.pipe); ln(9, C['water-soft']);
    // la raya va corrida hacia un lado del centro, siguiendo la normal de cada tramo
    const side = pts.map((p, k) => {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      return [p[0] - dy / d * 3.2, p[1] + dx / d * 3.2];
    });
    ctx.lineCap = 'butt'; path(side); ln(3.2, col);
    ctx.lineCap = 'round'; path(pts); ln(3.6, C.water);
  };
  // Puntos que avanzan por el recorrido; phase crece con la corriente.
  // Con el banco (Sim.field) cada punto toma el color de su modo (Sim.particleColor); sin él, col.
  // En un tramo puenteado (Sim.holds) las cargas se quedan donde estaban (frozen: la fase de cuando empezó, por
  // recorrido o por key) y las demás siguen: desaparecen en una punta y salen por la otra.
  const frozen = new WeakMap(), frozenKey = new Map();
  D.flow = (ctx, pts, phase, col, { gap = 30, r = 4.5, key } = {}) => {
    const L = D.len(pts), off = ((phase % gap) + gap) % gap, byField = !!Sim.field;
    const hs = Sim.holdsOn(pts), store = key == null ? frozen : frozenKey, id = key ?? pts;
    if (!hs.length) store.delete(id); else if (!store.has(id)) store.set(id, phase);
    const dot = (d, i) => {
      const [x, y] = D.pointAt(pts, d), [jx, jy] = Sim.jitter(x, y, i);
      if (byField) ctx.fillStyle = Sim.particleColor(x, y, null, col);
      ctx.beginPath(); ctx.arc(x + jx, y + jy, r, 0, Math.PI * 2); ctx.fill();
    };
    ctx.fillStyle = col;
    for (let d = off, i = 0; d < L; d += gap, i++) if (!Sim.held(hs, d, L)) dot(d, i);
    if (!hs.length) return;
    const f = store.get(id);
    for (let d = ((f % gap) + gap) % gap, i = 0; d < L; d += gap, i++) if (Sim.held(hs, d, L)) dot(d, i);
  };
  // Tramos por donde no pasa corriente porque un multímetro en A los puentea: el banco pone aquí sus recorridos
  // ({ pts }). Sim.holdsOn(pts) da los pedazos [desde, hasta] de pts que caen en ellos (hasta puede pasar de su largo
  // si dan la vuelta a un recorrido cerrado) y Sim.held si d cae en uno.
  Sim.holds = [];
  Sim.holdsOn = pts => {
    if (!Sim.holds.length) return [];
    const L = D.len(pts), n = pts.length - 1, closed = Math.hypot(pts[0][0] - pts[n][0], pts[0][1] - pts[n][1]) < 1, out = [];
    for (const h of Sim.holds) {
      const hl = D.len(h.pts), [a, b, m] = [h.pts[0], h.pts[h.pts.length - 1], D.pointAt(h.pts, hl / 2)].map(q => D.project(pts, ...q));
      if (a.dist > 3 || b.dist > 3 || m.dist > 3) continue;
      const lo = Math.min(a.d, b.d), hi = Math.max(a.d, b.d);
      if (m.d >= lo && m.d <= hi) out.push([lo, hi]);
      else if (closed) out.push([hi, lo + L]);
    }
    return out;
  };
  Sim.held = (hs, d, L) => hs.some(([lo, hi]) => (d >= lo && d <= hi) || (d + L >= lo && d + L <= hi));
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
  // Seleccionado: el objeto cuya tarjeta está abierta lleva un contorno azul de 2 px (en pantalla), con
  // esquinas redondas; a (de 0 a 1, ver Sim.fadeSel) lo hace aparecer y desvanecerse.
  Sim.S = 1;
  D.select = (ctx, x, y, w, h, a = 1, r = 10) => {
    if (!(a > 0)) return;
    ctx.save(); ctx.globalAlpha *= a;
    D.roundRect(ctx, x, y, w, h, r, null, C.sel, 2 / Sim.S);
    ctx.restore();
  };
  // Lo mismo girado: un rectángulo de largo 2·hw y alto 2·hh centrado en (x, y) con ángulo ang.
  D.selectRot = (ctx, x, y, ang, hw, hh, a = 1, r = 10) => {
    if (!(a > 0)) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    D.select(ctx, -hw, -hh, 2 * hw, 2 * hh, a, r);
    ctx.restore();
  };
  // De 0 a 1 mientras on, de vuelta a 0 al apagarse: 120 ms de ida y de vuelta (con movimiento reducido,
  // de golpe). key: lo que se marca (cualquier objeto o texto).
  const fades = new Map();
  Sim.fadeSel = (key, on) => {
    const now = performance.now();
    let f = fades.get(key);
    if (!f) { f = { v: 0, t: now }; fades.set(key, f); }
    const d = Sim.REDUCE.matches ? 1 : (now - f.t) / 120;
    f.t = now;
    f.v = on ? Math.min(1, f.v + d) : Math.max(0, f.v - d);
    return f.v;
  };
  // Calor que se ve en el dibujo (ver Sim.heat): un resplandor naranja que crece con k (de 0 a 1).
  D.heatGlow = (ctx, x, y, k, rad = 52) => {
    if (!(k > 0)) return;
    const gr = ctx.createRadialGradient(x, y, 4, x, y, rad);
    gr.addColorStop(0, `rgba(255, 110, 30, ${0.75 * Math.min(1, k)})`); gr.addColorStop(1, 'rgba(255, 110, 30, 0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  };
  // Humo que sube (t: segundos desde que se quemó).
  D.smoke = (ctx, x, y, t) => {
    for (let k = 0; k < 4; k++) {
      const u = ((t * 0.5 + k / 4) % 1);
      D.circle(ctx, x + 6 * Math.sin(k * 2 + t), y - 50 * u, 4 + 10 * u, `rgba(110, 110, 110, ${0.35 * (1 - u)})`);
    }
  };
  // Resistencia quemada: tiznada, partida a la mitad y echando humo (se dibuja encima de D.resistor).
  D.burntResistor = (ctx, x, y, t, label = 'quemada') => {
    ctx.fillStyle = 'rgba(30, 20, 15, 0.55)'; ctx.beginPath(); ctx.ellipse(x, y, 24, 13, 0, 0, Math.PI * 2); ctx.fill();
    D.line(ctx, [[x - 3, y - 14], [x + 3, y - 4], [x - 3, y + 4], [x + 3, y + 14]], 6, C.card);
    if (label) D.text(ctx, label, x, y + 44, C.danger, { size: 14, bg: true });
    D.smoke(ctx, x, y - 12, t);
  };
  // Tramo angosto reventado (medio ancho hn): una grieta arriba y el agua que salpica al reventar.
  // Antes de reventar (k = calor, de 0 a 1, sin reventar todavía) gotea.
  D.burstPipe = (ctx, x, y, hn, t, burst, k = 0, label = 'tubo reventado') => {
    if (!burst) {
      if (k > 0.5) {
        const s = performance.now() / 1000;
        for (let j = 0; j < 3; j++) D.circle(ctx, x - 8 + 8 * j, y - Sim.PIPE - 4 - ((s * 40 + j * 11) % 14), 2, C.water);
      }
      return;
    }
    const h = hn + 5;
    D.line(ctx, [[x - 10, y - h], [x - 3, y - h + 5], [x + 3, y - h - 1], [x + 10, y - h + 4]], 3, C.danger);
    if (t < 1.2) {
      ctx.globalAlpha = Math.min(1, (1.2 - t) / 0.5);
      for (let j = 0; j < 14; j++) {
        const a = -Math.PI / 2 + ((j * 0.618) % 1 - 0.5) * 1.6, v = 120 + 160 * ((j * 0.383) % 1);
        D.circle(ctx, x + ((j * 0.27) % 1 - 0.5) * 16 + Math.cos(a) * v * t, y - h + Math.sin(a) * v * t + 250 * t * t, 3, C.water);
      }
      ctx.globalAlpha = 1;
    }
    if (label) D.text(ctx, label, x, y + 44, C.danger, { size: 14, bg: true });
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
  // Cuánto se aleja del centro de un letrero (de medio ancho hw y medio alto hh) su orilla en la dirección (c, s).
  D.reach = (c, s, hw, hh) => Math.min(Math.abs(c) > 1e-3 ? hw / Math.abs(c) : Infinity, Math.abs(s) > 1e-3 ? hh / Math.abs(s) : Infinity);
  // Escala alrededor de una perilla (de −135° a +135°, 0° arriba).
  D.knobScale = (ctx, x, y, r, labels, ticks = 12) => {
    ctx.lineWidth = 2; ctx.strokeStyle = C.muted;
    for (let i = 0; i <= ticks; i++) {
      const a = (-135 + i * 270 / ticks - 90) * Math.PI / 180, l = ticks === 12 && i % 6 ? 5 : 9;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a) * (r + l), y + Math.sin(a) * (r + l)); ctx.stroke();
    }
    // cada número afuera de su raya, a una distancia que depende de su tamaño (la letra nunca baja de 14 px);
    // los de abajo (los extremos), justo debajo de su raya, para no acercarse a la perilla de junto.
    // Devuelve la y de abajo de los números (para poner debajo el nombre de la perilla).
    let low = y + r + 9;
    labels.forEach(([t, frac]) => {
      const a = (-135 + frac * 270 - 90) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const px = D.font(ctx, 14, Sim.MONO, 500), w = ctx.measureText(t).width;
      const [lx, ly] = s > 0.5 ? [c * (r + 8), s * (r + 8) + px * 0.55] : [c, s].map(k => k * (r + 11 + D.reach(c, s, w / 2, px * 0.4)));
      D.text(ctx, t, x + lx, y + ly, C.muted, { size: 14, font: Sim.MONO, weight: 500 });
      low = Math.max(low, y + ly + px * 0.5);
    });
    return low;
  };
  // El nombre de una perilla debajo de sus números (low, lo que devuelve D.knobScale); t como en D.text.
  D.knobCaption = (ctx, t, x, low, max = 0) => D.text(ctx, t, x, low + 2 + Sim.px(14, ctx) * 0.55, C.muted, { size: 14, max });

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
  // cómo cambia su velocidad con la resistencia; la bomba sí gira a 100 rpm por mL/s.
  Sim.WHEEL_RPM_PER_MA = 4;
  // Rueda de molino dentro de la tubería (el LED del lado del agua). Gira con la corriente y tiene
  // una compuerta que solo deja pasar el agua hacia la derecha; rev = al revés, broken = rota.
  // tint: el color del LED que representa (un punto en el eje). sel: seleccionada (su nombre en azul).
  D.wheel = (ctx, x, y, { angle = 0, omega = 0, broken = false, rev = false, label = '', tint = null, sel = false, tag = true } = {}) => {
    D.circle(ctx, x, y, 30, C.metal, broken ? C.danger : C.ink, 2.5);
    D.circle(ctx, x, y, 24, C['water-soft']);
    if (broken) D.rotor(ctx, x, y, 7, 0.5, 0, 4, C.muted);   // solo quedan los muñones de las aspas
    else D.rotor(ctx, x, y, 19, angle, omega, 4, C.ink);
    if (tint) D.circle(ctx, x, y, 6.5, tint, C.ink, 2); else D.circle(ctx, x, y, 4, C.ink);
    D.arrow(ctx, x, y - 42, rev ? Math.PI : 0, 8, rev ? C.danger : C.muted);
    if (broken) {
      D.line(ctx, [[x - 15, y - 15], [x + 15, y + 15]], 4, C.danger);
      D.line(ctx, [[x + 15, y - 15], [x - 15, y + 15]], 4, C.danger);
    }
    const t = broken ? 'rueda rota' : rev ? 'compuerta cerrada' : label;
    if (t && tag) D.text(ctx, t, x, y + 48, broken || rev ? C.danger : sel ? C.sel : C.muted, { size: 15, bg: true });
  };
  // LED en un cable horizontal; I en mA decide el brillo. La corriente entra por la izquierda.
  D.ledSymbol = (ctx, x, y, { I = 0, broken = false, rev = false, label = 'LED', rgb = null, sel = false, tag = true } = {}) => {
    const dir = rev ? -1 : 1, [cr, cg, cb] = rgb || [255, 70, 50];   // rgb: el color de su luz (Sim.LEDS); apagado se ve un poco de ese color
    ctx.fillStyle = C.card; ctx.fillRect(x - 26, y - 26, 52, 52);
    const glow = broken ? 0 : Math.min(1, I / 30);   // brilla más con más corriente, hasta los 30 mA que aguanta
    if (glow > 0) {
      const g = ctx.createRadialGradient(x, y, 3, x, y, 40);
      g.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.75 * glow})`); g.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.fill();
    }
    D.line(ctx, [[x - 26, y], [x - 12, y]], 4, C.ink); D.line(ctx, [[x + 12, y], [x + 26, y]], 4, C.ink);
    ctx.beginPath(); ctx.moveTo(x - 12 * dir, y - 13); ctx.lineTo(x - 12 * dir, y + 13); ctx.lineTo(x + 11 * dir, y); ctx.closePath();
    ctx.fillStyle = !broken && glow > 0 ? `rgba(${cr}, ${cg}, ${cb}, ${0.3 + 0.7 * glow})` : rgb ? `rgba(${cr}, ${cg}, ${cb}, 0.16)` : C.card; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = broken ? C.muted : C.ink; ctx.lineJoin = 'miter'; ctx.stroke();
    D.line(ctx, [[x + 12 * dir, y - 13], [x + 12 * dir, y + 13]], 3, broken ? C.muted : C.ink);
    D.line(ctx, [[x + 3, y - 17], [x + 12, y - 26]], 2, C.muted); D.line(ctx, [[x + 11, y - 14], [x + 20, y - 23]], 2, C.muted);
    if (broken) { D.line(ctx, [[x - 13, y - 13], [x + 13, y + 13]], 4, C.danger); D.line(ctx, [[x + 13, y - 13], [x - 13, y + 13]], 4, C.danger); }
    const t = broken ? label + ' quemado' : rev ? label + ' al revés' : label;
    if (tag) D.text(ctx, t, x, y + 48, broken || rev ? C.danger : sel ? C.sel : C.muted, { size: 15, bg: true });
  };
  // Válvula en una tubería horizontal (tag: false, sin su letrero; la página pone su etiqueta).
  D.valve = (ctx, x, y, open, tag = true) => {
    D.circle(ctx, x, y, 19, C.metal, C.ink, 2.5);
    if (open) { ctx.fillStyle = C['water-soft']; ctx.fillRect(x - 16, y - 7, 32, 14); }
    else { ctx.fillStyle = C.danger; ctx.fillRect(x - 4, y - 17, 8, 34); }
    D.line(ctx, [[x, y - 19], [x, y - 32]], 4, C.ink);
    D.line(ctx, open ? [[x, y - 32], [x, y - 44]] : [[x - 13, y - 32], [x + 13, y - 32]], 6, C.ink);
    if (tag) D.text(ctx, open ? 'válvula abierta' : 'válvula cerrada', x, y + 48, open ? C.muted : C.danger, { size: 15, bg: true });
  };
  // Interruptor de cuchilla en un cable horizontal.
  D.knifeSwitch = (ctx, x, y, closed, tag = true) => {
    ctx.fillStyle = C.card; ctx.fillRect(x - 28, y - 30, 56, 40);
    D.circle(ctx, x - 22, y, 5, C.card, C.ink, 2.5); D.circle(ctx, x + 22, y, 5, C.card, C.ink, 2.5);
    D.line(ctx, closed ? [[x - 18, y], [x + 18, y]] : [[x - 18, y - 3], [x + 16, y - 26]], 3.5, C.ink);
    if (tag) D.text(ctx, closed ? 'interruptor cerrado' : 'interruptor abierto', x, y + 48, closed ? C.muted : C.danger, { size: 15, bg: true });
  };

  // ---------- medidores: ruedita con aguja y pantallita de siete segmentos ----------
  const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc',
    '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '', 'O': 'abcdef', 'L': 'def' };
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
    if (unit) D.font(ctx, 12, Sim.MONO, 500);
    const uw = unit ? ctx.measureText(unit).width + 6 : 0;
    // Si el número no cabe (un caudal o una corriente grande), los dígitos se achican para caber.
    const n = [...text.replace(/(.)\./g, '$1')].length, room = w - 14 - uw;
    D.segments(ctx, text, x + w / 2 - 8 - uw, y, Math.min(h * 0.58, room / (n * 0.84 - 0.32)));
    if (unit) D.text(ctx, unit, x + w / 2 - 6, y + h * 0.12, Sim.LCD.unit, { align: 'right', size: 12, font: Sim.MONO, weight: 500 });
  };
  // Número con ancho fijo para la pantallita (espacios a la izquierda).
  Sim.digits = (v, width, d) => {
    const s = Math.abs(v) < 0.5 * Math.pow(10, -d) ? (0).toFixed(d) : v.toFixed(d);
    return s.padStart(width + (d ? 1 : 0), ' ');
  };
  // Lectura de un medidor en 4 dígitos: los decimales se van quitando cuando el número crece,
  // así 9.99, 99.99, 999.9 y 1000 ocupan lo mismo en la pantallita.
  Sim.reading = v => { const a = Math.abs(v); return Sim.digits(v, 4, a < 99.995 ? 2 : a < 999.95 ? 1 : 0); };
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
    if (label) D.text(ctx, label, box[0] + box[2] / 2, box[1] + box[3] + 16, C.muted, { size: 15, bg: true });
    return box;
  };

  // ---------- instrumentos: una sola familia ----------
  // Chasis común de todos los instrumentos (bomba, fuente, multímetros, generador, osciloscopio, pila):
  // gris claro (gris pizarra en oscuro), borde de 2 px, radio 10, una banda de 6 px arriba azul (agua) o
  // ámbar (electricidad) y su nombre en Saira arriba a la izquierda (en azul si su tarjeta está abierta).
  Sim.CHASSIS = { r: 10, band: 6, name: 23 };   // radio, alto de la banda, altura del nombre desde arriba
  // name puede ser una lista de rótulos (del más largo al más corto): va el que cabe en nameMax.
  D.chassis = (ctx, x, y, w, h, water, name, sel = false, nameMax = 0) => {
    D.roundRect(ctx, x, y, w, h, Sim.CHASSIS.r, C.inst);
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, Sim.CHASSIS.r); ctx.clip();
    ctx.fillStyle = water ? C.water : C.charge; ctx.fillRect(x, y, w, Sim.CHASSIS.band);
    ctx.restore();
    D.roundRect(ctx, x, y, w, h, Sim.CHASSIS.r, null, C.ink, 2);
    if (name) D.text(ctx, name, x + 14, y + Sim.CHASSIS.name, sel ? C.sel : C.ink, { align: 'left', size: 14, font: Sim.WIDE, max: nameMax });
  };
  // Tecla física (la misma en todos los instrumentos): su base, la tapa (hundida con p = 1) y, si lleva,
  // su lucecita (led: encendida o no). off la deja tenue (no hace nada por ahora).
  D.key = (ctx, bx, by, w, h, p, off, led) => {
    ctx.save();
    if (off) ctx.globalAlpha *= 0.55;
    D.roundRect(ctx, bx - w / 2, by - h / 2 + 2, w, h, 4, '#1b242c');   // la base
    D.roundRect(ctx, bx - w / 2, by - h / 2 + p * 1.5, w, h - 1.5, 4, p ? '#8e9aa4' : '#a9b4bd', '#1b242c', 1.2);
    if (led != null) D.circle(ctx, bx + w / 2 - 3.5, by - h / 2 + 3.5 + p * 1.5, 1.8, led ? '#22e06b' : '#5b6670');
    ctx.restore();
  };

  // ---------- agua como partículas ----------
  // Cada partícula avanza según el volumen que pasa: donde la tubería se angosta, va más rápido.
  // Dentro de la tubería las del centro van más rápido que las de las orillas, como en un tubo real.
  // El color indica la rapidez: azul lento, rojo rápido.
  Sim.speedColor = t => `hsl(${Math.round(215 - 215 * Math.max(0, Math.min(1, t)))} 85% 50%)`;
  // Modo de color de las partículas (se recuerda en este navegador): 'v' rapidez, 'p' presión (voltaje)
  // en ese punto del circuito, 'q' caudal (corriente) que pasa por ese tramo. Para 'p' y 'q' el banco
  // pone en Sim.field(x, y) → [presión, caudal], cada uno de 0 a 1; sin él siempre es por rapidez.
  Sim.COLOR_MODES = ['v', 'p', 'q'];
  Sim.colorMode = (() => { try { const v = localStorage.getItem('sim-color'); return Sim.COLOR_MODES.includes(v) ? v : 'v'; } catch (e) { return 'v'; } })();
  Sim.setColorMode = k => { Sim.colorMode = k; try { localStorage.setItem('sim-color', k); } catch (e) {} };
  // Mientras se arrastra una punta el banco pone aquí el modo de lo que mide ('p' o 'q'); al soltarla, null.
  Sim.colorOverride = null;
  Sim.shownColorMode = () => Sim.colorOverride || Sim.colorMode;
  Sim.field = null;
  // Al cambiar de modo los colores pasan de uno a otro en FADE segundos. Entre dos escalas (rapidez,
  // presión, caudal) se recorre la escala de colores; si un lado es el color fijo de las cargas, se mezclan.
  const FADE = 0.5, fade = { from: null, to: null, t0: 0 };
  const hue = t => 215 - 215 * Math.max(0, Math.min(1, t));
  const rgbOf = c => {
    if (typeof c === 'number') {   // hsl(c 85% 50%)
      const a = 0.85 * 0.5, f = n => { const k = (n + c / 30) % 12; return 0.5 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
      return [f(0) * 255, f(8) * 255, f(4) * 255];
    }
    const m = /^#?([0-9a-f]{6})$/i.exec(c || '');
    return m ? [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16)) : [128, 128, 128];
  };
  // Lo que marca cada modo en esa partícula (de 0 a 1), o null si va del color fijo.
  const valueIn = (mode, x, y, speed) => mode === 'v' || !Sim.field ? speed ?? null : Sim.field(x, y)[mode === 'p' ? 0 : 1];
  // Color de una partícula en (x, y); speed es su rapidez de 0 a 1 (null en las cargas eléctricas, que en
  // modo rapidez van de su color fijo base).
  Sim.particleColor = (x, y, speed, base = null) => {
    const to = Sim.shownColorMode(), now = performance.now() / 1000;
    if (to !== fade.to) { fade.from = fade.to ?? to; fade.to = to; fade.t0 = now; }
    const u = Math.min(1, (now - fade.t0) / FADE), k = u * u * (3 - 2 * u);
    const b = valueIn(to, x, y, speed);
    if (k >= 1 || fade.from === to) return b == null ? base : Sim.speedColor(b);
    const a = valueIn(fade.from, x, y, speed);
    if (a != null && b != null) return Sim.speedColor(a + (b - a) * k);
    const [p, q] = [a == null ? base : hue(a), b == null ? base : hue(b)].map(rgbOf);
    return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * k)).join(',')})`;
  };
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
    // volumen hasta la distancia d
    const volAt = d => { const t = Math.max(0, Math.min(N, d / ds)), i = Math.min(N - 1, Math.floor(t)); return Vs[i] + (Vs[i + 1] - Vs[i]) * (t - i); };
    const mod = v => ((v % VT) + VT) % VT;
    let rate = 0;
    return {
      parts, setProfile,
      // flow: caudal en unidades de "rapidez media en la tubería normal" (unidades de dibujo por segundo). En un
      // tramo puenteado (Sim.holds) el agua se queda quieta y la que llega a él sale por el otro lado, como si
      // pasara por el medidor.
      step(flow, dt) {
        rate = flow * Sim.PIPE;
        const hs = Sim.holdsOn(pts).map(([lo, hi]) => { const a = volAt(lo); return [a, hi > L ? VT + volAt(hi - L) : volAt(hi)]; });
        for (const p of parts) {
          const dv = rate * p.u * dt;
          p.held = hs.some(([a, b]) => mod(p.v - a) < b - a);
          if (p.held) continue;
          let v = p.v + dv;
          for (const [a, b] of hs) {
            if (dv > 0 && mod(a - p.v) < dv) v += b - a;
            else if (dv < 0 && mod(p.v - b) < -dv) v -= b - a;
          }
          p.v = mod(v);
        }
      },
      draw(ctx, r = radius) {
        parts.forEach((p, i) => {
          const [d, h] = locate(p.v);
          const [x, y, tx, ty] = D.frameAt(pts, d);
          const off = p.f * h, [jx, jy, js] = Sim.jitter(x, y, i);
          ctx.fillStyle = Sim.particleColor(x, y, Math.max(p.held ? 0 : Math.abs(rate * p.u / h), js) / vmax);
          ctx.beginPath(); ctx.arc(x - ty * off + jx, y + tx * off + jy, r, 0, Math.PI * 2); ctx.fill();
        });
      }
    };
  };
  // Agua en un tramo abierto (una rama del circuito): partículas en carriles (las del centro más rápidas), que
  // avanzan según el volumen que pasa y salen por un extremo mientras entran por el otro. draw(ctx, ph, flow):
  // ph es lo que ha avanzado el agua (en px de tubería normal) y flow su rapidez (px/s, para el color). Un
  // capacitor no deja pasar el agua: en su rama el agua solo va y viene lo que se estira la membrana.
  Sim.stream = (pts, halfAt = () => Sim.PIPE) => {
    const L = D.len(pts), N = Math.max(2, Math.ceil(L / 2)), ds = L / N;
    const Hs = new Float32Array(N + 1), Vs = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) { Hs[i] = halfAt(i * ds); if (i) Vs[i] = Vs[i - 1] + (Hs[i] + Hs[i - 1]) / 2 * ds; }
    const VT = Vs[N];
    const locate = v => {
      let lo = 0, hi = N;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (Vs[m] <= v) lo = m; else hi = m; }
      const span = Vs[hi] - Vs[lo];
      return [lo * ds + (span ? (v - Vs[lo]) / span : 0) * ds, Hs[lo]];
    };
    return {
      draw(ctx, ph, flow) {
        const lanes = Sim.compact ? [-0.6, 0, 0.6] : [-0.72, -0.36, 0, 0.36, 0.72];
        const sp = (Sim.compact ? 21 : 14) * Sim.PIPE, r = Sim.compact ? 3.8 : 2.8;
        const mean = lanes.reduce((a, f) => a + 1 - f * f, 0) / lanes.length;
        const n = Math.max(1, Math.round(VT / sp)), s = VT / n;
        let i = 0;
        lanes.forEach((f, j) => {
          const u = (1 - f * f) / mean, shift = ph * Sim.PIPE * u;
          for (let k = 0; k < n; k++, i++) {
            let v = ((k + (j % 2) * 0.5) * s + shift) % VT; if (v < 0) v += VT;
            const [d, h] = locate(v), [x, y, tx, ty] = D.frameAt(pts, d), off = f * h;
            const [jx, jy, js] = Sim.jitter(x, y, i);
            ctx.fillStyle = Sim.particleColor(x, y, Math.max(Math.abs(flow * Sim.PIPE * u / h), js) / 200);
            ctx.beginPath(); ctx.arc(x - ty * off + jx, y + tx * off + jy, r, 0, Math.PI * 2); ctx.fill();
          }
        });
      }
    };
  };

  // En el celular, el menú chico de los instrumentos de la página, abajo de cada panel (el dibujo le deja su franja,
  // p.inset): tocar uno lo abre, grande y con todos sus mandos, y los demás se guardan; tocarlo otra vez lo cierra y
  // se ven todos en su versión corta. panels: { w, e }; items(side) → [[clave, nombre], …]; get() → la clave del
  // abierto (o null); set(clave o null). Devuelve sync(), que vuelve a poner sus nombres y cuál está abierto.
  Sim.INSET = 56;   // px que deja libres abajo del panel
  Sim.instMenu = (panels, { items, get, set }) => {
    const els = ['w', 'e'].map(side => {
      const el = document.createElement('div'), q = panels[side];
      el.className = 'sim-seg sim-inst'; el.setAttribute('role', 'group');
      el.setAttribute('aria-label', 'Instrumentos: tocar uno lo abre y guarda los demás');
      el.addEventListener('click', e => {
        const bt = e.target.closest('button');
        if (bt) set(get() === bt.dataset.k ? null : bt.dataset.k);
      });
      q.box.appendChild(el);
      q.inset = () => Sim.phone ? Sim.INSET : 0;
      q.refit();
      return [el, side];
    });
    const sync = () => els.forEach(([el, side]) => {
      const list = items(side), open = get();
      if (el.dataset.keys !== list.map(([k, t]) => k + t).join()) {
        el.dataset.keys = list.map(([k, t]) => k + t).join();
        el.innerHTML = list.map(([k, t]) => `<button type="button" data-k="${k}">${t}</button>`).join('');
      }
      el.querySelectorAll('button').forEach(bt => {
        const on = bt.dataset.k === open;
        bt.setAttribute('aria-pressed', String(on));
        bt.setAttribute('aria-label', (on ? 'Cerrar ' : 'Abrir ') + bt.textContent.toLowerCase());
      });
    });
    sync();
    return sync;
  };

  // Selector del color de las partículas, en cada panel: un selector pequeño con el nombre de cada modo
  // (rapidez · presión · caudal; en la electricidad normal · voltaje · corriente) y debajo la escala de colores,
  // que solo es información (no se toca). En la electricidad, con el modo normal las cargas van de su color de
  // siempre: en vez de la barra dice que todas van del mismo color. panels: { w, e } (Sim.panel).
  //   ends(side) → [lo, hi]: lo que dicen las puntas de la escala en el modo que se ve
  //   spot(side) → [x, y]: en el dibujo, dónde va su esquina de arriba a la derecha
  //   top: deja que use el lugar libre arriba del dibujo si a la derecha no hay (true, o un número: cuánto de
  //        arriba del dibujo también está libre, en unidades del dibujo)
  // Si a la derecha del dibujo hay lugar, va hasta la esquina de arriba a la derecha del panel. Devuelve
  // sync(), que vuelve a marcar el modo y las puntas de la escala (llamarla si cambian).
  const COLOR_NAMES = { w: ['rapidez', 'presión', 'caudal'], e: ['normal', 'voltaje', 'corriente'] };
  Sim.colorPicker = (panels, { ends, spot, top = false }) => {
    const els = ['w', 'e'].map(side => {
      const el = document.createElement('div'), q = panels[side];
      el.className = 'sim-colors'; el.dataset.act = 'ver';
      el.innerHTML = '<div class="sim-seg mini" role="group" aria-label="Color de las partículas">' +
        COLOR_NAMES[side].map((t, k) => `<button type="button" data-k="${k}">${t}</button>`).join('') + '</div>' +
        '<div class="scale" aria-hidden="true"><span></span><div class="bar"></div><span></span></div><div class="plain">todas del mismo color</div>';
      el.querySelectorAll('button').forEach(bt => bt.addEventListener('click', () => { Sim.setColorMode(Sim.COLOR_MODES[+bt.dataset.k]); sync(); }));
      const corner = () => {
        const bw = q.box.clientWidth || (q.mirror && q.mirror.box.clientWidth) || 0;
        const free = bw - (q.ox + (q.x0 + q.W) * q.scale), wpx = Math.max(210, q.scale * 240);
        const room = free >= wpx + 24 || (top !== false && q.oy + (+top || 0) * q.scale >= (el.offsetHeight || 60) + 16);
        return room ? [(bw - 16 - q.ox) / q.scale, (12 - q.oy) / q.scale] : spot(side);
      };
      q.box.querySelector('.sim-layer').appendChild(el);
      q.at(el, corner);
      return { side, el };
    });
    const sync = () => {
      const k = Sim.COLOR_MODES.indexOf(Sim.colorMode), m = Sim.COLOR_MODES.indexOf(Sim.shownColorMode());
      els.forEach(({ side, el }) => {
        el.dataset.bar = String(side === 'w' || m > 0);
        el.querySelectorAll('.scale span').forEach((sp, j) => { sp.textContent = ends(side)[j]; });
        el.querySelectorAll('button').forEach((bt, j) => bt.setAttribute('aria-pressed', String(j === k)));
      });
    };
    sync();
    return sync;
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

  // ---------- interruptor de encendido ----------
  // Contenido de un botón .sim-power: palanca con ON arriba y OFF abajo (aria-pressed dice si está encendido).
  Sim.SWITCH = '<span class="sw-on" aria-hidden="true">ON</span><span class="sw-track" aria-hidden="true"><span class="sw-thumb"></span></span><span class="sw-off" aria-hidden="true">OFF</span>';

  // ---------- perilla ----------
  // el: un elemento vacío; se le agrega la tapa con su marca. Se gira arrastrando, con la rueda del ratón o con las flechas.
  // Imán: la perilla se queda en su valor hasta que el puntero se pasa bien hacia el siguiente (mientras,
  // solo se estira un poquito hacia él, como jalada por un imán), y los valores redondos (múltiplos de
  // magnet) jalan desde más lejos; al cambiar de valor salta con un giro con rebote (y en el celular, una
  // vibración mínima), como si tuviera muescas. Cerca de su valor hay una zona muerta: ahí ni se estira.
  Sim.DEAD = { knob: 4, range: 0.2, drag: 6 };   // perillas: grados; sliders: fracción de un paso; arrastrar: px
  const dead = (d, z) => Math.sign(d) * Math.max(0, Math.abs(d) - z);
  Sim.knob = (el, { min, max, step, value, label, format, onInput, magnet = 0 }) => {
    el.classList.add('knob');
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', label);
    el.setAttribute('aria-valuemin', min);
    el.setAttribute('aria-valuemax', max);
    el.innerHTML = '<div class="knob-cap"><span class="knob-mark"></span></div>';
    const cap = el.firstChild;
    const k = { value: min };
    const angle = v => -135 + 270 * (v - min) / (max - min);
    // quiet = true cambia la perilla sin avisar (para perillas enlazadas).
    k.set = (v, quiet) => {
      v = Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
      k.value = v;
      cap.style.transform = `rotate(${angle(v)}deg)`;
      el.setAttribute('aria-valuenow', v);
      el.setAttribute('aria-valuetext', format ? format(v) : String(v));
      if (!quiet && onInput) onInput(v);
    };
    const fromPointer = e => {
      const r = el.getBoundingClientRect();
      let a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
      a = Math.max(-135, Math.min(135, a));
      let v = min + (a + 135) / 270 * (max - min);
      if (magnet) { const m = Math.round(v / magnet) * magnet; if (Math.abs(v - m) < 0.38 * magnet && m >= min && m <= max) v = m; }
      const old = k.value;
      if (Math.abs(v - k.value) >= 0.9 * step) k.set(v);   // si no, todavía pegada a su valor
      if (k.value !== old && e.pointerType === 'touch' && navigator.vibrate) try { navigator.vibrate(6); } catch (err) {}
      const pull = Math.max(-7, Math.min(7, 0.3 * dead(a - angle(k.value), Sim.DEAD.knob)));   // el estirón hacia el puntero
      cap.style.transform = `rotate(${angle(k.value) + pull}deg)`;
    };
    const release = () => { cap.style.transform = `rotate(${angle(k.value)}deg)`; };
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); el.focus(); fromPointer(e); e.preventDefault(); });
    el.addEventListener('pointermove', e => { if (el.hasPointerCapture(e.pointerId)) fromPointer(e); });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
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
  // Codificador sin fin (la perilla del generador): no tiene tope ni escala; cada muesca (det grados) es un
  // paso, a la derecha sube y a la izquierda baja. Se gira arrastrando alrededor de su centro, con la rueda del
  // ratón o con las flechas; entre muesca y muesca solo se estira un poco (con su zona muerta), como la perilla.
  // turn(n) recibe los pasos; label() y text() lo que dice al lector de pantalla. e.sync() los actualiza.
  Sim.encoder = (el, { label, text, turn, det = 18 }) => {
    el.classList.add('knob', 'encoder');
    el.tabIndex = 0;
    el.setAttribute('role', 'spinbutton');
    el.innerHTML = '<div class="knob-cap"><span class="knob-face"><span class="knob-dimple"></span></span></div>';
    const cap = el.firstChild;
    let rot = 0, last = null, acc = 0;
    const show = (pull = 0) => { cap.style.transform = `rotate(${rot + pull}deg)`; };
    const e = { sync: () => { el.setAttribute('aria-label', label()); el.setAttribute('aria-valuetext', text()); } };
    const step = (n, touch) => {
      rot += n * det; show(); turn(n); e.sync();
      if (touch && navigator.vibrate) try { navigator.vibrate(6); } catch (err) {}
    };
    const angle = ev => {
      const r = el.getBoundingClientRect();
      return Math.atan2(ev.clientX - (r.left + r.width / 2), -(ev.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
    };
    el.addEventListener('pointerdown', ev => { el.setPointerCapture(ev.pointerId); el.focus(); last = angle(ev); acc = 0; ev.preventDefault(); });
    el.addEventListener('pointermove', ev => {
      if (!el.hasPointerCapture(ev.pointerId)) return;
      const a = angle(ev);
      acc += ((a - last + 540) % 360) - 180; last = a;
      while (acc >= det) { acc -= det; step(1, ev.pointerType === 'touch'); }
      while (acc <= -det) { acc += det; step(-1, ev.pointerType === 'touch'); }
      show(Math.max(-7, Math.min(7, 0.3 * dead(acc, Sim.DEAD.knob))));
    });
    const release = () => { acc = 0; show(); };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('wheel', ev => { ev.preventDefault(); step(ev.deltaY < 0 ? 1 : -1); }, { passive: false });
    el.addEventListener('keydown', ev => {
      const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[ev.key];
      if (d) { step(d); ev.preventDefault(); }
    });
    show(); e.sync();
    return e;
  };

  // Imán para un slider (input range): se queda pegado a su valor (solo se estira un poco hacia el dedo)
  // hasta que el puntero se pasa bien hacia el siguiente, y entonces salta con un pequeño latido (y en el
  // celular, una vibración mínima). Los múltiplos de magnet jalan desde más lejos. Muy cerca de su valor
  // (la zona muerta) no se mueve nada. Se llama antes de
  // agregarle al slider sus otros 'input', que solo se enteran cuando de verdad cambia de valor.
  Sim.snapRange = (inp, { step = +inp.step || 1, magnet = 0 } = {}) => {
    const min = +inp.min, max = +inp.max;
    const q = v => +Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min)).toFixed(6);
    let cur = q(+inp.value), touch = false, beat = 0;
    inp.step = 'any';
    const grab = e => { cur = q(+inp.value); touch = e && e.pointerType === 'touch'; };
    inp.addEventListener('pointerdown', grab);
    inp.addEventListener('focus', () => grab());
    inp.addEventListener('input', e => {
      const v = +inp.value;
      let n = Math.abs(v - cur) < 0.9 * step ? cur : q(v);
      if (magnet) { const m = Math.round(v / magnet) * magnet; if (Math.abs(v - m) < 0.38 * magnet && m >= min && m <= max) n = q(m); }
      if (n === cur) { inp.value = cur + 0.25 * dead(v - cur, Sim.DEAD.range * step); e.stopImmediatePropagation(); return; }
      cur = n; inp.value = n;
      inp.classList.remove('snap-a', 'snap-b'); inp.classList.add(beat++ % 2 ? 'snap-a' : 'snap-b');
      if (touch && navigator.vibrate) try { navigator.vibrate(6); } catch (err) {}
    });
    const settle = () => { inp.value = cur = q(+inp.value); };
    inp.addEventListener('change', settle);
    inp.addEventListener('pointerup', () => { inp.value = cur; });
    // con step 'any' las flechas moverían casi nada: van de un valor al siguiente
    const nudge = d => {
      cur = q(+inp.value);
      inp.value = q(cur + d * step);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    };
    inp.addEventListener('keydown', e => {
      const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); nudge(d); }
    });
    // la rueda del ratón lo mueve un valor por vuelta, como a las perillas
    inp.addEventListener('wheel', e => { e.preventDefault(); touch = false; nudge(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    return inp;
  };

  // ---------- animación ----------
  Sim.run = fn => {
    let last = performance.now();
    const frame = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      requestAnimationFrame(frame);   // primero: si algo falla en un cuadro, la animación no se queda trabada
      Sim.readColors();
      fn(dt);
    };
    Sim.readColors();
    requestAnimationFrame(frame);
  };

  // Movimiento de la interfaz (menús, hojas): curvas que arrancan rápido y frenan suave. Con «reducir
  // movimiento» en el sistema, las cosas solo aparecen y desaparecen (sin deslizarse). La simulación no
  // cambia: las partículas son la física.
  Sim.REDUCE = matchMedia('(prefers-reduced-motion: reduce)');
  Sim.EASE = { out: 'cubic-bezier(0.23, 1, 0.32, 1)', drawer: 'cubic-bezier(0.32, 0.72, 0, 1)' };
  // Arrastrar una hoja hacia donde se esconde la cierra: basta un tirón rápido o pasar la mitad. Hacia el
  // otro lado se resiste (cada vez se mueve menos). handle: de dónde se agarra; el: lo que se mueve;
  // axis 'x' (se esconde a la derecha) o 'y' (abajo), o una función que lo diga; when(): si ahora se puede;
  // close(transform actual).
  Sim.swipeClose = (handle, el, axis, when, close) => {
    let s = null;
    const ax = () => typeof axis === 'function' ? axis() : axis;
    const pos = e => s.ax === 'y' ? e.clientY : e.clientX;
    const move = d => `translate${s.ax.toUpperCase()}(${d}px)`;
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', e => {
      if (s || !when() || e.button > 0 || e.target.closest('button, input, a')) return;   // los botones siguen siendo botones
      s = { ax: ax(), id: e.pointerId, lt: e.timeStamp, v: 0, d: 0 };
      s.p0 = s.lp = pos(e);
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', e => {
      if (!s || e.pointerId !== s.id) return;   // un solo dedo
      const p = pos(e), dt = e.timeStamp - s.lt;
      if (dt > 0) { s.v = 0.6 * (p - s.lp) / dt + 0.4 * s.v; s.lp = p; s.lt = e.timeStamp; }
      const raw = p - s.p0;
      s.d = raw >= 0 ? raw : 0.5 * raw / (1 - raw / 50);   // hacia dentro: a lo más unos 25 px
      el.style.transition = 'none';
      el.style.transform = move(s.d);
    });
    const end = e => {
      if (!s || e.pointerId !== s.id) return;
      const { d, v } = s, size = s.ax === 'y' ? el.offsetHeight : el.offsetWidth, from = el.style.transform;
      s = null;
      if (!from) return;
      el.style.transform = '';
      if (d > size / 2 || (v > 0.11 && d > 8)) { el.style.transition = ''; close(from); return; }
      el.animate([{ transform: from }, { transform: 'none' }], { duration: Sim.REDUCE.matches ? 0 : 260, easing: Sim.EASE.drawer })
        .finished.finally(() => { el.style.transition = ''; });
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  // ---------- acciones: la barra de arriba y la columna de controles ----------
  // Todo lo que se toca pertenece a una acción, con su color y su lugar fijo en todas las páginas:
  //   com  Cambiar componentes (verde)   med  Medir (morado)          ali  Alimentar (ámbar, solo en el instrumento)
  //   arm  Armar (protoboard)            ver  Ver (azul)              avanzar: pasos y simulaciones, en la barra.
  // Componentes, Medir, Armar y Ver van en una columna a la derecha en la computadora (Sim.side) y, en el
  // celular o una ventana angosta, en una hoja que se abre con el botón de controles de la barra.
  Sim.ACTS = {
    com: ['Cambiar componentes', 'Cambiar', '<path d="M2 12h4l2-5 4 10 4-10 2 5h4"/>'],
    med: ['Medir', 'Medir', '<circle cx="12" cy="13" r="8"/><path d="M12 13l4-4"/>'],
    arm: ['Armar', 'Armar', '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" stroke-width="3.4"/>'],
    ver: ['Ver', 'Ver', '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'],
    ali: ['Alimentar', 'Alimentar', '<path d="M12 3v9"/><path d="M6.3 7.3a8 8 0 1 0 11.4 0"/>']
  };
  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const chev = d => svg(d < 0 ? '<path d="M15 5l-7 7 7 7"/>' : '<path d="M9 5l7 7-7 7"/>');
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const store = {
    get: (k, ok, def) => { try { const v = localStorage.getItem(k); return ok.includes(v) ? v : def; } catch (e) { return def; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const page = document.querySelector('.sim-page'), bar = document.querySelector('.sim-bar'), stage = document.querySelector('.sim-stage');
  // Celular: pantalla angosta o acostada (la barra va en un renglón y los controles en una hoja).
  const phoneQ = matchMedia('(max-width: 600px), (max-height: 500px)');
  const colQ = matchMedia('(min-width: 1100px) and (min-height: 560px)');
  // en vivo: una ventana que se angosta (o se gira) después de cargar también cuenta como celular
  Object.defineProperty(Sim, 'phone', { get: () => phoneQ.matches });

  // A qué acción pertenece un control del dibujo (data-act manda).
  Sim.actOf = e => e.dataset.act || (e.matches('.sim-clamp, .sim-meter-hit, .sim-meter-btn') ? 'med'
    : e.matches('.sim-power, .knob, .sim-wave') ? 'ali' : 'com');
  // Nombre corto de un control para su globito: lo que dice antes de los dos puntos.
  const tipName = e => (e.getAttribute('aria-label') || e.textContent || '').split(':')[0].trim();

  // Barra en tres zonas: dónde estoy (← · título con «Simulación N de 9» · pasos con nombre), qué miro
  // (vista · Controles) y a dónde voy ([‹ · Siguiente ›], un solo botón principal que dice
  // a dónde lleva). En el celular vertical, [‹ · dónde estoy · Siguiente ›] baja a una barra pegada abajo,
  // al alcance del pulgar, y la vista queda como pestañas Agua | Electricidad debajo del título.
  const foot = bar && el('div', 'sim-foot');
  // Lo de adentro de una flecha: la de atrás es solo la flecha; la de adelante dice a dónde lleva
  // («Paso 2 · La fuente» o «Siguiente · 4 Resistencias…»).
  Sim.goHTML = (cls, what, name) => cls === 'prev' ? `<span class="arr">${chev(-1)}</span>`
    : `<span class="lbl"><span class="stp">${what}</span><span class="name"> · ${name}</span></span><span class="arr">${chev(1)}</span>`;
  // Palomita de un paso cumplido (Sim.steps).
  const CHECK = '<svg class="ok" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7"/></svg>';
  Sim.ORDER = [
    ['voltaje-concepto', 'Voltaje = presión'],
    ['corriente-concepto', 'Corriente = caudal'],
    ['resistencia-concepto', 'Resistencia'],
    ['nodos', 'Nodos'],
    ['protoboard', 'Protoboard'],
    ['como-medir', 'Cómo medir'],
    ['resistencia', 'Ley de Ohm'],
    ['interruptor-led', 'Interruptor y LED'],
    ['serie-paralelo', 'LEDs en serie y paralelo'],
    ['capacitores', 'Capacitores'],
    ['osciloscopio', 'LED y osciloscopio'],
    ['osciloscopio-rc', 'Carga y descarga RC'],
    ['osciloscopio-diodo', 'Diodo 1N4007'],
    ['osciloscopio-rectificador', 'Rectificador de media onda'],
    ['osciloscopio-onda-completa', 'Rectificador de onda completa']
  ];
  const here = /\/simulaciones\/([^/]+)\//.exec(location.pathname);
  const cur = here ? Sim.ORDER.findIndex(s => s[0] === here[1]) : -1;
  // «Seguir donde te quedaste» de la página de inicio: la última simulación abierta y, si tiene pasos, el
  // paso en que va (Sim.steps lo pone al cambiar de paso).
  Sim.last = s => { if (cur >= 0) try { localStorage.setItem('sim-last', JSON.stringify({ p: Sim.ORDER[cur][0], ...s })); } catch (e) {} };
  Sim.last({});
  if (foot) {
    const N = Sim.ORDER.length;
    const link = (j, cls) => {
      const s = cur >= 0 && Sim.ORDER[j];
      if (!s) return `<span class="sim-go ${cls}" aria-hidden="true"></span>`;
      const what = (cls === 'prev' ? 'Simulación anterior' : 'Siguiente simulación') + `: ${j + 1}. ${s[1]}`;
      return `<a class="sim-go ${cls}" href="../${s[0]}/" title="${what}" aria-label="${what}">` + Sim.goHTML(cls, 'Siguiente', `${j + 1} ${s[1]}`) + '</a>';
    };
    foot.innerHTML = link(cur - 1, 'prev') +
      `<span class="sim-where" aria-live="polite"><span class="k">${cur >= 0 ? `Simulación ${cur + 1} de ${N}` : ''}</span><b class="nm"></b></span>` +
      link(cur + 1, 'next');
    foot.setAttribute('role', 'navigation'); foot.setAttribute('aria-label', 'Pasos y simulaciones');
    // El título dice cuál es de las N, así que ningún número queda suelto.
    const h1 = bar.querySelector('h1');
    if (h1 && cur >= 0) {
      const t = el('div', 'sim-title', `<span class="of">Simulación ${cur + 1} de ${N}</span>`);
      h1.replaceWith(t); t.appendChild(h1);
    }
    bar.appendChild(foot);
  }

  // ---------- columna (u hoja) de controles ----------
  Sim.side = (() => {
    if (!page || !bar) return null;
    const box = el('aside', 'sim-side');
    box.id = 'simSide'; box.setAttribute('aria-label', 'Controles');
    box.innerHTML = '<div class="sim-side-hd"><h2>Controles</h2><button type="button" class="x" aria-label="Cerrar los controles">×</button></div>';
    const secs = {};
    ['com', 'arm', 'ver', 'med'].forEach(k => {   // Medir al final
      const s = el('section', 'sim-sec', `<h3>${svg(Sim.ACTS[k][2])}<span>${Sim.ACTS[k][0]}</span></h3><div class="body"></div>`);
      s.dataset.act = k; s.hidden = true;
      box.appendChild(s); secs[k] = s;
    });
    const scrim = el('div', 'sim-scrim');
    page.append(box, scrim);
    // Botón de la barra: Controles.
    const btn = el('button', 'sim-ctl-btn', svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>') + '<span class="t">Controles</span>');
    btn.type = 'button'; btn.setAttribute('aria-controls', 'simSide'); btn.setAttribute('aria-label', 'Controles');
    bar.insertBefore(btn, foot && foot.parentNode === bar ? foot : null);

    // col: columna fija (se puede esconder, y se recuerda); sheet: hoja que se abre y se cierra.
    let open = store.get('sim-side', ['0', '1'], '1') === '1';
    const mode = () => colQ.matches ? 'col' : 'sheet';
    const sync = () => {
      const m = mode();
      page.dataset.side = m;
      const shown = m === 'col' ? open : sheetOpen;
      page.dataset.open = String(shown);
      btn.setAttribute('aria-expanded', String(shown));
      btn.title = shown ? 'Esconder los controles' : 'Mostrar los controles';
    };
    let sheetOpen = false;
    const setSheet = v => { sheetOpen = v; sync(); if (v) box.scrollTop = 0; };
    btn.addEventListener('click', () => {
      if (mode() === 'col') { open = !open; store.set('sim-side', open ? '1' : '0'); sync(); }
      else setSheet(!sheetOpen);
    });
    box.querySelector('.x').addEventListener('click', () => { if (mode() === 'col') { open = false; store.set('sim-side', '0'); sync(); } else setSheet(false); });
    scrim.addEventListener('click', () => setSheet(false));
    Sim.swipeClose(box.querySelector('.sim-side-hd'), box, () => phoneQ.matches ? 'y' : 'x', () => mode() === 'sheet' && sheetOpen, () => setSheet(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen) setSheet(false); });
    colQ.addEventListener('change', sync);
    sync();

    const side = {
      el: box,
      // El cuerpo de la sección de una acción (aparece en cuanto tiene algo).
      sec: k => { secs[k].hidden = false; return secs[k].querySelector('.body'); },
      // ¿Los menús de los componentes van en la columna?
      docked: () => mode() === 'col' && open,
      close: () => setSheet(false),
      isSheet: () => mode() === 'sheet'
    };
    // Lista de componentes: un renglón por componente con su nombre y su valor; tocarlo abre su menú
    // (el mismo que al tocarlo en el dibujo). anchor() es el componente en el panel que se ve. Si varios
    // componentes comparten anchor (la protoboard), isOpen() dice si su tarjeta es la abierta y toggle()
    // la abre o la cierra. remove() quita el renglón.
    const parts = [];
    let list = null, cards = null;
    side.cards = () => { comBody(); return cards; };   // también en páginas sin lista (la protoboard)
    const comBody = () => {
      if (!list) {
        const b = side.sec('com');
        list = el('div', 'sim-parts'); cards = el('div', 'sim-side-cards');
        b.prepend(list); b.appendChild(cards);
      }
      return list;
    };
    // visible(): si el renglón se ve; sin él, se ve si su marcador (anchor) está en el dibujo.
    side.part = ({ anchor, menu, isOpen, toggle, visible }) => {
      const row = el('button', 'sim-part', '<span class="nm"></span><span class="vl"></span>');
      row.type = 'button';
      comBody().appendChild(row);
      const p = { row, anchor, menu, visible, isOpen: isOpen || (() => Sim.menu.isOpen(anchor())) };
      row.addEventListener('click', () => {
        if (side.isSheet()) setSheet(false);
        if (toggle) toggle(); else Sim.menu.toggle(anchor(), menu());
      });
      p.remove = () => { row.remove(); parts.splice(parts.indexOf(p), 1); };
      parts.push(p);
      setTimeout(syncParts);   // después de que la página termine de armarse (su menú puede usar lo que sigue)
      return p;
    };
    // Lo que muestra el menú en su primer renglón (el valor del slider o la opción elegida).
    const shown = o => {
      const r = o.rows.find(r => r.values || r.options);
      if (!r) return '';
      if (r.values) return r.format(r.get());
      const op = r.options.find(x => x.value === r.get());
      return op ? op.text : '';
    };
    const syncParts = () => parts.forEach(p => { try {
      const a = p.anchor(), o = p.menu(), pb = a.closest('.sim-panel');
      const r = a.getBoundingClientRect(), q = pb && pb.getBoundingClientRect();
      // escondido, o fuera del dibujo (un componente que no está en este acomodo)
      p.row.hidden = p.visible ? !p.visible() : a.hidden || (q && q.width > 0 && (r.right < q.left || r.left > q.right || r.bottom < q.top || r.top > q.bottom));
      const t = typeof o.title === 'function' ? o.title() : o.title;
      p.row.querySelector('.nm').textContent = t;
      p.row.querySelector('.vl').textContent = shown(o);
      p.row.setAttribute('aria-expanded', String(p.isOpen()));
      p.row.setAttribute('aria-label', `${t}: ${shown(o)}. Cambiarlo`);
    } catch (e) { p.row.hidden = true; } });
    setInterval(syncParts, 250);
    // Botón en una sección (texto y si se ve pueden cambiar: b.refresh o quien lo use los actualiza).
    side.button = (k, text, onClick) => {
      const b = el('button', 'sim-side-btn', text);
      b.type = 'button'; b.addEventListener('click', onClick);
      (k === 'com' ? comBody().parentNode : side.sec(k)).appendChild(b);
      return b;
    };
    // Renglón con un título chico y lo que se le ponga.
    side.row = (k, label, ...nodes) => {
      const r = el('div', 'sim-side-row');
      if (label) r.appendChild(el('div', 'lbl', label));
      r.append(...nodes);
      (k === 'com' ? comBody().parentNode : side.sec(k)).appendChild(r);
      return r;
    };
    return side;
  })();

  // Lo que estaba en la barra va a su sección: la inercia a Ver; los botones con data-act a la suya.
  if (Sim.side) {
    const ctl = bar.querySelector('.ctl');
    const inercia = ctl && ctl.querySelector('#inercia');
    if (inercia) {
      Sim.side.row('ver', null, ctl);
      ctl.className = 'sim-inercia';
    }
    bar.querySelectorAll('[data-act]').forEach(b => Sim.side.sec(b.dataset.act).appendChild(b));
    if (ctl && !ctl.children.length) ctl.remove();
    // Tema y pantalla completa: dos iconos junto a Controles en la barra (en el celular, en la cabecera de la
    // hoja de controles, junto a la ×).
    const tools = el('div', 'sim-tools');
    tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', 'Tema y pantalla');
    const icon = (d, label) => { const b = el('button', 'sim-icon-btn', svg(d)); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; tools.appendChild(b); return b; };
    // Tema claro (el de siempre, para proyectar) u oscuro; se recuerda en todo el sitio (sim-theme).
    const MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>';
    const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>';
    const theme = icon(MOON, 'Tema oscuro');
    const syncTheme = () => {
      const dark = Sim.theme() === 'dark', t = dark ? 'Tema claro' : 'Tema oscuro';
      theme.innerHTML = svg(dark ? SUN : MOON); theme.setAttribute('aria-label', t); theme.title = t;
      theme.setAttribute('aria-pressed', String(dark));
    };
    theme.addEventListener('click', () => { Sim.setTheme(Sim.theme() === 'dark' ? 'light' : 'dark'); syncTheme(); });
    syncTheme();
    // Pantalla completa (para proyectar), si el navegador la tiene.
    if (document.documentElement.requestFullscreen) {
      const GROW = '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>', SHRINK = '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>';
      const fs = icon(GROW, 'Pantalla completa');
      fs.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
      });
      document.addEventListener('fullscreenchange', () => {
        const on = !!document.fullscreenElement, t = on ? 'Salir de pantalla completa' : 'Pantalla completa';
        fs.innerHTML = svg(on ? SHRINK : GROW); fs.setAttribute('aria-label', t); fs.title = t;
      });
    }
    const hd = Sim.side.el.querySelector('.sim-side-hd'), ctlBtn = bar.querySelector('.sim-ctl-btn');
    const placeTools = () => { if (phoneQ.matches) hd.insertBefore(tools, hd.querySelector('.x')); else bar.insertBefore(tools, ctlBtn); };
    phoneQ.addEventListener('change', placeTools);
    placeTools();
  }

  // Globito al pasar el ratón sobre algo del dibujo: su acción y su nombre ("Cambiar · Resistencia").
  if (page) {
    const tip = el('div', 'sim-tip');
    tip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tip);
    // Después del primero, al pasar a otra cosa enseguida el globito sale sin esperar y sin desvanecerse.
    let cur = null, t = 0, warm = 0;
    const hide = keep => {
      clearTimeout(t); cur = null;
      warm = keep === true && tip.classList.contains('on') ? performance.now() + 600 : keep === true ? warm : 0;
      tip.classList.remove('on');
    };
    document.addEventListener('pointerover', e => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const c = e.target.closest && e.target.closest('.sim-layer > *');
      if (c === cur) return;
      hide(true);
      if (!c || c.matches('.ring, .jack') || !tipName(c)) return;
      cur = c;
      t = setTimeout(() => {
        if (cur !== c) return;
        const k = Sim.actOf(c), r = c.getBoundingClientRect();
        tip.innerHTML = `<b>${Sim.ACTS[k][1]}</b> · ${tipName(c)}`;
        tip.dataset.act = k;
        tip.classList.toggle('warm', performance.now() < warm);
        tip.classList.add('on');
        const w = tip.offsetWidth;
        tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
        tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + 'px';
      }, performance.now() < warm ? 0 : 450);
    });
    document.addEventListener('pointerdown', () => hide(), true);
    document.addEventListener('scroll', () => hide(), true);
  }

  // ---------- vista: Agua · Ambos · Electricidad ----------
  // Un solo selector de tres opciones, en la barra (en el celular vertical, las pestañas de abajo del título).
  // Se recuerda en este navegador; el celular recuerda aparte (sim-view-cel) y empieza con un solo lado, que
  // se ve grande. Al cambiar, el panel que queda se estira a su ancho nuevo y el otro se desvanece (240 ms,
  // con document.startViewTransition; sin ella o con movimiento reducido, de golpe).
  Sim.view = 'both';
  const viewFns = [];
  Sim.onView = f => { viewFns.push(f); f(Sim.view); };
  Sim.viewSwitch = () => {
    const key = Sim.phone ? 'sim-view-cel' : 'sim-view';
    let view = store.get(key, ['w', 'e', 'both'], Sim.phone ? store.get('sim-side', ['w', 'e'], 'w') : 'both');
    const OPTS = [['w', 'Agua'], ['both', 'Ambos'], ['e', 'Electricidad']];
    const seg = el('div', 'sim-viewseg');
    seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Qué se ve');
    OPTS.forEach(([v, t]) => {
      const b = el('button', '', t);
      b.type = 'button'; b.dataset.v = v;
      b.addEventListener('click', () => choose(v));
      seg.appendChild(b);
    });
    if (bar) bar.insertBefore(seg, bar.querySelector(':scope > .sim-tools') || bar.querySelector('.sim-ctl-btn') || (foot && foot.parentNode === bar ? foot : null));
    const update = () => {
      stage.dataset.view = view; Sim.view = view;
      seg.dataset.view = view; seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === view)));
      store.set(key, view);
      if (view !== 'both') store.set('sim-side', view);
      viewFns.forEach(f => f(view));
    };
    const choose = v => {
      if (v === view) return;
      const root = document.documentElement;
      if (!document.startViewTransition || Sim.REDUCE.matches) { view = v; update(); return; }
      root.classList.add('sim-vt-view');   // con esta clase los paneles llevan su nombre de transición (sim.css)
      const t = document.startViewTransition(() => { view = v; update(); Sim.panels.forEach(p => p.refit()); });
      t.finished.finally(() => root.classList.remove('sim-vt-view'));
    };
    update();
  };

  // El botón Siguiente late una vez, para avisar que ya se puede seguir. Sim.steps lo hace al cumplirse un paso
  // (con done) o, si la página no los revisa, al llegar al último paso, una sola vez por sesión en cada página.
  // Con movimiento reducido no late.
  Sim.pulseNext = () => {
    const a = foot && foot.querySelector('.sim-go.next');
    if (!a || Sim.REDUCE.matches) return;
    a.classList.remove('pulse'); void a.offsetWidth; a.classList.add('pulse');
  };
  const pulseOnce = () => {
    const key = 'sim-pulse:' + location.pathname;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
    Sim.pulseNext();
  };

  // Para las páginas que van apareciendo de a poco: steps es una lista de nombres y go(k) se llama
  // con el paso elegido (de 0 a steps.length − 1). El paso queda en la dirección (#paso-2), así que
  // se puede recargar o compartir en ese paso. Va en la barra, junto al título: un segmento con su
  // nombre por paso (se toca para ir a él). Para avanzar y regresar están las flechas de la derecha.
  // Con done(k) → true cuando ya se hizo lo que pide el paso k (se revisa cuatro veces por segundo, solo el
  // paso actual), el paso queda con su palomita (en la barra y en «dónde estoy»; se recuerda en la sesión) y
  // Siguiente late.
  Sim.steps = (steps, go, done) => {
    const n = steps.length;
    const wrap = el('div', 'sim-steps');
    wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Pasos');
    const segs = steps.map((name, j) => {
      const b = el('button', 'seg', `<i></i><span class="t">${CHECK}<b>${j + 1}</b><span class="name"> · ${name}</span></span>`);
      b.type = 'button';
      b.addEventListener('click', () => set(j, true));
      wrap.appendChild(b);
      return b;
    });
    const where = foot && foot.querySelector('.sim-where');
    // Los pasos cumplidos.
    const KEY = 'sim-done:' + location.pathname;
    let ok = [];
    try { ok = JSON.parse(sessionStorage.getItem(KEY) || '[]').filter(j => j >= 0 && j < n); } catch (e) {}
    const mark = () => {
      segs.forEach((b, j) => {
        const on = ok.includes(j);
        b.dataset.done = String(on);
        b.title = `Paso ${j + 1}: ${steps[j]}${on ? ' ✓' : ''}`;
        b.setAttribute('aria-label', `Ir al paso ${j + 1}: ${steps[j]}${on ? ', cumplido' : ''}`);
      });
      if (where) where.dataset.done = String(ok.includes(k));
    };
    if (done) setInterval(() => {
      if (k < 0 || ok.includes(k) || document.hidden || !done(k)) return;
      ok.push(k);
      try { sessionStorage.setItem(KEY, JSON.stringify(ok)); } catch (e) {}
      mark(); Sim.pulseNext();
    }, 250);
    // Si algún nombre no cabe completo, los pasos que no son el actual se quedan con su número (su nombre sigue
    // en el globito) y el actual se lee entero.
    const fit = () => {
      wrap.classList.remove('tight');
      if (segs.some(b => { const t = b.querySelector('.t'); return t.offsetWidth && t.scrollWidth > t.clientWidth + 1; })) wrap.classList.add('tight');
    };
    if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);
    if (document.fonts) document.fonts.ready.then(fit);
    const fromHash = () => { const m = /^#paso-(\d+)$/.exec(location.hash); return m ? Math.min(n, Math.max(1, +m[1])) - 1 : 0; };
    let k = -1;
    const set = (j, push) => {
      if (j === k) return;
      k = j;
      segs.forEach((b, i) => { b.dataset.on = String(i <= k); b.toggleAttribute('aria-current', i === k); });
      fit();
      if (where) { where.querySelector('.k').textContent = `Paso ${k + 1} de ${n}`; where.querySelector('.nm').textContent = steps[k]; }
      Sim.last({ k: k + 1, n, name: steps[k] });
      if (foot) foot.dataset.last = String(k === n - 1);
      if (k === n - 1 && !done) pulseOnce();
      mark(); syncGo();
      if (push) history.replaceState(null, '', k ? `#paso-${k + 1}` : location.pathname + location.search);
      go(k);
    };
    // Las flechas de la derecha (abajo en el celular) primero recorren los pasos: mientras quede un paso
    // de ese lado van a él, y luego a la otra simulación. Si no hay simulación de ese lado, la flecha solo
    // aparece mientras haya un paso.
    const gos = foot ? ['prev', 'next'].map((cls, i) => {
      let a = foot.querySelector('.sim-go.' + cls);
      if (a.tagName === 'SPAN') {
        const b = el('a', 'sim-go ' + cls + ' none', Sim.goHTML(cls, '', ''));
        b.href = '#'; a.replaceWith(b); a = b;
      }
      const d = i ? 1 : -1;
      a.addEventListener('click', e => { const j = k + d; if (j >= 0 && j < n) { e.preventDefault(); set(j, true); } else if (a.classList.contains('none')) e.preventDefault(); });
      const stp = a.querySelector('.stp'), nm = a.querySelector('.name');
      return { a, d, title: a.title, stp, nm, stp0: stp && stp.textContent, nm0: nm && nm.textContent };
    }) : [];
    function syncGo() {
      gos.forEach(({ a, d, title, stp, nm, stp0, nm0 }) => {
        const j = k + d, step = j >= 0 && j < n;
        a.dataset.step = String(step);
        if (stp) { stp.textContent = step ? `Paso ${j + 1}` : stp0; nm.textContent = step ? ` · ${steps[j]}` : nm0; }
        const t = step ? `${d > 0 ? 'Paso siguiente' : 'Paso anterior'}: ${j + 1}. ${steps[j]}` : title;
        if (t) { a.title = t; a.setAttribute('aria-label', t); }
      });
    }
    window.addEventListener('hashchange', () => set(fromHash(), false));
    const after = bar.querySelector('.sim-title') || bar.querySelector('h1');
    bar.insertBefore(wrap, after.nextSibling);
    set(fromHash(), false);
  };

  // ---------- valores comunes de los componentes ----------
  // Serie E12: los valores de resistencia que se consiguen en cualquier tienda (100, 120, 150… 820 y
  // cada década). Sim.series(min, max) da los que caen entre min y max; Sim.nearest el más cercano
  // de una lista (en escala logarítmica, como se reparten).
  Sim.E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
  Sim.series = (min, max, base = Sim.E12) => {
    const out = [];
    for (let p = 10 ** Math.floor(Math.log10(min)); p <= max; p *= 10)
      for (const m of base) { const v = Math.round(m * p * 1000) / 1000; if (v >= min * 0.999 && v <= max * 1.001) out.push(v); }
    return out;
  };
  Sim.nearest = (list, x) => list.reduce((a, v) => {
    const d = u => u > 0 && x > 0 ? Math.abs(Math.log(u / x)) : Math.abs(u - x);
    return d(v) < d(a) ? v : a;
  });
  // Colores de LED: cada uno necesita un voltaje distinto para encender (vf, en V). rgb es el color de su luz
  // (la del blanco, azulada para que se vea sobre el fondo blanco) y swatch el de su botón en el menú.
  Sim.LEDS = [
    { id: 'rojo', name: 'Rojo', vf: 1.8, rgb: [255, 60, 45] },
    { id: 'amarillo', name: 'Amarillo', vf: 2.0, rgb: [250, 190, 20] },
    { id: 'verde', name: 'Verde', vf: 2.2, rgb: [40, 200, 70] },
    { id: 'azul', name: 'Azul', vf: 3.0, rgb: [40, 110, 255] },
    { id: 'blanco', name: 'Blanco', vf: 3.2, rgb: [150, 185, 225], swatch: '#f4f7fa' }
  ];
  Sim.led = id => Sim.LEDS.find(l => l.id === id) || Sim.LEDS[0];

  // ---------- calor de los componentes ----------
  // Cada componente que se puede quemar lleva su temperatura T: se calienta con la potencia P que recibe
  // y se enfría hacia la del cuarto (25 °C), las dos cosas con su tiempo τ (dT/dt = (T_P − T)/τ, donde T_P
  // es a la que llegaría si P no cambiara). Con justo la potencia que aguanta llega a su temperatura máxima
  // y ahí se queda; con más la pasa y se quema, más rápido entre más se pasa: con el doble tarda τ·ln 2.
  // Uno real tarda más en calentarse; aquí τ es de unos segundos para que se vea.
  //   resistencia de ¼ W (película de carbón, hasta 155 °C)
  //   LED de 5 mm: aguanta 30 mA, o sea pMax = Vf · 30 mA (de 54 mW el rojo a 96 mW el blanco), hasta 125 °C
  //   fusible: su "potencia" es (I / In)², 1 con la corriente que aguanta; se funde rápido si se pasa mucho
  //   y tarda (decenas de segundos) si se pasa poco, como uno de verdad
  //   capacitor electrolítico al revés: de 1 V para arriba su óxido ya no aísla y conduce; esa corriente
  //   descompone el electrolito y lo calienta por dentro (gas y calor en el centro del rollo, donde casi no se
  //   enfría): con 5 mW llega a 105 °C, su temperatura máxima. Al derecho no se calienta.
  Sim.HEAT = {
    res: { pMax: 0.25, tMax: 155, tau: 8 },
    led: { pMax: 0.054, tMax: 125, tau: 2.5 },
    fuse: { pMax: 1, tMax: 125, tau: 25 },
    cap: { pMax: 0.005, tMax: 105, tau: 3 }
  };
  Sim.LED_IMAX = 30;   // mA
  Sim.heat = (o = Sim.HEAT.res) => {
    const T0 = 25;
    const h = { ...o, T: T0, P: 0,
      max: () => typeof h.pMax === 'function' ? h.pMax() : h.pMax,
      // 0 a la temperatura del cuarto, 1 justo al quemarse
      get f() { return Math.max(0, (h.T - T0) / (h.tMax - T0)); },
      // lo que se ve en el dibujo (brillo, temblor): solo ya muy caliente, de 60 % en adelante
      get glow() { return Math.max(0, Math.min(1, (h.f - 0.6) / 0.4)); },
      // avanza dt segundos con la potencia P; devuelve true en el instante en que se quema
      step(P, dt) {
        const was = h.T >= h.tMax, Tp = T0 + Math.max(0, P) / h.max() * (h.tMax - T0);
        h.P = Math.max(0, P);
        h.T = Tp + (h.T - Tp) * Math.exp(-dt / h.tau);
        return !was && h.T >= h.tMax;
      },
      reset() { h.T = T0; h.P = 0; }
    };
    return h;
  };
  // Potencia en vatios: 0,081 W, 1,25 W.
  Sim.watts = P => Sim.fmt(P, P >= 10 ? 1 : P >= 1 ? 2 : 3) + ' W';
  // Fila del menú con la potencia y el calor de un componente (Sim.heat h): cuánto aguanta, cuánto recibe
  // ahora y una barra con su temperatura (en el agua, su desgaste) hasta que se quema. broken() dice si ya
  // se quemó; what es 'res' o 'led'.
  Sim.powerRow = (h, side, { broken = () => false, what = 'res' } = {}) => ({
    heat: () => {
      const w = side === 'w', b = broken();
      return {
        label: w ? 'Potencia (presión × caudal)' : 'Potencia (voltaje × corriente)',
        rated: Sim.watts(h.max()),
        now: Sim.watts(b ? 0 : h.P), over: !b && h.P > h.max(),
        f: b ? 1 : h.f, burnt: b,
        name: w ? 'Desgaste' : 'Temperatura',
        val: b ? (w ? (what === 'res' ? 'reventó' : 'se rompió') : 'se quemó')
          : w ? Math.round(100 * Math.min(1, h.f)) + ' %' : Math.round(h.T) + ' °C',
        end: w ? (what === 'res' ? 'revienta' : 'se rompe') : 'se quema a ' + h.tMax + ' °C'
      };
    }
  });

  // ---------- menú de un componente ----------
  // Al tocar un componente se abre una tarjetita junto a él con lo que se le puede cambiar:
  // Sim.menu.toggle(anchor, { title, rows }) la abre (o la cierra si ya estaba abierta para anchor).
  // title puede ser una función; cada fila es una de (label solo lo leen los lectores de pantalla):
  //   { label, values, get, set, format }   slider que pasa por una lista de valores (los comunes)
  //   { label, options: [{ value, text, color }], get, set }   botones para escoger (el color de un LED)
  //   { actions: [{ text, onClick, hidden, danger, primary }] }   botones (fundir, poner uno nuevo…); primary es
  //                                         el botón lleno de la acción principal (uno por tarjeta, arriba)
  //   { label, seg: [{ value, text }], get, set }   segmentado para elegir (cable o indicador)
  //   { label, range: [min, max, step], lo, hi, get, set }   deslizador corto con sus dos extremos (rigidez)
  // Con float: true no se acomoda en la columna: es la tarjeta de un instrumento, junto a él.
  // Se cierra tocando fuera (menos donde ignore(target) diga), con Esc o con la ×; mientras está abierta se actualiza sola.
  Sim.menu = (() => {
    // En la computadora, con la columna de controles abierta, los menús se acomodan en su sección
    // Cambiar componentes (uno debajo del otro, el más nuevo arriba) y se quedan abiertos hasta tocar su ×
    // o el componente otra vez. Con la columna escondida, si a la derecha del dibujo queda lugar, se
    // acomodan ahí. Si no hay lugar, es una sola tarjeta flotante junto al componente, que se cierra al
    // tocar fuera; en el celular esa tarjeta sube desde abajo, para no tapar el circuito.
    let cards = [], raf = 0, ready = false;
    const DOCK_W = 300;
    const val = (f, ...a) => typeof f === 'function' ? f(...a) : f;
    const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    // Lugar libre a la derecha del dibujo, en el panel del componente.
    const dockFor = (anchor, o) => {
      if (o && o.float) return null;
      if (Sim.side && Sim.side.docked()) return { side: true };
      const p = Sim.panels.find(q => q.box.contains(anchor));
      if (!p || !p.box.clientWidth) return null;
      const free = p.box.clientWidth - (p.ox + (p.x0 + p.W) * p.scale);
      return free >= DOCK_W + 24 ? p : null;
    };
    const dockEl = p => {
      if (p.side) return Sim.side.cards();
      let d = p.box.querySelector(':scope > .sim-dock');
      if (!d) { d = mk('div', 'sim-dock'); p.box.appendChild(d); }
      return d;
    };
    // Al abrir, la tarjeta crece un poquito desde su flechita (desde el componente); la hoja del celular sube
    // desde abajo. Al cerrar se va más rápido de lo que llegó. Si se cambia de un componente a otro con la
    // tarjeta abierta, la nueva solo aparece (sin crecer otra vez). La acoplada va en una fila de cuadrícula
    // (.sim-fold) que se abre de 0fr a 1fr en 200 ms y se cierra en 120 ms: lo de abajo se recorre, no salta.
    const lying = matchMedia('(max-height: 500px)');   // celular acostado: la hoja sale de la derecha
    const enter = (card, quick) => {
      const el = card.el, sheet = el.classList.contains('sheet'), still = quick || Sim.REDUCE.matches;
      if (card.box) {
        if (!Sim.REDUCE.matches) void card.box.offsetHeight;   // que empiece cerrada
        card.box.classList.add('open');
      }
      const kf = still || card.box ? [{ opacity: 0 }, { opacity: 1 }]
        : sheet ? [{ transform: lying.matches ? 'translateX(100%)' : 'translateY(100%)' }, { transform: 'none' }]
        : [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }];
      el.animate(kf, { duration: still ? 120 : sheet ? 320 : 180, easing: sheet && !still ? Sim.EASE.drawer : Sim.EASE.out });
    };
    const leave = (card, instant, from) => {
      const el = card.el;
      if (card.box) {   // acoplada: su fila se cierra y lo de abajo sube con ella
        if (instant || Sim.REDUCE.matches) return card.box.remove();
        el.classList.add('leaving'); el.setAttribute('aria-hidden', 'true');
        card.box.classList.remove('open');
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: Sim.EASE.out, fill: 'forwards' });
        setTimeout(() => card.box.remove(), 140);
        return;
      }
      if (instant) return el.remove();
      const sheet = el.classList.contains('sheet');
      el.classList.add('leaving'); el.setAttribute('aria-hidden', 'true');
      const kf = Sim.REDUCE.matches ? [{ opacity: 1 }, { opacity: 0 }]
        : sheet ? [{ transform: from || 'none' }, { transform: lying.matches ? 'translateX(100%)' : 'translateY(100%)' }]
        : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }];
      el.animate(kf, { duration: sheet ? 220 : 120, easing: Sim.EASE.out, fill: 'forwards' }).finished.finally(() => el.remove());
    };
    const close = (card, focusBack = false, instant = false, from = '') => {
      if (!card) return;
      cards = cards.filter(c => c !== card);
      leave(card, instant, from);
      card.anchor.removeAttribute('aria-expanded');
      if (focusBack) card.anchor.focus();
    };
    const closeFloating = instant => cards.filter(c => !c.docked).forEach(c => close(c, false, instant));
    const setup = () => {
      ready = true;
      // tocar fuera cierra la tarjeta flotante (el componente que la abrió la cierra él mismo, con toggle)
      document.addEventListener('pointerdown', e => {
        for (const c of cards) if (!c.docked && !c.el.contains(e.target) && !c.anchor.contains(e.target) && !(c.o.ignore && c.o.ignore(e.target))) close(c);
      }, true);
      document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || !cards.length) return;
        const c = cards.find(c => c.el.contains(document.activeElement)) || cards.find(c => !c.docked) || cards[cards.length - 1];
        close(c, true); e.preventDefault();
      });
    };
    // Slider: arriba el valor actual, grande, con los de junto a cada lado (se tocan para ir a ellos);
    // abajo una rayita por cada valor de la lista.
    const slider = r => {
      const row = mk('div', 'row slide'), top = mk('div', 'near');
      const prev = mk('button', 'adj prev'), out = mk('output', 'val'), next = mk('button', 'adj next');
      prev.type = next.type = 'button';
      top.append(prev, out, next);
      const inp = mk('input');
      inp.type = 'range'; inp.min = 0; inp.max = r.values.length - 1; inp.step = 1;
      inp.setAttribute('aria-label', r.label);
      Sim.snapRange(inp);
      const ticks = mk('div', 'ticks');
      r.values.forEach(() => ticks.appendChild(mk('span')));
      row.append(top, inp, ticks);
      const index = () => r.values.indexOf(Sim.nearest(r.values, r.get()));
      const go = i => { i = Math.max(0, Math.min(r.values.length - 1, i)); r.set(r.values[i]); sync(); };
      inp.addEventListener('input', () => go(+inp.value));
      prev.addEventListener('click', () => go(index() - 1));
      next.addEventListener('click', () => go(index() + 1));
      const sync = () => {
        const i = index(), n = r.values.length;
        if (document.activeElement !== inp || Math.round(+inp.value) !== i) inp.value = i;
        out.textContent = r.format(r.get());
        inp.setAttribute('aria-valuetext', out.textContent);
        prev.textContent = i > 0 ? r.format(r.values[i - 1]) : '';
        next.textContent = i < n - 1 ? r.format(r.values[i + 1]) : '';
        prev.disabled = i <= 0; next.disabled = i >= n - 1;
        prev.setAttribute('aria-label', 'Bajar a ' + prev.textContent); next.setAttribute('aria-label', 'Subir a ' + next.textContent);
        [...ticks.children].forEach((t, k) => t.classList.toggle('on', k === i));
      };
      return { row, sync };
    };
    const choice = r => {
      const row = mk('div', 'row'), out = mk('output', 'val');
      const list = mk('div', 'opts');
      list.setAttribute('role', 'group'); list.setAttribute('aria-label', r.label);
      const btns = r.options.map(o => {
        const btn = mk('button', 'opt');
        btn.type = 'button'; btn.title = o.text; btn.setAttribute('aria-label', o.text);
        if (o.color) btn.style.setProperty('--c', o.color);
        btn.addEventListener('click', () => { r.set(o.value); sync(); });
        list.appendChild(btn);
        return btn;
      });
      row.append(out, list);
      const sync = () => {
        const v = r.get();
        btns.forEach((btn, k) => btn.setAttribute('aria-pressed', String(r.options[k].value === v)));
        const o = r.options.find(o => o.value === v);
        out.textContent = o ? (o.detail || o.text) : '';
      };
      return { row, sync };
    };
    // Potencia y calor (ver Sim.powerRow): lo que aguanta y lo que recibe, y una barra que se llena hasta quemarse.
    const heatRow = r => {
      const row = mk('div', 'row heat');
      row.innerHTML = '<div class="pw-t"></div><div class="pw"><div><span>Aguanta</span><b class="rated"></b></div><div><span>Ahora</span><b class="now"></b></div></div>' +
        '<div class="bar"><i></i></div><div class="bl"><span class="nm"></span><b class="tv"></b><span class="end"></span></div>';
      const q = c => row.querySelector(c), bar = q('.bar i');
      const sync = () => {
        const v = r.heat(), f = Math.max(0, Math.min(1, v.f));
        q('.pw-t').textContent = v.label;
        q('.rated').textContent = v.rated; q('.now').textContent = v.now;
        q('.now').classList.toggle('over', !!v.over);
        q('.nm').textContent = v.name; q('.tv').textContent = v.val; q('.end').textContent = v.end;
        bar.style.width = (100 * f).toFixed(1) + '%';
        bar.style.background = v.burnt ? 'var(--danger)' : `hsl(${Math.round(130 - 130 * f)}, 75%, ${Math.round(42 + 8 * f)}%)`;
        row.classList.toggle('burnt', !!v.burnt);
      };
      return { row, sync };
    };
    // Segmentado: una opción de varias (como Serie | Paralelo).
    const seg = r => {
      const row = mk('div', 'row'), g = mk('div', 'sim-seg');
      g.setAttribute('role', 'group'); g.setAttribute('aria-label', r.label);
      if (r.label) row.appendChild(mk('div', 'lbl', r.label));
      const btns = r.seg.map(o => {
        const btn = mk('button', '', o.text);
        btn.type = 'button';
        btn.addEventListener('click', () => { r.set(o.value); sync(); });
        g.appendChild(btn);
        return btn;
      });
      row.appendChild(g);
      const sync = () => { const v = r.get(); btns.forEach((btn, k) => btn.setAttribute('aria-pressed', String(r.seg[k].value === v))); };
      return { row, sync };
    };
    // Deslizador corto: nombre, un extremo, el deslizador y el otro extremo, en un renglón.
    const range = r => {
      const row = mk('label', 'row rng'), inp = mk('input');
      inp.type = 'range'; [inp.min, inp.max, inp.step] = r.range; inp.value = r.get();
      row.innerHTML = `<span class="nm">${r.label}</span><span class="lo">${r.lo}</span>`;
      row.appendChild(inp); row.insertAdjacentHTML('beforeend', `<span class="hi">${r.hi}</span>`);
      Sim.snapRange(inp, { magnet: r.magnet || 0 });
      inp.addEventListener('input', () => r.set(+inp.value));
      const sync = () => { if (document.activeElement !== inp) inp.value = r.get(); };
      return { row, sync };
    };
    const actions = r => {
      const row = mk('div', 'row acts' + (r.actions.some(a => a.primary) ? ' main' : ''));
      const btns = r.actions.map(a => {
        const btn = mk('button', 'act' + (a.danger ? ' danger' : '') + (a.primary ? ' primary' : ''));
        btn.type = 'button';
        btn.addEventListener('click', () => { a.onClick(); sync(); });
        row.appendChild(btn);
        return btn;
      });
      const sync = () => {
        btns.forEach((btn, k) => { const a = r.actions[k]; btn.textContent = val(a.text); btn.hidden = !!val(a.hidden); });
        row.hidden = btns.every(btn => btn.hidden);
      };
      return { row, sync };
    };
    // Junto al componente: abajo si cabe, si no arriba; en el celular casi a todo lo ancho.
    const place = card => {
      const el = card.el, a = card.anchor.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, M = 8;
      if (!a.width && !a.height) return close(card, false, true);
      el.classList.toggle('sheet', phoneQ.matches);
      if (phoneQ.matches) { el.style.left = el.style.top = ''; return; }
      const w = el.offsetWidth, h = el.offsetHeight, cx = a.left + a.width / 2;
      const left = Math.max(M, Math.min(vw - w - M, cx - w / 2));
      let top = a.bottom + 10, below = true;
      if (top + h > vh - M) {
        if (a.top - 10 - h >= M) { top = a.top - 10 - h; below = false; }
        else top = Math.max(M, vh - h - M);
      }
      el.style.left = left + 'px'; el.style.top = top + 'px';
      el.dataset.at = below ? 'below' : 'above';
      el.style.setProperty('--ax', Math.max(18, Math.min(w - 18, cx - left)) + 'px');
    };
    // La columna empieza debajo de lo que haya arriba a la derecha del panel (el selector de colores).
    const placeDock = p => {
      if (p.side) return;
      const d = dockEl(p), box = p.box.getBoundingClientRect();
      let top = 12;
      p.box.querySelectorAll('.sim-layer > .sim-colors').forEach(c => {
        const r = c.getBoundingClientRect();
        if (r.height && r.right > box.right - DOCK_W - 40) top = Math.max(top, r.bottom - box.top + 16);
      });
      d.style.top = top + 'px'; d.style.width = DOCK_W + 'px';
    };
    const refresh = c => {
      c.title.textContent = val(c.o.title);
      c.parts.forEach(p => p.sync());
      if (c.docked) placeDock(c.docked); else place(c);
    };
    const tick = () => {
      raf = 0;
      if (!cards.length) return;
      for (const c of [...cards]) {
        const now = c.docked && dockFor(c.anchor, c.o);
        if (c.docked && (!now || !!now.side !== !!c.docked.side)) { close(c); continue; }   // ya no hay lugar (cambió la pantalla)
        refresh(c);
      }
      raf = requestAnimationFrame(tick);
    };
    const open = (anchor, o) => {
      if (!ready) setup();
      const p = dockFor(anchor, o), swap = !p && cards.some(c => !c.docked);
      const old = cards.find(c => c.anchor === anchor);
      if (old) close(old, false, true);
      if (!p) closeFloating(true);
      const el = mk('div', 'sim-menu' + (p ? ' docked' : ''));
      el.setAttribute('role', 'dialog');
      const hd = mk('div', 'hd'), title = mk('h2', 'ttl'), x = mk('button', 'x', '×');
      x.type = 'button'; x.setAttribute('aria-label', 'Cerrar');
      hd.append(title, x);
      el.append(hd);
      const parts = o.rows.map(r => r.values ? slider(r) : r.options ? choice(r) : r.heat ? heatRow(r) : r.seg ? seg(r) : r.range ? range(r) : actions(r));
      parts.forEach(q => el.appendChild(q.row));
      const card = { anchor, o, el, title, parts, docked: p, box: null };
      x.addEventListener('click', () => close(card, true));
      Sim.swipeClose(hd, el, () => lying.matches ? 'x' : 'y', () => el.classList.contains('sheet') && cards.includes(card), from => close(card, false, false, from));
      if (p) {
        const d = dockEl(p), inner = mk('div');
        card.box = mk('div', 'sim-fold');
        inner.appendChild(el); card.box.appendChild(inner);
        d.prepend(card.box);
        while (d.children.length > 4) { const last = cards.find(c => c.box === d.lastElementChild); if (last) close(last, false, true); else d.lastElementChild.remove(); }
      } else document.body.appendChild(el);
      cards.push(card);
      anchor.setAttribute('aria-expanded', 'true');
      el.setAttribute('aria-label', val(o.title));
      refresh(card);   // ya en su lugar, para que crezca desde el componente
      if (cards.includes(card)) enter(card, swap);
      if (!raf) tick();
      const first = el.querySelector('input, .opt, .act:not([hidden])');
      if (first && anchor.matches(':focus-visible')) first.focus();
    };
    const find = anchor => cards.find(c => c.anchor === anchor);
    return {
      open,
      // sin anchor cierra la tarjeta flotante (la de la columna se queda)
      close: anchor => anchor ? close(find(anchor)) : closeFloating(),
      toggle: (anchor, o) => find(anchor) ? close(find(anchor)) : open(anchor, o),
      isOpen: anchor => anchor ? !!find(anchor) : cards.some(c => !c.docked)
    };
  })();

  // Menús de siempre (para b.part o b.pinch del banco): cada uno devuelve menu(side), con side 'w' (agua) o 'e'.
  //   Sim.resistorMenu({ name, values, get, set, format, actions, heat, broken })   valores comunes de resistencia
  //   Sim.ledMenu({ name, get, set, actions, heat, broken })   color del LED (Sim.LEDS): cada uno necesita otro voltaje (1 psi por volt)
  // actions son los botones de abajo (ver Sim.menu), o actions(side); name es 'R1', '1'…, si hay más de uno.
  // heat es su Sim.heat (y broken() si ya se quemó): agrega la fila de la potencia y el calor.
  Sim.resistorMenu = ({ name = '', values, get, set, format, actions, heat, broken }) => side => ({
    title: (side === 'w' ? 'Tramo angosto' : 'Resistencia') + (name ? ' ' + name : ''),
    rows: [{ label: side === 'w' ? 'Resistencia del tramo' : 'Resistencia', values, get, set, format },
      ...(heat ? [Sim.powerRow(heat, side, { broken })] : []),
      ...(actions ? [{ actions: typeof actions === 'function' ? actions(side) : actions }] : [])]
  });
  Sim.ledMenu = ({ name = '', get, set, actions, heat, broken }) => side => ({
    title: (side === 'w' ? 'Rueda' : 'LED') + (name ? ' ' + name : ''),
    rows: [{ label: 'Color', get, set, options: Sim.LEDS.map(l => ({
      value: l.id, text: l.name, color: l.swatch || `rgb(${l.rgb})`,
      detail: l.name + ' · ' + (side === 'w' ? Sim.fmt(l.vf) + ' psi' : Sim.fmt(l.vf) + ' V')
    })) }, ...(heat ? [Sim.powerRow(heat, side, { broken, what: 'led' })] : []), ...(actions ? [{ actions: typeof actions === 'function' ? actions(side) : actions }] : [])]
  });

  window.Sim = Sim;
})();
