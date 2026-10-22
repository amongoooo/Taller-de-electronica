# Taller de Electrónica: guía para Claude

Simulaciones de electrónica con la analogía agua/electricidad para una clase con fuente de banco real.
Publicado en https://amongoooo.github.io/Taller-de-electronica/. Todo debe ser físicamente preciso y verse
como el instrumento real. La persona escribe en español: responde en español.

## Reglas de trabajo

- Rama desde `main` por cada grupo de cambios, PR y fusiónalo al terminar sin preguntar. Si varios PR tocan
  los mismos archivos, fusiónalos en orden y rebasa el resto.
- Siempre que cambies `assets/*.js` o `assets/*.css`, sube el `?v=` en todos los `simulaciones/*/index.html`
  (si no, el navegador usa una copia vieja):
  `V=$(date -u +%Y%m%d%H%M%S); sed -i -E "s/\?v=[0-9]+/?v=$V/g" simulaciones/*/index.html`
- Prueba con Playwright y capturas en PC (1440 y 1366) y celular (390×844 vertical y horizontal), en claro y
  oscuro: usa la skill `probar` (`.claude/skills/probar/SKILL.md`, script `tools/capturas.js`). Al terminar
  cada fase, manda capturas de PC y celular.
- Controles sin textos explicativos. Los textos de los pasos y el botón «¿Qué se toca?» ya se quitaron: no
  los vuelvas a poner.
- No cambies la física por decoración. Si algo nuevo cambia la física (un valor que ahora se puede elegir),
  cuida que siga siendo correcta (corrientes máximas, calor, unidades: 1 psi por volt, 1 mL/s por mA).
- Actualiza el README cuando cambie algo que describe.
- Al final de cada mensaje: el porcentaje aproximado de avance de lo pedido y si conviene seguir en el mismo
  chat o abrir otro (con el modelo y el prompt para pegar, si ya hay una tarea definida).

## Sistema de diseño

- Azul principal `#1D6FD1` (`--sel` / `C.sel`; en oscuro `#5d9ff2`): lo seleccionado y la acción principal.
- Agua azul (`--water`), electricidad ámbar (`--charge`). + rojo, − negro: en oscuro usa `C.neg` / `--neg`,
  nunca `C.ink`. Presión/voltaje morado, caudal/corriente verde, peligro rojo siempre con texto.
- Claro por defecto (se proyecta); oscuro con `:root[data-theme="dark"]`. Los colores del canvas se leen de las
  variables CSS en cada cuadro (`Sim.readColors` → `Sim.C`).
- Tipografía: Saira ancha (`font-stretch: 125%`, en canvas `Sim.WIDE`) para títulos, encabezados,
  AGUA/ELECTRICIDAD y nombres de instrumentos; Archivo Narrow con números tabulares (`Sim.FONT`) para el resto.
  LCD de 7 segmentos sin cambio. Texto mínimo 14 px.
- Secciones de la columna `Sim.side` (≥1100 px; hoja inferior en celular), por acción: Componentes (verde),
  Armar (azul agua), Ver (azul), Medir (morado, al final). La fuente se controla solo en el instrumento.
- Componentes siempre muestran su valor en el dibujo. Perillas y deslizadores con imán (rebote) y zona muerta
  `Sim.DEAD`.
- Movimiento: `Sim.REDUCE` respeta movimiento reducido; menús 180 ms al abrir y 120 ms al cerrar; botones se
  hunden con `scale: .97`.

## Gestos (Fase 1, hecha)

Tocar un objeto abre su tarjeta; tocar un mando lo acciona; arrastrar mueve; la rueda del ratón cambia el valor
bajo el puntero. Objeto = lo que se cambia o se coloca (componentes, fuente, multímetro, puntas). Mando = lo que
existe en el aparato real (palanca, interruptor, válvula, tecla, rueda del multímetro). Lo seleccionado lleva un
contorno azul de 2 px y su nombre y valor en azul. Ninguna acción de un componente está fuera de su tarjeta.
Medir solo lee.

## Mapa del código

Sin compilación: HTML, CSS y JS sueltos. Para probar en local: `python3 -m http.server 8123` en la raíz.

- `assets/sim.js` (`window.Sim`), lo común a todas las páginas:
  - `Sim.panel(box, size)`: canvas escalado; `p.at(el, pos)` coloca controles HTML en coordenadas del dibujo;
    `p.begin()` limpia y deja `Sim.S` = escala del panel (para gruesos en px de pantalla).
  - `Sim.draw` (`D`): `D.text` (letra mínima de 14 px en pantalla con `Sim.px`; `t` puede ser una lista de
    rótulos y `max` elige el que cabe), `D.tag` / `D.tagRow` (etiqueta «nombre valor» y estado en `D.pill`),
    `D.knobScale` (devuelve dónde acaban sus números) y `D.knobCaption`, `D.pipe`, `D.wire`, `D.narrow`, `D.resistor`, `D.wheel`, `D.ledSymbol`,
    `D.lcd`, `D.knobScale`, `D.select` / `D.selectRot` (contorno de seleccionado), `D.chassis` (chasis común de
    los instrumentos: `--inst`, banda agua/ámbar, nombre) y `D.key` (tecla física común).
  - `Sim.fadeSel(key, on)`: 0→1 en 120 ms (aparece y se va el contorno).
  - `Sim.knob`, `Sim.snapRange` (imán, zona muerta, rueda del ratón), `Sim.ramp`, `Sim.needle`, `Sim.heat`.
  - `Sim.menu`: tarjetas. `Sim.menu.toggle(anchor, { title, rows, float, ignore })`. Filas: `values` (deslizador
    de valores comunes), `options` (colores), `seg` (segmentado), `range` (deslizador corto), `heat`
    (potencia y calor), `actions` (botones de contorno; `primary` = el lleno azul, uno por tarjeta, arriba).
    Con la columna abierta se acoplan en Componentes; `float: true` (instrumentos) las deja junto al aparato;
    en celular suben desde abajo (acostado, salen de la derecha).
  - `Sim.side`: columna/hoja de controles. `sec(k)`, `row`, `button`, `part({ anchor, menu, isOpen, toggle })`
    (renglón de Componentes que abre la misma tarjeta).
  - `Sim.ORDER` (orden de las simulaciones), barra (`Sim.steps`, `Sim.viewSwitch` con transición de vista,
    botón Siguiente y `Sim.pulseNext`, iconos de tema y pantalla completa en `.sim-tools`), globito.
  - `Sim.resistorMenu`, `Sim.ledMenu`: tarjetas de siempre.
- `assets/banco.js` (`Sim.bench(o)`), el banco de agua y electricidad que usan 7 de las páginas:
  - Acomodos `ancho` (PC), `medio` (PC con los dos paneles), `alto` (celular vertical) y `lateral` (celular
    acostado) (`MODES`, `geometry`): circuito de x 180 a 640 y la mesa en `g.DESK`; controlador en `g.BX, g.BY`
    (`g.slim`: la caja compacta, ver `CL`), multímetros en `g.meters` = [centro, base] (`homeAt`, `meterAt`).
    En `alto` y `lateral` la caja va aparte del símbolo (`apart`).
  - `b.pinch` (resistencias y capacitores: asas solo con la tarjeta abierta), `b.part` (componente con
    tarjeta), `b.grips` (asas), `b.tag` y `b.tagRow` (etiquetas, ver `D.tag`), `b.linkedButton`, `b.linkedChoice`,
    `b.linkedKnob`, `b.place`.
  - Fuente/bomba: `srcMenu` (tarjeta), `controllerBox` (dibujo), teclas físicas (polaridad y cables).
  - Multímetro: `meterMenu`, `tipMenu`, `drawMeter`, `shape` (extendido/compactado), puntas (`pose`, `grab`,
    `setPlacing`), cables con física (`ropeStep`, `leadStep`), `measure` / `ohms` (V, A, Ω).
  - `drawSel`: contorno de cualquier componente de `circuit()` con `pr` abierto (también en la vista de nodos).
  - Vista de nodos: `analyze`, `morph`, `drawNodes`. Inercia: `inertia`. Regulación CV/CC: `regulate`.
- Páginas (`simulaciones/*/index.html`): cada una da `model`, `circuit`, `drawW`, `drawE` al banco.
  `protoboard` y `osciloscopio` no usan el banco: tienen su propio dibujo, puntas, botones y tarjetas.
  `agua-electricidad` es la versión vieja (no está en `Sim.ORDER`).

## Pendiente

Fase 2 · Instrumentos y mesa (un PR):
- [x] E1 Una familia de instrumentos: chasis común gris claro, borde 2 px, radio 10, nombre en Saira arriba a la
  izquierda, LCD idéntico, teclas idénticas; banda de 6 px arriba azul (agua) o ámbar (electricidad). Hoy: bomba
  gris, fuente crema, multímetros azul/naranja saturados con nombre morado abajo, generador crema, osciloscopio
  gris, pila negra con palanca suelta. La pila del protoboard lleva su palanca dentro del chasis. En oscuro todos
  gris pizarra con su banda.
- [x] E2 Tres tipos de botón: lleno azul (solo Siguiente y la acción principal de una tarjeta), segmentado
  (elegir), contorno (acciones). Nada suelto en el dibujo: «Disparo: sí» → tecla física TRIG del osciloscopio;
  «Por dentro» del protoboard → segmentado Por fuera · Por dentro; formas de onda sin contorno naranja; el botón
  «Juntar los cables en nodos» de Cómo medir sale del dibujo (ya está Dibujo: Circuito | Nodos en Ver).
- [x] E4 Mesa de trabajo: panel en dos franjas, circuito arriba y mesa abajo; instrumentos alineados por su
  base, centrados, mismo espacio entre ellos; lugar punteado para el segundo multímetro. Si se arrastran siguen
  libres. Celular: fuente y multímetro compactos lado a lado bajo el circuito.

Fase 3 · Pulido (otro PR):
- [x] E3 Etiquetas en una línea «nombre valor» (nombre gris, valor en tinta), arriba del componente horizontal
  o a la derecha del vertical. Estados («cerrado», «abierta», «cargar») en una pastilla pequeña al lado. Hoy:
  Voltaje y corriente pone «resistencia» arriba y «1 kΩ» abajo; osciloscopio «470 Ω» arriba y «LED» abajo;
  serie-paralelo «R1 470 Ω».
- [x] E5 Ningún texto del canvas baja de 14 px en pantalla: función común que dibuja a `max(base, 14/escala)`
  (la escala es `Sim.S`); si no cabe, acortar el rótulo.
- [x] S3 Serie | Paralelo pasa a la sección Armar (el selector arriba al centro del dibujo se queda).
- [x] S4 Tema y Pantalla completa salen de Ver y van como iconos junto a Controles en la barra (en celular en la
  cabecera de la hoja). Quitar «Qué se ve» de la hoja de Controles del celular (ya está en las pestañas).
- [x] M1 Cambiar Agua · Ambos · Electricidad con `document.startViewTransition`: el panel que queda se estira a
  su ancho nuevo y el otro se desvanece, 240 ms; sin soporte o con movimiento reducido, como ahora.
- [x] M2 `@view-transition { navigation: auto; }` en sim.css y nombre de transición en la barra para pasar de
  simulación sin destello blanco (200 ms).
- [x] M3 Siguiente late una sola vez por sesión (hoy `sim-go-pulse` 3 veces en cada carga), o cuando el paso se
  cumplió.
- [x] M4 Palanca ON/OFF: 160 ms con salida rápida sin sobrepaso (hoy `cubic-bezier(.3, 2.2, .5, 1)`).
- [x] M5 Tarjetas acopladas en la columna: envolverlas en una fila de cuadrícula 0fr→1fr en 200 ms (cerrar
  120 ms) para que lo de abajo no salte.

Al terminar una fase, marca sus casillas aquí en el mismo PR.
