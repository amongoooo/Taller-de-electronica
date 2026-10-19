// Banco común de las simulaciones de agua y electricidad: dos paneles con el mismo circuito,
// bomba y fuente enlazadas (botón, LED, perilla y medidor), manómetro/voltímetro a la izquierda,
// medidor de caudal/amperímetro a la derecha e inercia. Cada página solo agrega su parte del circuito.
//
// Sim.bench({
//   iFull,            mA a escala completa en los medidores de corriente y caudal
//   flowSpeed,        rapidez de las partículas en la tubería normal, por cada mA
//   v0,               voltaje inicial de la perilla
//   layout(g),        se llama cuando cambia el tamaño de un panel (g.side es 'w' o 'e')
//   model(V),         devuelve { I } (mA totales) y lo que la página necesite para dibujar
//   step(dt, m),      avanza lo que se mueve (partículas, ruedas)
//   drawW(ctx, g, m), drawE(ctx, g, m)   dibujan el circuito de cada lado
// })
(() => {
  const { C, draw: D, fmt, digits } = Sim;
  const VMAX = 12, KPA_PER_V = 10, MLS_PER_MA = 10, RPM_PER_MA = 100;

  Sim.bench = o => {
    const iFull = o.iFull || 12, flowSpeed = o.flowSpeed || 12;
    const st = { on: false, set: o.v0 ?? 6, v: 0, tau: 1, level: Sim.ramp(), m: { I: 0 },
      rpm: 0, omega: 0, rotor: 0, nV: Sim.needle(), nI: Sim.needle(), nS: Sim.needle() };
    const b = { st, VMAX, KPA_PER_V, MLS_PER_MA, iFull, flowSpeed, knobs: [] };

    const geometry = (side, W, H) => {
      const g = { side, W, H, X0: 180, X1: 640, PX: 400, TOP: 140, BOT: H - 214 };
      g.MIDY = (g.TOP + g.BOT) / 2;
      g.MY = g.TOP + 0.62 * (g.BOT - g.TOP);                       // altura de los medidores laterales
      g.BX = g.PX - 215; g.BY = g.BOT + 46; g.BW = 430; g.BH = 152;   // caja del controlador
      g.loop = D.rect(g.X0, g.TOP, g.X1, g.BOT);   // sube por la izquierda, cruza arriba, baja y regresa por abajo
      return g;
    };
    const size = Sim.fitHeight(800, 610, 1060);
    b.pw = Sim.panel(document.getElementById('pw'), size);
    b.pe = Sim.panel(document.getElementById('pe'), size);
    b.pw.onLayout = (W, H) => { b.gw = geometry('w', W, H); o.layout && o.layout(b.gw); };
    b.pe.onLayout = (W, H) => { b.ge = geometry('e', W, H); o.layout && o.layout(b.ge); };
    b.pw.onLayout(b.pw.W, b.pw.H); b.pe.onLayout(b.pe.W, b.pe.H);
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
      pos: g => [g.PX, g.BY + 80], min: 0, max: VMAX, step: 0.5, value: st.set,
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

    // ---------- dibujo común ----------
    const controllerBox = (ctx, g, title, fill, scale, caption) => {
      ctx.fillStyle = C.ink; ctx.fillRect(g.PX - 14, g.BOT + 30, 28, 18);       // cuello hacia el circuito
      D.roundRect(ctx, g.BX, g.BY, g.BW, g.BH, 14, fill, C.ink, 2.5);
      D.text(ctx, title, g.BX + 18, g.BY + 24, C.ink, { align: 'left', size: 15 });
      D.knobScale(ctx, g.PX, g.BY + 80, 36, scale);
      D.text(ctx, caption, g.PX, g.BY + 138, C.muted, { size: 14 });
      D.led(ctx, g.BX + 108, g.BY + 92, st.v > 0.05 ? 1 : 0);   // detecta presión desde 0.5 kPa (0.05 V)
    };
    const knobScales = (ctx, g) => b.knobs.forEach(k => {
      const [x, y] = k.pos(g);
      D.knobScale(ctx, x, y, 36, k.scale(g.side), k.ticks);
      if (k.caption) D.text(ctx, k.caption(g.side), x, y + 58, C.muted, { size: 14 });
    });

    function drawWater() {
      const g = b.gw, m = st.m, ctx = b.pw.begin();
      D.line(ctx, [[g.X0, g.MY], [110, g.MY]], 14, C.pipe, 'butt');   // toma del manómetro
      D.line(ctx, [[g.X0, g.MY], [110, g.MY]], 6, C['water-soft'], 'butt');
      o.drawW(ctx, g, m);
      knobScales(ctx, g);
      D.speedLegend(ctx, 600, 46, 160);
      controllerBox(ctx, g, 'BOMBA', C.metal, [['0', 0], ['60', 0.5], ['120', 1]], 'presión (kPa)');
      D.meter(ctx, g.BX + g.BW - 70, g.BY + 52, { r: 30, frac: st.nS.x, color: C.water, lcdW: 104,
        text: digits(st.rpm, 4, 0), unit: 'rpm' });
      D.pump(ctx, g.PX, g.BOT, st.rotor, st.omega);
      D.meter(ctx, 70, g.MY - 20, { frac: st.nV.x, color: C.water, lcdW: 104, label: 'presión',
        text: digits(st.v * KPA_PER_V, 3, 1), unit: 'kPa' });
      D.meter(ctx, g.X1, g.MY, { frac: st.nI.x, color: C.water, lcd: 'right', lcdW: 100, label: 'caudal',
        text: digits(m.I * MLS_PER_MA, 3, 1), unit: 'mL/s' });
    }
    function drawElectric() {
      const g = b.ge, m = st.m, ctx = b.pe.begin();
      D.line(ctx, [[g.X0, g.MY], [110, g.MY]], 2.5, C.muted);
      o.drawE(ctx, g, m);
      knobScales(ctx, g);
      controllerBox(ctx, g, 'FUENTE', C['charge-soft'], [['0', 0], ['6', 0.5], ['12', 1]], 'voltaje (V)');
      D.meter(ctx, g.BX + g.BW - 70, g.BY + 52, { r: 30, frac: st.nV.x, color: C.charge, lcdW: 104,
        text: digits(st.v, 2, 2), unit: 'V' });
      D.source(ctx, g.PX, g.BOT);
      D.meter(ctx, 70, g.MY - 20, { frac: st.nV.x, color: C.charge, lcdW: 104, label: 'voltímetro',
        text: digits(st.v, 2, 2), unit: 'V' });
      D.meter(ctx, g.X1, g.MY, { frac: st.nI.x, color: C.charge, lcd: 'right', lcdW: 100, label: 'amperímetro',
        text: digits(m.I, 2, 2), unit: 'mA' });
    }

    // ---------- animación ----------
    // La inercia es el tiempo que tarda todo en arrancar o detenerse por completo.
    b.start = () => Sim.run(dt => {
      st.v = st.level.step(st.on ? st.set : 0, st.tau, dt);
      st.m = o.model(st.v);
      const tn = Math.min(0.15, st.tau * 0.15);                    // las agujas apenas se atrasan
      st.nV.step(st.v / VMAX, tn, dt);
      st.nI.step(st.m.I / iFull, tn, dt);
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
