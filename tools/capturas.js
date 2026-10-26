// Capturas de las simulaciones con Playwright, para probar en PC y celular, en claro y oscuro.
// Levanta su propio servidor de la carpeta del repositorio y avisa de los errores de JavaScript.
//
//   node tools/capturas.js [--salida carpeta] [--paginas a,b|all] [--tamaños pc1440,pc1366,cel,cel-h]
//                          (también cel360, cel360-h, tableta y pc1024)
//                          [--temas light,dark] [--accion archivo.js] [--espera ms]
//
// --accion: un módulo que exporta async (page, { p, sz, th }) => {} y corre antes de cada captura (tocar un
// componente, abrir una tarjeta…). Termina con código 1 si hubo errores de JavaScript.
const http = require('http');
const fs = require('fs');
const path = require('path');

const pw = (() => {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { return require(p); } catch (e) {} }
  throw new Error('No encuentro Playwright: npm i -g playwright');
})();

const ROOT = path.resolve(__dirname, '..');
const ORDER = ['voltaje-concepto', 'como-medir', 'resistencia', 'protoboard',
  'interruptor-led', 'interruptor-led-armado', 'serie-paralelo', 'potenciometro', 'botones', 'transistor',
  'osciloscopio', 'capacitores', 'osciloscopio-rc',
  'osciloscopio-rectificador', 'osciloscopio-onda-completa'];
const SIZES = {
  pc1440: { viewport: { width: 1440, height: 900 } },
  pc1366: { viewport: { width: 1366, height: 768 } },
  cel: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  'cel-h': { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  // para revisar el acomodo en más pantallas (no van en el barrido de siempre): celular chico, tableta y PC chica
  cel360: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  'cel360-h': { viewport: { width: 800, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  tableta: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  pc1024: { viewport: { width: 1024, height: 768 } }
};
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const out = path.resolve(arg('salida', 'capturas'));
const pagesArg = arg('paginas', 'all');
const pages = pagesArg === 'all' ? ORDER : pagesArg.split(',');
const sizes = arg('tamaños', arg('tamanos', 'pc1440,pc1366,cel,cel-h')).split(',');
const themes = arg('temas', 'light,dark').split(',');
const wait = +arg('espera', 900);
const action = arg('accion') ? require(path.resolve(arg('accion'))) : null;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  fs.mkdirSync(out, { recursive: true });
  const browser = await pw.chromium.launch();
  let errors = 0;
  for (const sz of sizes) for (const th of themes) {
    const ctx = await browser.newContext({ ...SIZES[sz] });
    await ctx.addInitScript(t => { try { localStorage.setItem('sim-theme', t); } catch (e) {} }, th);
    for (const p of pages) {
      const page = await ctx.newPage();
      const tag = `[${p} ${sz} ${th}]`;
      page.on('pageerror', e => { errors++; console.log(tag, 'ERROR', e.message); });
      page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) { errors++; console.log(tag, m.text()); } });
      await page.goto(`${base}/simulaciones/${p}/`, { waitUntil: 'networkidle' }).catch(() => page.goto(`${base}/simulaciones/${p}/`));
      await page.waitForTimeout(wait);
      if (action) await action(page, { p, sz, th });
      await page.screenshot({ path: path.join(out, `${p}-${sz}-${th}.png`) });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(`${pages.length * sizes.length * themes.length} capturas en ${out}; errores de JavaScript: ${errors}`);
  process.exit(errors ? 1 : 0);
})();
