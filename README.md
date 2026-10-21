# Taller de Electrónica

Simulaciones interactivas para el taller de electrónica, publicadas con GitHub Pages en
https://amongoooo.github.io/Taller-de-electronica/

## Estructura

- `index.html`: página de inicio con la lista de simulaciones.
- `assets/sim.css` y `assets/sim.js`: el formato común que comparten todas las simulaciones.
- `assets/banco.js`: el banco de agua y electricidad (bomba y fuente enlazadas, medidores con puntas, mangueras, pinza e inercia); cada simulación solo dibuja su parte del circuito.
- `simulaciones/<nombre>/index.html`: cada simulación en su propia carpeta, sin dependencias de compilación.

## Formato común

Cada simulación ocupa toda la pantalla: una barra delgada arriba (regreso, título, pasos si la página los tiene, el selector **Agua · Ambos · Electricidad**, las flechas a la simulación anterior y la siguiente, **¿Qué se toca?** y **Controles**) y dos paneles, agua y electricidad, lado a lado en pantallas horizontales o uno sobre otro en vertical.

Los controles están ordenados por acción, cada una con su color y siempre en el mismo lugar: **Cambiar componentes** (verde), **Medir** (morado), **Alimentar** (ámbar: la fuente y la bomba se manejan solo en su instrumento, como en el laboratorio), **Armar** (la protoboard) y **Ver** (azul). En la computadora, Cambiar componentes, Medir, Armar y Ver van en una columna a la derecha (se esconde con el botón Controles): la lista de componentes con su valor (tocar uno abre su menú ahí mismo, igual que tocarlo en el dibujo), las lecturas de los medidores conectados, la rigidez de los cables, el color de las partículas, la inercia y pantalla completa. En una ventana angosta la columna sale como un cajón y en el celular como una hoja desde abajo. Al pasar el ratón sobre algo del dibujo aparece su acción y su nombre, y **¿Qué se toca?** marca por unos segundos todo lo que se puede tocar con el color de su acción. En el celular vertical la vista y las flechas de simulación van en una barra abajo, se ve un solo lado a la vez (Ambos está en Controles), los medidores empiezan compactados y los menús de los componentes suben desde abajo. Cada fuente de energía (bomba, fuente de voltaje) es un controlador: una caja con su interruptor ON/OFF y su LED, su perilla con una pantallita de siete segmentos arriba que dice lo que marca la perilla, y su medidor de lo que en verdad sale. La bomba y la fuente del banco funcionan como una fuente de laboratorio: tienen dos perillas, voltaje (presión) y límite de corriente (caudal máximo, de 1 mA a 1 A), cada una con su pantallita, y dos LEDs, CV (verde) y CC (rojo). Mientras la corriente no llega al límite sale el voltaje de la perilla (CV); si se pasaría, la fuente sostiene la corriente justo en el límite y baja el voltaje lo necesario (CC), así que un cortocircuito da exactamente el límite.

`assets/sim.js` reúne lo que se repite:

- `Sim.panel`: canvas que se escala para llenar su panel y coloca controles HTML en coordenadas del dibujo.
- `Sim.draw`: tuberías, cables, tramos angostos, resistencias y escala de perillas.
- `Sim.draw.meter`: el estilo de todos los medidores, una ruedita con aguja y una pantallita de siete segmentos con la medición.
- `Sim.water`: el agua como partículas; avanzan según el volumen que pasa (más rápido en los tramos angostos y en el centro del tubo) y su color indica la rapidez.
- `Sim.ramp` y `Sim.needle`: inercia (llega al valor en exactamente el tiempo elegido, con curva suave) y agujas con masa y resorte.
- `Sim.steps`: barra de progreso con flechas junto al título para las páginas que van por pasos; las flechas de simulación (abajo en el celular) primero recorren los pasos y luego cambian de simulación; con `b.showMeters({ V, I })` del banco se muestran u ocultan los medidores en cada paso.
- `Sim.knob`: perilla que se gira arrastrando, con la rueda del ratón o con las flechas del teclado. Tiene imán: se queda en su valor (solo se estira un poco hacia el puntero) hasta que el puntero se pasa bien hacia el siguiente, y entonces salta con rebote; los valores redondos (`magnet`) jalan desde más lejos. `Sim.snapRange` hace lo mismo con un slider, con un pequeño latido al saltar: lo usan los sliders de los menús, el del color y la inercia (que se engancha en 0, 0,5, 1… s).

**Importante:** cada vez que cambien `assets/sim.css` o `assets/sim.js`, sube el número `?v=` con el que las páginas los cargan, para que el navegador no use una copia vieja guardada.

## Multímetro

Abajo, junto a la bomba y la fuente, hay un multímetro (en el agua, un medidor equivalente) que se ve como uno de verdad: funda de color, pantalla, una rueda grande **OFF · V · A · Ω** (en el agua OFF · psi · mL/s · kΩ) y dos bornes, **VΩA** (rojo, +) y **COM** (negro, −). Los cables nunca cambian de borne: solo se gira la rueda. Tocar una posición de la rueda la gira ahí; tocar su centro pasa a la siguiente (también en Controles → Medir y con las flechas). La perilla elige también el color de las partículas: en V por voltaje (presión), en A por corriente (caudal), en Ω u OFF el de siempre. En Medir, **Sacar un segundo multímetro** pone otro igual al lado, para medir dos cosas a la vez (por ejemplo voltaje y corriente); al sacarlo se toca el circuito para conectarlo.

- **V (presión):** las dos puntas entre dos puntos. Marca voltaje(rojo) − voltaje(negro); puede salir negativo. En el agua, dos mangueritas conectadas a la pared del tubo.
- **A (caudal):** también con sus dos puntas separadas. Con las dos en el mismo cable, junto a un componente, el cable se corta entre ellas y toda la corriente pasa por el multímetro, que queda en serie; marca positivo si entra por la roja. En A el multímetro es casi un cable: con las puntas en dos nodos distintos (como para medir voltaje) hace un corto y se funde su fusible (en el agua se cierra su válvula). Marca 0 hasta cambiarlo con **Cambiar su fusible** en Medir.
- **Ω (resistencia):** como uno de verdad, hace pasar 1 mA de la punta roja a la negra y divide el voltaje que aparece. Con la fuente apagada da la resistencia entre los dos nodos con todo lo que esté conectado entre ellos (otra resistencia en paralelo baja la lectura; un LED, un capacitor o un interruptor abierto no conducen; sin camino marca O.L). La fuente encendida es un camino de 0 Ω y su voltaje se suma: la lectura no sirve y el multímetro avisa "hay voltaje, apaga la fuente". Cada componente de `circuit()` trae su resistencia en `R` (ohmios) para esto.
- **OFF:** la pantallita se apaga.

Sus puntas se arrastran (o se mueven con las flechas) a cualquier punto del circuito y las de los dos paneles se mueven juntas. Cada punta toca el circuito de forma perpendicular, del lado (adentro o afuera) donde está el puntero al ponerla o arrastrarla, y su cable (o manguera) sale recto y se arrastra como sobre una mesa: el roce lo frena y solo se mueve donde lo jala la punta. También se puede agarrar del cuerpo para acomodar el cableado; si hace falta sale más cable del medidor, y se queda donde se deja. **Cables y mangueras**, en la sección Medir de Controles, ajusta su rigidez (flojo o rígido) y su inercia (se frena o se desliza al soltarlo); se recuerda en el navegador.

- Tocar el multímetro quita sus puntas: el siguiente toque en el circuito pone la roja y el siguiente la negra. Tocarlo otra vez o Esc cancela y regresan a donde estaban.
- Tocar una punta sin arrastrarla la convierte en un pin pequeño (con + o −), para dejar el diagrama limpio; otro toque la vuelve a mostrar.
- En Medir, cada multímetro tiene su lectura, su perilla, **Invertir** (cambia de lugar las puntas) y **Negra a tierra** (no en A).

## Resistencias y menú de componentes

Todas las resistencias se cambian pellizcando: se agarra una de las dos marcas (no se ven hasta que el puntero o el dedo está encima; entonces salen en gris clarito) y se mueve, o se pellizca con dos dedos. Con la marca de arriba, subir (arrastrando o con la rueda del ratón) ensancha el tubo y bajar lo angosta; con la de abajo es al revés. Más angosto es más resistencia. También funcionan las flechas. `b.pinch` y `b.grips` en `assets/banco.js` lo hacen para cualquier página. Los valores siempre son comerciales (serie E12: 100, 120, 150… 820 Ω y cada década).

Tocar un componente sin arrastrarlo abre su menú sin textos explicativos. En la computadora, con la columna de controles abierta, los menús se acomodan en su sección Cambiar componentes, uno debajo del otro, y se quedan abiertos hasta tocar su ×; con la columna escondida van a la derecha del dibujo si hay lugar. Cada componente lleva siempre su nombre y su valor en el dibujo (`b.tag`, "resistencia 1 kΩ"); mientras su menú está abierto, el valor sale en azul. La barra de colores de las partículas va en la esquina de arriba a la derecha de cada panel, con tres puntitos (uno por modo): tocarla pasa al modo siguiente, deslizar el dedo avanza o regresa y tocar un puntito va a ese modo; también se elige en Ver. Si no hay lugar, es una tarjetita junto al componente (`Sim.menu` en `assets/sim.js`; en el celular sube desde abajo):

- **Resistencia (tramo angosto):** solo un slider con los valores comunes: arriba el valor actual y, a los lados, el de junto (se tocan para ir a ellos); abajo una rayita por valor.
- **LED (rueda):** el color; cada uno necesita otro voltaje para encender (rojo 1,8 V, amarillo 2 V, verde 2,2 V, azul 3 V, blanco 3,2 V; en el agua, la presión mínima para que gire la rueda), que se ve junto al nombre. También girarlo y fundirlo o poner uno nuevo.
- **Capacitor (tanque con membrana):** la capacidad, en valores comunes de 220 a 4700 µF.
- **Fusible (válvula de seguridad):** cuánta corriente aguanta (50 mA a 1 A) y ponerlo nuevo si se fundió.

En la protoboard, la resistencia y el LED tienen el mismo menú, más un botón para quitarlos. `b.part` abre el menú de un componente del banco; `Sim.resistorMenu` y `Sim.ledMenu` arman los de siempre.

## Vista de nodos

En Controles → Ver, **Dibujo: Circuito | Nodos** (en todas las simulaciones del banco). Con Nodos los cables, que son ideales, se juntan: todo lo que está unido por cable (o tubería) es un solo nodo, un punto del color de su voltaje (la misma escala que las partículas en modo voltaje) con su valor, y la tierra lleva su símbolo de 0 V. Entre los nodos solo quedan los componentes, con su nombre y su valor; los que van entre los mismos dos nodos (en paralelo) quedan lado a lado. El cambio es animado: primero cada cable toma el color de su nodo y luego se encoge hasta el punto. Las puntas siguen funcionando: en V se pegan al nodo más cercano (medir voltaje es comparar dos nodos) y en A las dos puntas van en el cable entre un nodo y un componente (medir corriente es abrir el camino y meterlo en serie). Los nodos salen solos de los tramos que da cada página (`circuit()` en `banco.js`); cada componente trae cómo se dibuja (`draw`) y su etiqueta (`tag`).

## Colores

Todo va en modo claro, que se lee mejor proyectado. Los colores con significado son los mismos en todas las simulaciones: agua azul, electricidad ámbar, positivo (+) rojo, negativo (−) negro, presión y voltaje morado, caudal y corriente verde, y peligro (corto, quemado) rojo con texto.

## Simulaciones

En este orden progresivo: cada una enseña una sola cosa nueva sobre lo que ya se vio en la anterior (así aparecen numeradas en la página de inicio):

1. **Voltaje y corriente** (`simulaciones/voltaje-presion/`): la bomba y la fuente con una resistencia fija de 1 kΩ, en tres pasos con las flechas de los pasos en la barra: primero solo la fuente (encender, apagar y la perilla), luego aparece el multímetro en A, con sus dos puntas cortando el cable, para la corriente (caudal) y al final con la perilla en V para el voltaje (presión). El paso queda en la dirección (`#paso-2`), para recargar o compartir en ese paso.
2. **Cómo medir** (`simulaciones/como-medir/`): la fuente de 9 V con dos resistencias en serie (R1 de 1 kΩ y R2 de 2 kΩ), en cinco pasos: **Los nodos** (el circuito se transforma en nodos: 9 V, 6 V y la tierra en 0 V), **Medir voltaje** (el multímetro en V: marca la diferencia entre los dos nodos que tocan sus puntas; en el mismo nodo marca 0), **Medir corriente** (hay que girar la rueda a A y poner las dos puntas en el mismo cable junto a un componente: el cable se corta entre ellas; en dos nodos distintos se funde el fusible), **Medir resistencia** (perilla en Ω con la fuente apagada: R1, R2 o las dos en serie) y **Reto** (medir el voltaje de R2 y la corriente, una después de la otra o con un segundo multímetro; avisa con ✓ o ✗ y cada una queda palomeada al medirla bien). Un aviso arriba del circuito dice lo que está pasando.
3. **Ley de Ohm** (`simulaciones/resistencia/`): el mismo circuito, pero el tramo angosto (la resistencia) empieza en 1 kΩ y se cambia pellizcando o con su menú, de 0 Ω a 10 kΩ, de ¼ W; si recibe más de ¼ W (P = I²·R) se calienta y se quema, y en el agua el tramo angosto se revienta. Abierta del todo (0 Ω) es un cortocircuito: la fuente llega a su límite de corriente (500 mA al empezar) y baja su voltaje casi a 0, los cables se ponen al rojo y el fusible (100 mA al empezar; en su menú se escoge de 50 mA a 1 A) se calienta y se funde más rápido entre más se pasa, aunque la inercia esté en 0. En el agua, en lugar del fusible hay una válvula de seguridad: el exceso de flujo empuja una bola contra su resorte hasta que cierra el tubo. Se reponen desde su menú o con el botón que aparece.
4. **Resistencias en serie y paralelo** (`simulaciones/resistencias-serie-paralelo/`): dos resistencias que se ajustan agarrando el borde del tramo angosto, pellizcándolo o con su menú; cada una lleva su nombre y su valor (R1 1 kΩ) y se cambia con su menú. Arriba a la izquierda, un selector **Serie | Paralelo** (`b.linkedChoice`), igual que en LEDs en serie y paralelo.
5. **Interruptor y LED** (`simulaciones/interruptor-led/`): válvula/interruptor, resistencia del LED (se pellizca o con su menú), el color del LED, girarlo y quemarlo (desde su menú); arriba de 30 mA el LED tarda en quemarse, más rápido entre más se pasa, aunque la inercia esté en 0.
6. **LEDs en serie y paralelo** (`simulaciones/serie-paralelo/`): dos LEDs o ruedas, con su resistencia (una en serie, una por rama en paralelo). En su menú se cambia el color de cada LED (y lo que necesita para encender), se rompen o se reparan; las resistencias se pellizcan o se cambian con su menú.
7. **Protoboard** (`simulaciones/protoboard/`): una protoboard de 16 columnas con rieles + y − arriba y abajo. Cada tira de 5 agujeros (a–e, f–j) está unida por dentro; en el agua es un canal y los rieles son tubos largos. La pila de 9 V (en el agua, la bomba) tiene cables que se arrastran a cualquier agujero. De la bandeja se arrastran (o se tocan) cables, resistencias y LEDs; se mueven agarrando una pata o el cuerpo y se quitan soltándolos fuera de la protoboard. Tocar una resistencia o un LED abre su menú: el valor de la resistencia (100 Ω a 10 kΩ), el color del LED, girarlo, poner uno nuevo si está quemado y quitarlo. Tocar un agujero resalta todos los que están unidos con él y muestra su voltaje (o presión). **Por dentro** muestra u oculta las tiras de metal y los canales. Arriba de 30 mA el LED se quema y con un cortocircuito se funde el fusible de 1 A (en el agua se cierra la válvula de seguridad); se repone tocando la pila. No usa `banco.js`: resuelve el circuito por nodos en la propia página.
8. **Capacitores** (`simulaciones/capacitores/`): circuito RC con una resistencia (de 470 Ω a 10 kΩ) y un capacitor (de 220 µF a 4700 µF) que se pellizcan o se cambian con su menú. En el agua el capacitor es un tanque partido por una membrana elástica: el agua no la cruza, la estira, y la membrana estirada empuja de regreso con la presión que guarda. Un conmutador (válvula de tres vías) a la izquierda cambia entre cargar (con la fuente) y descargar (por un puente que pasa por encima de la fuente). Adentro del circuito, una gráfica del voltaje (presión) del capacitor y de la corriente (caudal), con una marca en τ = R·C, cuando la carga o la descarga lleva el 63 %. La inercia empieza en 0 para que la curva sea la del capacitor; `Sim.bench` recibe `stateful: true` para que la corriente que cambia sola con la carga no se tome como un cambio del circuito.
9. **Osciloscopio** (`simulaciones/osciloscopio/`): generador de funciones (en el agua, una bomba de vaivén que cambia de sentido) con forma de onda, frecuencia de 0.1 Hz a 1 kHz, amplitud y offset, una resistencia de 470 Ω y un LED (rueda con compuerta) que se quita. El osciloscopio (en el agua, un registrador de presión en papel) tiene V/div, tiempo/div y disparo; su punta roja y su caimán de tierra se arrastran al circuito. No usa `banco.js`: la señal se calcula en cualquier instante con la fase del generador, así se ve bien aunque cambie más rápido que la pantalla.

La primera versión con las 4 en pestañas (con textos y preguntas para el grupo) sigue en `simulaciones/agua-electricidad/`, aunque ya no aparece en la página de inicio.

## Agregar una simulación

1. Crear una carpeta nueva en `simulaciones/` con su `index.html`.
2. Agregar una tarjeta numerada en `index.html` que apunte a esa carpeta, en su lugar del orden.
3. Subir los cambios a `main`; la página se actualiza sola en uno o dos minutos.

Para probar en local basta con abrir el archivo en el navegador o correr `python3 -m http.server` en la raíz.
