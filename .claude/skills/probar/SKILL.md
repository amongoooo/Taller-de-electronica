---
name: probar
description: Probar las simulaciones con Playwright y capturas en PC (1440 y 1366) y celular (390×844 vertical y horizontal), en claro y oscuro, y revisar errores de JavaScript. Úsala después de cualquier cambio en assets/ o simulaciones/, antes de abrir el PR, y para las capturas que se mandan al terminar una fase.
---

# Probar las simulaciones

1. Si cambiaste `assets/*.js` o `assets/*.css`, sube el `?v=` en todas las páginas antes de probar:
   `V=$(date -u +%Y%m%d%H%M%S); sed -i -E "s/\?v=[0-9]+/?v=$V/g" simulaciones/*/index.html`
2. Barrido completo (14 páginas × 4 tamaños × claro y oscuro; levanta su propio servidor):
   `node tools/capturas.js --salida <carpeta temporal>/barrido`
   Debe terminar con «errores de JavaScript: 0». Si no, corrige antes de seguir.
   Para revisar el acomodo en más pantallas: `--tamaños cel360,cel360-h,tableta,pc1024`.
3. Mira las capturas de lo que cambiaste (con Read) en PC y en celular, en los dos temas. Revisa sobre todo:
   texto encimado o cortado, letra menor a 14 px, colores del modo oscuro (el − con `C.neg`), que el dibujo y
   las asas sigan a la vista con una tarjeta abierta en el celular acostado. En el celular, cada instrumento en su versión corta
   y abierta (`Sim.benchNow.setFront('src' | 'a' | 'b' | null)`; en el osciloscopio, sus teclas de las flechas).
4. Para probar un gesto, pasa una acción: `--accion tools/acciones/tocar-componente.js` (o una propia que
   exporte `async (page, { p, sz, th }) => {}`), con `--paginas`, `--tamaños` y `--temas` para acotar.
   Para comprobar valores, lee el estado desde la página: `Sim.benchNow.st` en las páginas del banco, `Sim.oscNow.st` en las del osciloscopio (una página por circuito), o el
   texto de los renglones de Componentes (`.sim-part .vl`).
5. Al terminar una fase, junta las capturas más claras (una tarjeta abierta, PC y celular, claro y oscuro) en
   una carpeta y mándalas a la persona.

Las capturas van en una carpeta temporal (scratchpad), nunca en el repositorio.
