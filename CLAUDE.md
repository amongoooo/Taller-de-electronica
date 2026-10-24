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
  oscuro: usa la skill `probar` (`.claude/skills/probar/SKILL.md`, script `tools/capturas.js`; para el acomodo
  también `cel360`, `cel360-h`, `tableta` y `pc1024`). En el celular revisa la versión corta y la abierta de cada
  instrumento. Al terminar cada fase, manda capturas de PC y celular.
- Controles sin textos explicativos. Los textos de los pasos y el botón «¿Qué se toca?» ya se quitaron: no
  los vuelvas a poner.
- No cambies la física por decoración. Si algo nuevo cambia la física (un valor que ahora se puede elegir),
  cuida que siga siendo correcta (corrientes máximas, calor, unidades: 1 psi por volt, 1 mL/s por mA).
- Actualiza el README cuando cambie algo que describe.
- Después de fusionar, revisa que corra «pages build and deployment» (Actions) con el commit nuevo de `main`; si no
  aparece en unos minutos, la página publicada sigue con la versión anterior: hace falta otro cambio en `main`.
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
  - `Sim.panel(box, size)`: canvas escalado (`size` → `[W, H, x0, modo, y0]`; `y0` negativo deja una franja libre arriba);
    `p.at(el, pos)` coloca controles HTML en coordenadas del dibujo;
    `p.begin()` limpia y deja `Sim.S` = escala del panel (para gruesos en px de pantalla).
  - `Sim.draw` (`D`): `D.text` (letra mínima de 14 px en pantalla con `Sim.px`; `t` puede ser una lista de
    rótulos y `max` elige el que cabe), `D.tag` / `D.tagRow` (etiqueta «nombre valor» y estado en `D.pill`),
    `D.knobScale` (devuelve dónde acaban sus números) y `D.knobCaption`, `D.pipe`, `D.wire`, `D.narrow`, `D.resistor`, `D.wheel`, `D.ledSymbol`,
    `D.lcd`, `D.knobScale`, `D.select` / `D.selectRot` (contorno de seleccionado), `D.chassis` (chasis común de
    los instrumentos: `--inst`, banda agua/ámbar, nombre) y `D.key` (tecla física común).
  - `Sim.fadeSel(key, on)`: 0→1 en 120 ms (aparece y se va el contorno).
  - `Sim.knob`, `Sim.encoder` (perilla sin fin: pasos por muesca), `Sim.snapRange` (imán, zona muerta, rueda del
    ratón), `Sim.ramp`, `Sim.needle`, `Sim.heat`.
  - `Sim.water` (agua en una vuelta cerrada) y `Sim.stream` (agua en un tramo abierto: una rama con su corriente).
  - Color de las partículas: `Sim.colorMode` (rapidez/normal, presión/voltaje, caudal/corriente), `Sim.field(x, y)` →
    [presión, caudal] de 0 a 1 que pone cada página (o el banco), y `Sim.colorPicker(panels, { ends, spot, top })`: el
    selector con su escala arriba a la derecha de cada panel. Lo usan el banco, la protoboard y el osciloscopio.
  - `Sim.menu`: tarjetas. `Sim.menu.toggle(anchor, { title, rows, float, ignore })`. Filas: `values` (deslizador
    de valores comunes), `options` (colores), `seg` (segmentado), `range` (deslizador corto), `heat`
    (potencia y calor), `actions` (botones de contorno; `primary` = el lleno azul, uno por tarjeta, arriba).
    Con la columna abierta se acoplan en Componentes; `float: true` (instrumentos) las deja junto al aparato;
    en celular suben desde abajo (acostado, salen de la derecha).
  - `Sim.side`: columna/hoja de controles. `sec(k)`, `row`, `button`, `part({ anchor, menu, isOpen, toggle })`
    (renglón de Componentes que abre la misma tarjeta).
  - `Sim.ORDER` (orden de las simulaciones), barra (`Sim.steps`: con `tight` solo el paso actual lleva su nombre, `Sim.viewSwitch` con transición de vista,
    botón Siguiente y `Sim.pulseNext`, iconos de tema y pantalla completa en `.sim-tools`), globito.
  - `Sim.resistorMenu`, `Sim.ledMenu`: tarjetas de siempre.
- `assets/banco.js` (`Sim.bench(o)`), el banco de agua y electricidad que usan 7 de las páginas:
  - Acomodos `ancho` (PC), `medio` (PC con los dos paneles), `alto` (celular vertical, o PC tan angosta que `medio`
    saldría a menos de 0.7) y `lateral` (celular acostado) (`MODES`, `geometry`): circuito de x 180 a 640 y la mesa en
    `g.DESK`; la fuente en `g.BX, g.BY`, dibujada en sus coordenadas (`SL`: `wide` la de un canal con los bornes arriba al
    centro, `mini` la versión corta; `g.FL` cuál y `g.FK` su escala; `at`/`chAt` las pasan al dibujo y dan null para lo
    que el acomodo no trae, que se esconde: `p.at` acepta null y pone `.sim-off`), multímetros en `g.meters` = [centro,
    base] con su escala `g.mk[k]` (`homeAt`, `meterAt`). En `alto` y `lateral` la caja va aparte del símbolo (`apart`);
    si no, `hoses`: de sus bornes + y − suben mangueras (cables) a la rueda (al símbolo).
  - Celular (`alto` y `lateral`, `phoneDesk`): versión corta y abierta de cada instrumento; `st.front` ('src', 'a', 'b'
    o null) dice cuál está abierto (`setFront`, `b.setFront`; tecla `FOLD` con `foldArrows`). Multímetro corto
    (`shape` con `ph`, `isCompact`): solo se lee. Fuente corta: `SL.mini`. Al cambiar, `relayout` mueve las puntas
    con el circuito.
  - `b.pinch` (resistencias y capacitores: asas solo con la tarjeta abierta), `b.part` (componente con
    tarjeta), `b.grips` (asas), `b.tag` y `b.tagRow` (etiquetas, ver `D.tag`), `b.linkedButton`, `b.linkedChoice`,
    `b.linkedKnob`, `b.place`.
  - Fuente/bomba de un canal, con los mandos de uno de la BK 1761: `st.ch.A` (`co` COARSE, `fi` FINE,
    `lim` CURRENT de `LIMS`, `disp` V/A, `peek`), `setOf`, `KNOBS`, POWER (`st.on`), `srcMenu` (tarjeta),
    `drawSource` y `lcdText` (dibujo), teclas físicas (V/A, polaridad y cables). `b.st.set`/`st.lim` son los de
    su canal; `b.vScale()` el tope de la escala de colores del voltaje (12, 24 o 35 V).
  - Multímetro: `meterMenu`, `tipMenu`, `drawMeter`, `shape` (extendido/compactado), puntas (`pose`, `grab`,
    `setPlacing`), cables con física (`ropeStep`, `leadStep`), placa de los bornes (`jackTarget`: por la orilla; `jackFlip`/`st.jswap`: gira para que los cables no se
    crucen), `measure` / `ohms` (V, A, Ω); en A con
    las puntas en dos nodos, `shorts` (un corto de 0,1 Ω: la red por nodos, `st.sx` lo que la fuente da de más; nunca se
    rompe; reescribe `v` e `Iat` de cada tramo y el voltaje de los nodos con esa red, y da `Sim.holds`, los tramos puenteados
    donde las partículas se quedan quietas en `D.flow` y `Sim.water`). `b.iOut()` es lo que de verdad da la fuente; `b.flowI(m)`,
    la corriente con la que las páginas mueven las partículas de su vuelta (con un corto, la de la fuente).
  - `drawSel`: contorno de cualquier componente de `circuit()` con `pr` abierto (también en la vista de nodos).
  - Vista de nodos: `analyze`, `morph`, `drawNodes` (`aimed`: el nodo al que va la punta que se arrastra, resaltado). Inercia: `inertia`. Regulación CV/CC de cada canal: `regulate`. Polaridad invertida (`st.rev`): `circuitList` sube todo −V y voltea el
    tramo de la fuente, para que el − (y la tierra, `b.ground`) quede en 0 V a la izquierda.
- `assets/osciloscopio.js` (`Sim.scope(o)`), el generador de funciones y el osciloscopio que usan las páginas 9 a 13:
  dos canales y caimán de tierra, puntas en cualquier cable (`wires`), `frames` (cada cuadro integra el circuito y guarda
  lo que marca cada canal, ya con su acoplamiento), disparo por nivel (`scan`, `updateScope`), `measure` (MEASURE,
  AUTOSET, SET TO 50%), los acomodos del osciloscopio (`LAYOUTS`: `wide` completo, `tall` de frente en la mesa angosta,
  `compact` en la PC con los dos paneles y `mini`, el corto del celular, solo para leer; modos del dibujo `pc`, `ancho`, `solo` y `alto` en `size`), color de las partículas (`Sim.field`, `st.avg`),
  el generador (`GEN`: su acomodo en el chasis; `GMINI`: su versión corta del celular, `st.gfront` abierto; `GP`: rango,
  decimales y dígitos de FREQ, AMPL en Vpp, OFFS, DUTY y PHAS;
  `turn` y `limit`: la perilla sin fin `Sim.encoder` y el tope |offset| + Vpp/2 ≤ 10 V; `genScreen`: su pantalla),
  tarjetas y dibujo de los componentes (R tramo angosto, L rueda, D válvula de retención, C tanque; la clase es la
  primera letra de la clave: `D1`…`D4` son diodos). La página da `preset`, `places`, `wires` (nodos y componentes en
  orden), `branches` (ramas del agua con su corriente), `dots`, `solve(e, h, st)` → corriente, voltaje de cada nodo
  y corriente de cada rama, `ifull`, `rValues`, `burn` y `filter` (el capacitor se pone y se quita en su tarjeta).
  `Sim.oscNow` da su estado para probar (`st.chs`, `st.trg`, `st.m`: las medidas del último barrido).
- Páginas (`simulaciones/*/index.html`): cada una da `model`, `circuit`, `drawW`, `drawE` al banco.
  `protoboard` no usa el banco: tiene su propio dibujo, puntas, botones y tarjetas. `osciloscopio` (LED),
  `osciloscopio-rc`, `osciloscopio-diodo`, `osciloscopio-rectificador` (media onda) y `osciloscopio-onda-completa`
  (puente de cuatro diodos) solo dan su circuito a `Sim.scope`.
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

Fase 4 · Instrumentos como los del taller (boceto aprobado; un PR por instrumento):
- [x] Osciloscopio como el Tektronix TDS 2022B: VOLTS/DIV y POSITION por canal, CH MENU (CC · CA · Tierra, invertir),
  SEC/DIV y POSITION horizontal, disparo por nivel (LEVEL, TRIG MENU, SET TO 50%), MEASURE, AUTOSET, RUN/STOP; CH1
  amarillo y CH2 azul; compacto en la mesa angosta con su tecla de frente.
- [x] Generador como el JDS-2900: una perilla con FREQ · AMPL · OFFS · DUTY · PHAS y ◀ ▶ para el dígito, WAVE
  (senoidal, cuadrada, triangular, DC), tecla CH1 con su luz en vez de la palanca, AMPL en Vpp.
- [x] Fuente como la BK 1761: canales A y B de 0–35 V y 0–3 A, COARSE y FINE, CURRENT, CV/CC, una pantallita por canal
  con su tecla V/A, POWER y bornes − ⏚ + (el circuito en el A).

Celular · Instrumentos cortos y abiertos (un PR):
- [x] Cada instrumento con versión corta y abierta en el celular (como el osciloscopio): multímetro corto de solo
  lectura, fuente corta (canal A, COARSE y POWER), generador corto (pantallita, tecla 1); uno abierto a la vez.
- [x] Revisión del acomodo: `Sim.phone` en vivo (una ventana que se angosta ya no toma el acomodo de la PC), fuente
  apilada sin rótulos encimados y acomodo del celular en ventanas muy angostas.
- [x] El osciloscopio corto del celular solo se lee, como el multímetro corto (`LAYOUTS.mini`: la pantalla más grande y
  centrada, sin VOLTS/DIV ni SEC/DIV; se abre con su tecla de las flechas). En la PC con los dos paneles sigue el
  compacto con sus tres perillas.

No hacen falta (no los propongas): la salida de 50 Ω del generador, la salida fija de 5 A y los modos serie y
paralelo de la fuente, ni un segundo canal (la fuente y la bomba son de uno).

Al terminar una fase, marca sus casillas aquí en el mismo PR.
