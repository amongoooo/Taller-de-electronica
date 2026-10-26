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
  los vuelvas a poner. Solo hay pasos donde el paso cambia algo en el dibujo; lo demás lo explica la persona en clase
  y lo experimentan (no agregues pasos que solo ponen una palomita).
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
- Componentes siempre muestran su valor en el dibujo; por defecto sin su nombre (Ver → Etiquetas: Valor · Con nombre, `Sim.names()`,
  `sim-names`; `D.tag` quita el nombre a todos, LEDs, pulsadores, válvulas y entradas incluidos, y deja su valor y su estado; no
  lo quita si no hay ni valor ni estado, y con `keep` nunca, como en una equivalente). Perillas y deslizadores con imán (rebote) y zona muerta
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
    `p.at(el, pos)` coloca controles HTML en coordenadas del dibujo; `p.tagEdge(y)` dónde acaba el letrero Agua / Electricidad
    (orilla izquierda para `D.tagRow`);
    `p.begin()` limpia y deja `Sim.S` = escala del panel (para gruesos en px de pantalla).
  - `Sim.draw` (`D`): `D.text` (letra mínima de 14 px en pantalla con `Sim.px`; `t` puede ser una lista de
    rótulos y `max` elige el que cabe), `D.tag` / `D.tagRow` (etiqueta «nombre valor» y estado en `D.pill`),
    `D.knobScale` (devuelve dónde acaban sus números) y `D.knobCaption`, `D.pipe`, `D.wire`, `D.narrow`, `D.resistor`, `D.wheel`, `D.ledSymbol`,
    `D.lcd`, `D.knobScale`, `D.select` / `D.selectRot` (contorno de seleccionado), `D.chassis` (chasis común de
    los instrumentos: `--inst`, banda agua/ámbar, nombre), `D.key` (tecla física común) y `D.pushButton` (el pulsador, el
    único interruptor: en el agua la válvula con resorte).
  - `Sim.pushKey(set)`: el gesto del pulsador (un clic lo aprieta un momento; dejarlo apretado `PUSH_HOLD` lo enclava hasta
    tocarlo otra vez, con un anillo azul), su animación (`step`, `draw`) y `Sim.pushMenu` (su tarjeta: NA · NC); en el banco
    `b.pushKey({ at, set })` pone su tapa en los dos lados.
  - `Sim.fadeSel(key, on)`: 0→1 en 120 ms (aparece y se va el contorno).
  - `Sim.nodal(els, { ground, nodes, roots })`: la red de nodos de corriente directa que usan la protoboard y el Puente H.
    Elementos entre dos nodos con nombre: resistencia `{ a, b, R }`, fuente `{ a, b, V, R }` (a el +), contraelectromotriz
    `{ a, b, R, E }` (el motor), diodo `{ a, b, R, vf, s, key }` (conduce de a a b; `s[key]` guarda si conduce) y transistor
    `{ type: 'npn' | 'pnp', b, e, c, s }` (`Sim.BJT`: β = 100, Vbe 0,7 V, Vce 0,2 V saturado, para el 2N2222 y el 2N2907; en `s`
    su estado `q` corte · activo · saturado, `be`, `Ib` e `Ic` en mA; saturado conduce en los dos sentidos). Repite hasta que
    ningún estado cambia; pone `e.I` (mA, de a a b; `e.put(I)` si lo trae) y da `{ V, v, reach }`. Calor: `Sim.HEAT.bjt` (625 mW).
  - `Sim.motor(o)` (`Sim.MOTOR`): el motor de CD chico de 6 V del taller, R = 20 Ω y E = k · ω, con su volante (J) y su fricción
    (fija `Tc` y `b · ω`); `w`, `ang` (el del dibujo, `show` vueltas por vuelta), `E` para `Sim.nodal`, `rpm`, `heat` (su
    bobina, I² · R) y `step(I, dt)`.
  - `Sim.knob`, `Sim.encoder` (perilla sin fin: pasos por muesca), `Sim.snapRange` (imán, zona muerta, rueda del
    ratón), `Sim.ramp`, `Sim.needle`, `Sim.heat`.
  - `Sim.water` (agua en una vuelta cerrada) y `Sim.stream` (agua en un tramo abierto: una rama con su corriente).
  - Color de las partículas: `Sim.colorMode` (rapidez/normal, presión/voltaje, caudal/corriente), `Sim.field(x, y)` →
    [presión, caudal] de 0 a 1 que pone cada página (o el banco), y `Sim.colorPicker(panels, { ends, spot, top })`: el
    selector con su escala arriba a la derecha de cada panel. Lo usan el banco, la protoboard y el osciloscopio.
  - `Sim.instMenu(panels, { items, get, set })`: en el celular, el menú chico de los instrumentos abajo de cada panel
    (`p.inset` le deja su franja; `Sim.panel` esconde los controles de lo que queda muy abajo del dibujo, lo guardado).
  - `Sim.menu`: tarjetas. `Sim.menu.toggle(anchor, { title, rows, float, ignore })`. Filas: `values` (deslizador
    de valores comunes), `options` (colores), `seg` (segmentado), `range` (deslizador corto), `heat`
    (potencia y calor), `actions` (botones de contorno; `primary` = el lleno azul, uno por tarjeta, arriba).
    Con la columna abierta se acoplan en Componentes; `float: true` (instrumentos) las deja junto al aparato;
    en celular suben desde abajo (acostado, salen de la derecha).
  - `Sim.side`: columna/hoja de controles. `sec(k)`, `row`, `button`, `part({ anchor, menu, isOpen, toggle, visible })`
    (renglón de Componentes que abre la misma tarjeta; sin `visible`, se esconde si su marcador queda fuera del dibujo).
  - `Sim.fmt` (números con punto decimal, es-MX) y `Sim.ohm` (470 Ω, 1 kΩ, 2.2 kΩ): los formatos de todas las páginas.
  - `Sim.ORDER` (orden de las simulaciones; `Sim.last` guarda la abierta y su paso en `sim-last` para «Seguir donde te quedaste» del inicio), barra (`Sim.steps`: con `tight` solo el paso actual lleva su nombre y con `bare`, si ni el número cabe, los demás solo su raya; con `done(k)` el paso se revisa solo y, al
    cumplirse, lleva su palomita y Siguiente late (todas las páginas del curso; Cómo medir con `b.measuring()` del banco: 'V', 'A' o 'R' de verdad); `Sim.viewSwitch` con transición de vista,
    botón Siguiente y `Sim.pulseNext`, iconos de tema y pantalla completa en `.sim-tools`), globito.
  - `Sim.resistorMenu`, `Sim.ledMenu`: tarjetas de siempre.
  - `Sim.piezo(o)`: el dibujo de los conceptos en un solo panel (`data-view="solo"`, sin `Sim.viewSwitch`): bomba, dos tramos
    angostos en serie y tres tubitos (a, b, c; el regreso es g) con su regla en psi, la línea morada y el escalón de cada tramo;
    `setView('e')` pasa al circuito con su transición (Ver: Dibujo Agua · Circuito). La página da `V`, `R`, `closed`, `ground`,
    `parts` (tarjetas) y lo que dibuja encima; `Sim.piezoNow` para probar. `D.narrow(ctx, x, y, hn, half)`: `half` es su medio largo.
- `assets/banco.js` (`Sim.bench(o)`), el banco de agua y electricidad que usan 7 de las páginas:
  - Acomodos `ancho` (PC), `medio` (PC con los dos paneles), `alto` (celular vertical, o PC tan angosta que `medio`
    saldría a menos de 0.7) y `lateral` (celular acostado) (`MODES`, `geometry`): circuito de x 180 a 640 y la mesa en
    `g.DESK`; la fuente en `g.BX, g.BY`, dibujada en sus coordenadas (`SL`: `wide` la de un canal con los bornes arriba al
    centro, `mini` la versión corta; `g.FL` cuál y `g.FK` su escala; `at`/`chAt` las pasan al dibujo y dan null para lo
    que el acomodo no trae, que se esconde: `p.at` acepta null y pone `.sim-off`), si la escala de colores taparía rótulos altos (`o.head`), el circuito baja (`headTop`); multímetros en `g.meters` = [centro,
    base] con su escala `g.mk[k]` (`homeAt`, `meterAt`). En `alto` y `lateral` la caja va aparte del símbolo (`apart`);
    si no, `hoses`: de sus bornes + y − suben mangueras (cables) a la rueda (al símbolo).
  - Celular (`alto` y `lateral`, `phoneDesk`): versión corta y abierta de cada instrumento; `st.front` ('src', 'a', 'b'
    o null; 'o' el osciloscopio de frente) dice cuál está abierto (`setFront`, `b.setFront`; tecla `FOLD` con `foldArrows`, o
    el menú de los instrumentos); el abierto va solo y los demás se guardan abajo del dibujo (`STOW`). Multímetro corto
    (`shape` con `ph`, `isCompact`): solo se lee. Fuente corta: `SL.mini`. Al cambiar, `relayout` mueve las puntas
    con el circuito. En `alto` el circuito llega a lo más a `TALL` (`o.tall`, 0.8 de su ancho) y las cortas se apilan
    más grandes si cabe; en `lateral` la página puede pedir una franja arriba de la mesa para su gráfica (`o.deskGraph`
    → `g.GRAPH`). `hoses` también en el celular: de los bornes o de la orilla de la corta (`HOSE`), por detrás.
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
  - `drawSel`: contorno de cualquier componente de `circuit()` con `pr` abierto, a lo ancho de su `ext` (también en la vista de nodos).
  - Osciloscopio en la mesa (`o.scope`, la página carga `osciloscopio.js` antes): `OSC` con `Sim.scopeUnit`; en la mesa en
    lugar del segundo multímetro (`g.OS`: corto, solo se lee, acomodo `DESKL`; en el celular es otro de `phoneDesk`, 'o') y de
    frente encima del panel (`os.front`, `.sim-ofront` esconde lo demás); tres puntas que se pegan al circuito con `snap` y
    cada cuadro `sample` guarda lo que marca cada canal contra el caimán. `b.scope` da su estado.
  - Vista de nodos (Ver → Dibujo: Circuito · Nodos), solo en `como-medir` y `resistencia` (Ley de Ohm y nodos); las páginas que
    van después en `Sim.ORDER` y usan el banco (`interruptor-led`, `serie-paralelo`, `potenciometro`, `botones`, `transistor` y
    `capacitores`) dan `o.nodes: false`: sin la fila Dibujo y `b.nodesOn()` siempre false (`analyze` sigue para las puntas, los
    cortos en A, `b.where()` y `b.measuring()`), y sus componentes de `circuit()` no traen `draw` ni `tag`. `analyze`, `morph`, `drawNodes` (`aimed`: el nodo al que va la punta que se arrastra, resaltado); la página
    puede dar su acomodo con `o.nodeLayout(nodes, comps, g)` (`p` y `out` de cada nodo, `mid`, `a1` y `tagUp` de cada componente; lo usa Ley de Ohm y nodos) y quitar la fila Dibujo de Ver
    con `o.nodeRow: false` (Ley de Ohm y nodos pone Circuito · Nodos flotando con `b.linkedChoice`); los nodos van del color de su voltaje
    (`nodeColor`) y en V y Ω las puntas solo se pegan a los nodos, por un lado sin cables (`nodeDir`). Inercia: `inertia` (empieza en 0: `value="0"` del `#inercia` de cada página). Regulación CV/CC de cada canal: `regulate`. Polaridad invertida (`st.rev`): `circuitList` sube todo −V y voltea el
    tramo de la fuente, para que el − (y la tierra, `b.ground`, sin símbolo) quede en 0 V a la izquierda.
- `assets/protoboard.js`: `Sim.protoboard(o)`, la protoboard con su pila (bomba), su bandeja y su red de nodos (`solve`, con `Sim.nodal`), que usan
  `protoboard` (libre: `o.tray`, sus pasos y `load`/`clear`) y las páginas del armado guiado (`o.guide`: [{ name, piece: { type, a,
  b, R, led, color } }], un paso de `Sim.steps` por pieza; `drawSpot` su lugar punteado, `fits(j)` lo revisa por tiras, el LED con su
  polaridad; ir a un paso pone las piezas anteriores con `putTarget` y quita las de ese en adelante). Piezas: `wire`, `res`, `led`,
  `push` (el pulsador de 6 mm, cuatro patas `a`, `b`, `a2`, `b2`, sobre el canal; `a`–`a2` y `b`–`b2` unidas, apretado une `a`–`b`;
  su tapa es `Sim.pushKey` con una `.sim-hit` en cada panel, `keyOf`), `pot` (el potenciómetro de 10 kΩ: patas `a`, `w` (el cursor) y
  `b` en tres columnas seguidas, `potHoles`; `x` de 0 en `a` a 1 en `b`; dibujado en su marco `frameOf` con `POT`, el cuerpo arriba de
  las patas; su perilla es una `.sim-hit pb-knob` en cada panel, `knobOf`, que se gira con `setX`) y `npn` (el transistor 2N2222 en
  TO-92: patas `a` emisor, `w` base y `b` colector en tres columnas seguidas, en una fila de las tiras; el cuerpo hacia el canal, en su
  marco con `NPN`, y su nombre con su estado en `drawNpnTag`, encima de todo; en `solve` es un `{ type: 'npn' }` de `Sim.nodal`;
  calor `Sim.HEAT.bjt`);
  `legsOf` y `legCurrents` dan sus patas y sus corrientes. `pnp` es igual que `npn` (`isQ` las dos; `qName` su nombre) con la física del
  PNP; con `dir: -1` en la pieza del paso, el transistor va volteado (`potHoles(c, r, d)`: su emisor a la derecha y su cuerpo hacia el
  otro lado; al moverlo no se voltea). `motor` (`makeMotor`, `Sim.motor` en `k.m`): sus dos cables `a` y `b` a dos agujeros y su cuerpo
  en `at` [u, v], fuera de los agujeros (se arrastra con sus cables); `drawMotor` y `drawMotorTag` (gira, frenado o parado). Una
  resistencia con `side: -1` lleva su valor del otro lado. Opciones: `o.cols` (16 si falta; `GEO` crece con `N`), `o.volts` (la pila,
  9 V) y `o.minus` (el agujero de la punta negra, [0, 1]). `put(j)` pone la pieza del paso j (para probar).
  `Sim.pbNow` para probar.
- `assets/osciloscopio.js`: `Sim.scopeUnit(st, ui)` es el osciloscopio solo (lo que guarda con `record`, barrido, disparo y
  medidas con `update`, sus mandos con `ui.button`/`ui.knob` y su dibujo con `draw(ctx, L, side)`; sin circuito ni puntas), y
  `Sim.scope(o)`, el generador de funciones con el osciloscopio que usan las páginas del bloque de señales (menos Capacitores, que usa el banco):
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
- `index.html` (inicio): bloques que siguen el curso (conceptos · armar y medir · proyecto final · señales), miniaturas SVG de cada circuito
  (`MINI`, piezas en `PIECE`) y «Seguir donde te quedaste» (lee `sim-last`). Sin descripciones.
- Páginas (`simulaciones/*/index.html`): cada una da `model`, `circuit`, `drawW`, `drawE` al banco.
  `voltaje-concepto` (Voltaje, corriente y resistencia: los tres conceptos en tres pasos) no usa el banco ni instrumentos: usa
  `Sim.piezo` con la válvula del regreso, la tierra que se arrastra a un tubito o al regreso, R1 y R2 con largo y grosor en su
  tarjeta (y su calor, ¼ W) y, desde el paso 2, dos contadores que se arrastran por la vuelta (su lectura va donde menos se corre). `resistencia` (Ley de Ohm y nodos, sin pasos: fusible, R1 y hasta tres resistencias de ¼ W en paralelo entre los mismos dos
  nodos, con lugares punteados para agregarlas; 0 Ω es un corto; Ver → Corrientes y Equivalente; `Sim.ohmNow` para probar). `potenciometro` (Potenciómetro, dos pasos: divisor de voltaje y
  resistencia variable con un LED): la pista de pie en `XP` partida en el cursor en dos componentes (`RA` de A al cursor y `RB`
  del cursor a B, con su largo de verdad: para las puntas son dos resistencias), la toma a `XT`; el agua con `Sim.stream`
  (avanza por fase, así no se pierde al mover el cursor); su propio elemento para tocar y arrastrar el cursor; `Sim.potNow`
  para probar. `botones` (Botones, dos pasos: el pulsador NA o NC con un LED, y pull-down y pull-up): el pulsador es un
  componente con dos zonas, su tapa (mando, `b.pushKey`: un clic lo aprieta un momento y dejarlo apretado lo enclava, `st.press`) y su cuerpo (`b.part`, su tarjeta con
  Normalmente: Abierto · Cerrado); en el paso 2, el pulsador y la resistencia en serie en `XA` y `XB` (se cambian de lugar con
  Pull-down · Pull-up, en su tarjeta y en Armar) y la entrada baja del nodo `XN` a su terminal; sin la resistencia (su lugar
  punteado) la entrada flota (`st.fl`, al azar entre 0 y V); `Sim.btnNow` para probar. `transistor` (Transistor, dos pasos: botón en la base y
  potenciómetro en la base): el NPN 2N2222 en `XQ` (colector arriba, emisor abajo, base por la izquierda) con β = 100, Vbe 0,7 V y
  Vce 0,2 V saturado (`solve(V)`: corrientes, voltajes y estado; `model` da `branch` [Ic, Ib, Ibot] para la inercia); son dos
  componentes, `CE` (su dibujo completo: en el agua la compuerta con su paleta, su resorte y el agua de adentro) y `BE` (sin dibujo
  propio: separa el nodo de la base del emisor, para medir Vbe); la altura de la base y del cable de la tierra del potenciómetro (`yQ`, `yG`, que baja en `XG` al cable de
  abajo) salen del alto del circuito; `Sim.qNow` para probar. `capacitores` lleva el osciloscopio en la mesa (`scope`) en lugar de su gráfica. `puente-h` (Puente H, el proyecto final,
  después de Transistor en la protoboard; dos pasos: «Un lado» y «Los dos sentidos») resuelve con `Sim.nodal` y mueve el motor con
  `Sim.motor`; se dibuja en su cuadrícula local (`X`, `Y`: columnas de la mitad izquierda, la derecha es su espejo `mx`; renglones
  relativos a la salida) que `frame(g)` lleva a las coordenadas del banco y achica (`k`) si no cabe en el alto (`NEED`); las etiquetas van
  en las del banco (para la letra mínima); los dos pulsadores son `b.pushKey`; `Sim.hNow` para probar. `protoboard` no usa el banco: es `Sim.protoboard` libre (cables y resistencias). `interruptor-led-armado` (Interruptor y LED en la protoboard, después de Interruptor y LED) es el armado guiado: cable rojo, pulsador, 470 Ω, LED, cable negro y, al final, el pull-down de 10 kΩ de la tira del pulsador (la 5) al riel − (sin él, con el pulsador suelto y el LED apagado, las tiras 5 y 9 flotan: «sin conexión»). `potenciometro-armado` (Potenciómetro en la protoboard, después de Potenciómetro): potenciómetro en d5–d7, cable rojo a la tira 7, cable negro a la 5, 470 Ω del cursor por encima del canal, LED y cable puente de regreso a la tira 5. `transistor-armado` (Transistor en la protoboard, después de Transistor): transistor en b7–b9 (E, B, C), cable negro del emisor al riel −, 470 Ω del riel + a a10, LED de e10 al colector (e9), cable rojo a la tira 2, 10 kΩ de la base de d2 a d6, pulsador de la tira 6 a la 8 (la base) y el pull-down de 10 kΩ de a8 al riel − (sin él, con el pulsador suelto la base flota: «sin conexión»). `puente-h-armado` (Puente H en la protoboard, después de Puente H) es su armado guiado:
  en 20 columnas y con la pila de 6 V (punta negra al riel − de abajo); por lado, PNP en la fila b, NPN volteado en la fila i, el cable
  verde de la salida sobre el canal, el pulsador en la orilla, 4,7 kΩ, 1 kΩ y el pull-down; al final el motor en medio. `osciloscopio` (LED),
  `osciloscopio-rc` (la frecuencia frente a τ), `osciloscopio-rectificador` (Diodo y media onda: el diodo en directa e inversa y luego la media onda)
  y `osciloscopio-onda-completa` (puente de cuatro diodos) solo dan su circuito a `Sim.scope`; las que van por pasos ponen
  los valores del taller de cada paso con `apply` (lo que da `Sim.scope`: los mismos campos que `preset`, sin las puntas).
  `agua-electricidad` es la versión vieja (no está en `Sim.ORDER`). Las páginas que se quitaron dejan en su carpeta una
  redirección a la que las tiene ahora (para las direcciones guardadas) y su nombre en `MOVED` del inicio: `voltaje-presion` →
  `como-medir` (su paso «La fuente» es el primero de Cómo medir) `nodos` y `resistencias-serie-paralelo` → `resistencia` (Ley de Ohm y nodos), `osciloscopio-diodo` → `osciloscopio-rectificador` (su paso «Directa e inversa»), `botones-armado` → `interruptor-led-armado` (su paso «Pull-down») y
  `corriente-concepto` y `resistencia-concepto` → `voltaje-concepto` (su paso «Corriente y resistencia»).

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

Orden del curso (aprobado; un PR por parte): conceptos sin instrumentos → armar y medir con fuente y multímetro (Cómo
medir, Ley de Ohm y nodos, Protoboard, Interruptor y LED, LEDs en serie y paralelo) → señales. Las direcciones de las páginas no cambian, solo el orden (`Sim.ORDER`, inicio, `tools/capturas.js`).
- [x] Reordenar y página **Nodos** (`simulaciones/nodos/`); Cómo medir sin su paso «Los nodos».
- [x] **Voltaje = presión** (`simulaciones/voltaje-concepto/`, concepto, sin instrumentos): solo hay corriente si hay diferencia entre dos puntos; la tierra es 0 V.
- [x] **Corriente = caudal** (`simulaciones/corriente-concepto/`): lo que cruza una línea por segundo; es la misma en toda la vuelta (no se gasta).
- [x] **Resistencia** (`simulaciones/resistencia-concepto/`): más angosto o más largo deja pasar menos; con la misma presión, menos caudal y calor.
- [x] Los tres conceptos con los tubitos (`Sim.piezo`) y juntos en una sola página, **Voltaje, corriente y resistencia**
  (`voltaje-concepto`), con ocho pasos y el paso al circuito al final.
- [x] Etiquetas solo con el valor (Ver → Etiquetas: Valor · Con nombre).
- [x] Pasos solo donde cambian el dibujo (seis páginas sin pasos; los repetidos juntos).
- [x] **Ley de Ohm y nodos** (`simulaciones/resistencia/`) junta Ley de Ohm y Nodos, después de Cómo medir y sin pasos;
  `nodos/` redirige ahí.
- [x] Protoboard: el primer paso solo con resistencias (el LED se explica después, en Interruptor y LED).

Componentes de proyecto (aprobado; una página y un PR por cada una, con el banco, después de LEDs en serie y paralelo y en
este orden, porque cada una usa la anterior):
- [x] **Potenciómetro** (10 kΩ lineal, el del taller): en agua, un tramo angosto largo con una toma que se desliza
  (el cursor). Divisor de voltaje medido en el cursor; luego resistencia variable en serie con un LED y su resistencia de
  protección (brillo y corriente máxima).
- [x] **Botones**: pulsador normalmente abierto y cerrado (en agua, una válvula con resorte que se cierra sola al soltarla);
  resistencia de pull-down o pull-up (sin ella el nodo queda flotando).
- [x] **Transistor** NPN como interruptor (2N2222, el del taller; en agua, una compuerta grande que abre un
  chorrito, la base): el botón en la base prende un LED; luego el potenciómetro en la base (Ic = β·Ib hasta saturar,
  Vbe ≈ 0,7 V y Vce ≈ 0,2 V medibles).

Armado en protoboard (aprobado; con agua, una página aparte después de cada simulación y sin multímetro; un PR por fase):
- [x] Fase 1: la protoboard en `assets/protoboard.js` con el armado guiado y **Interruptor y LED en la protoboard**
  (`simulaciones/interruptor-led-armado/`).
- [x] Fase 2: Potenciómetro en la protoboard (`simulaciones/potenciometro-armado/`).
- [x] Fase 3: Botones en la protoboard, como último paso de Interruptor y LED en la protoboard (el pull-down;
  `botones-armado/` redirige ahí). Con un LED el pull-down casi no se nota: donde importa es en la base del transistor (fase 4).
- [x] Fase 4: Transistor en la protoboard (`simulaciones/transistor-armado/`, con la pieza `npn` y el pull-down de la base al final).

Proyecto final: Puente H (después de Transistor en la protoboard, antes del bloque de señales; un PR por casilla, en este orden):
- [x] Física común: `Sim.nodal` en `assets/sim.js` (la red de nodos de la protoboard, que da lo mismo que antes), el PNP 2N2907 y
  el motor de CD (`Sim.motor`).
- [x] **Puente H** (`simulaciones/puente-h/`, con `Sim.bench`): dos medios puentes complementarios (PNP arriba, NPN abajo, bases a
  su entrada por 4,7 kΩ y 1 kΩ), cada entrada con su pulsador al + y su pull-down de 470 Ω (con 10 kΩ y 1 kΩ en las dos bases, como se pidió primero, la base
  del PNP sube la entrada a casi 3 V y prende también el NPN); el motor en medio (en el agua, una turbina con volante). Medible con los multímetros.
- [x] **Puente H en la protoboard** (`simulaciones/puente-h-armado/`): piezas `pnp` y `motor` (fuera de la protoboard, con sus dos
  cables), un paso por pieza (21), en una protoboard de 20 columnas y con la pila de 6 V.

No hacen falta (no los propongas): la salida de 50 Ω del generador, la salida fija de 5 A y los modos serie y
paralelo de la fuente, ni un segundo canal (la fuente y la bomba son de uno), ni páginas de fotorresistencia (LDR)
o relé.

Al terminar una fase, marca sus casillas aquí en el mismo PR.
