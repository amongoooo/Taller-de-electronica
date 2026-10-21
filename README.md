# Taller de Electrónica

Simulaciones interactivas para el taller de electrónica, publicadas con GitHub Pages en
https://amongoooo.github.io/Taller-de-electronica/

## Estructura

- `index.html`: página de inicio con la lista de simulaciones.
- `assets/sim.css` y `assets/sim.js`: el formato común que comparten todas las simulaciones.
- `assets/banco.js`: el banco de agua y electricidad (bomba y fuente enlazadas, medidores con puntas, mangueras, pinza e inercia); cada simulación solo dibuja su parte del circuito.
- `simulaciones/<nombre>/index.html`: cada simulación en su propia carpeta, sin dependencias de compilación.

## Formato común

Cada simulación ocupa toda la pantalla: una barra delgada arriba (regreso, título, un selector para ver solo el agua, ambas o solo la electricidad, y ajustes generales como la inercia) y dos paneles, agua y electricidad, lado a lado en pantallas horizontales o uno sobre otro en vertical. Cada fuente de energía (bomba, fuente de voltaje) es un controlador: una caja con su interruptor ON/OFF y su LED, su perilla con una pantallita de siete segmentos arriba que dice lo que marca la perilla, y su medidor de lo que en verdad sale.

`assets/sim.js` reúne lo que se repite:

- `Sim.panel`: canvas que se escala para llenar su panel y coloca controles HTML en coordenadas del dibujo.
- `Sim.draw`: tuberías, cables, tramos angostos, resistencias y escala de perillas.
- `Sim.draw.meter`: el estilo de todos los medidores, una ruedita con aguja y una pantallita de siete segmentos con la medición.
- `Sim.water`: el agua como partículas; avanzan según el volumen que pasa (más rápido en los tramos angostos y en el centro del tubo) y su color indica la rapidez.
- `Sim.ramp` y `Sim.needle`: inercia (llega al valor en exactamente el tiempo elegido, con curva suave) y agujas con masa y resorte.
- `Sim.steps`: botones Anterior y Siguiente en la barra para las páginas que van por pasos; con `b.showMeters({ V, I })` del banco se muestran u ocultan los medidores en cada paso.
- `Sim.knob`: perilla que se gira arrastrando, con la rueda del ratón o con las flechas del teclado.

**Importante:** cada vez que cambien `assets/sim.css` o `assets/sim.js`, sube el número `?v=` con el que las páginas los cargan, para que el navegador no use una copia vieja guardada.

## Medidores

El manómetro/voltímetro y el medidor de caudal/amperímetro están abajo, junto a la bomba y la fuente. Sus puntas se arrastran (o se mueven con las flechas) a cualquier punto del circuito y las de los dos paneles se mueven juntas. Cada punta toca el circuito de forma perpendicular, del lado (adentro o afuera) donde está el puntero al ponerla o arrastrarla, y su cable (o manguera) sale recto y se arrastra como sobre una mesa: el roce lo frena y solo se mueve donde lo jala la punta. También se puede agarrar del cuerpo para acomodar el cableado; si hace falta sale más cable del medidor, y se queda donde se deja. El botón **Cables** de la barra ajusta su rigidez (flojo o rígido) y su inercia (se frena o se desliza al soltarlo); se recuerda en el navegador.

- **Voltímetro:** dos puntas de multímetro, roja (+) y negra (−). Marca voltaje(rojo) − voltaje(negro); puede salir negativo.
- **Manómetro:** dos mangueritas con agua, roja y negra, conectadas a la pared del tubo. Cada una llena su columna en el medidor según la presión en su punto; la diferencia de alturas es lo que marca.
- **Amperímetro y caudal:** una pinza que abraza el cable (en el agua, una turbinita dentro del tubo que gira con el agua). Marca lo que pasa por ese punto.
- Tocar un medidor quita sus puntas: el siguiente toque en el circuito pone la roja y el siguiente la negra (la pinza o la turbinita con un solo toque). Tocar el medidor otra vez o Esc cancela y regresan a donde estaban.
- Tocar una punta sin arrastrarla la convierte en un pin pequeño (con + o − en el voltímetro y A en la pinza), para dejar el diagrama limpio; otro toque la vuelve a mostrar.

## Resistencias y menú de componentes

Todas las resistencias se cambian pellizcando: se agarra una de las dos marcas (claritas; se pintan de azul con el puntero o el dedo encima) y se mueve, o se pellizca con dos dedos. Con la marca de arriba, subir (arrastrando o con la rueda del ratón) ensancha el tubo y bajar lo angosta; con la de abajo es al revés. Más angosto es más resistencia. También funcionan las flechas. `b.pinch` y `b.grips` en `assets/banco.js` lo hacen para cualquier página. Los valores siempre son comerciales (serie E12: 100, 120, 150… 820 Ω y cada década).

Tocar un componente sin arrastrarlo abre su menú, una tarjetita junto a él, sin textos explicativos (`Sim.menu` en `assets/sim.js`; en el celular ocupa casi todo el ancho):

- **Resistencia (tramo angosto):** solo un slider con los valores comunes: arriba el valor actual y, a los lados, el de junto (se tocan para ir a ellos); abajo una rayita por valor.
- **LED (rueda):** el color; cada uno necesita otro voltaje para encender (rojo 1,8 V, amarillo 2 V, verde 2,2 V, azul 3 V, blanco 3,2 V; en el agua, la presión mínima para que gire la rueda), que se ve junto al nombre. También girarlo y fundirlo o poner uno nuevo.
- **Capacitor (tanque con membrana):** la capacidad, en valores comunes de 220 a 4700 µF.
- **Fusible (válvula de seguridad):** cuánta corriente aguanta (50 mA a 1 A) y ponerlo nuevo si se fundió.

En la protoboard, la resistencia y el LED tienen el mismo menú, más un botón para quitarlos. `b.part` abre el menú de un componente del banco; `Sim.resistorMenu` y `Sim.ledMenu` arman los de siempre.

## Colores

Todo va en modo claro, que se lee mejor proyectado. Los colores con significado son los mismos en todas las simulaciones: agua azul, electricidad ámbar, positivo (+) rojo, negativo (−) negro, presión y voltaje morado, caudal y corriente verde, y peligro (corto, quemado) rojo con texto.

## Simulaciones

En este orden progresivo: cada una enseña una sola cosa nueva sobre lo que ya se vio en la anterior (así aparecen numeradas en la página de inicio):

1. **Voltaje y corriente** (`simulaciones/voltaje-presion/`): la bomba y la fuente con una resistencia fija de 1 kΩ, en tres pasos con los botones **Anterior** y **Siguiente** de la barra: primero solo la fuente (encender, apagar y la perilla), luego aparece el amperímetro (caudal) y al final el voltímetro (manómetro). El paso queda en la dirección (`#paso-2`), para recargar o compartir en ese paso.
2. **Ley de Ohm** (`simulaciones/resistencia/`): el mismo circuito, pero el tramo angosto (la resistencia) empieza en 1 kΩ y se cambia pellizcando o con su menú, de 0 Ω a 10 kΩ, de ¼ W; si recibe más de ¼ W (P = I²·R) se calienta y se quema, y en el agua el tramo angosto se revienta. Abierta del todo (0 Ω) es un cortocircuito: la corriente solo la limita la resistencia interna de la fuente, los cables se ponen al rojo y el fusible (100 mA al empezar; en su menú se escoge de 50 mA a 1 A) se calienta y se funde más rápido entre más se pasa, aunque la inercia esté en 0. En el agua, en lugar del fusible hay una válvula de seguridad: el exceso de flujo empuja una bola contra su resorte hasta que cierra el tubo. Se reponen desde su menú o con el botón que aparece.
3. **Resistencias en serie y paralelo** (`simulaciones/resistencias-serie-paralelo/`): dos resistencias que se ajustan agarrando el borde del tramo angosto, pellizcándolo o con su menú.
4. **Interruptor y LED** (`simulaciones/interruptor-led/`): válvula/interruptor, resistencia del LED (se pellizca o con su menú), el color del LED, girarlo y quemarlo (desde su menú); arriba de 30 mA el LED tarda en quemarse, más rápido entre más se pasa, aunque la inercia esté en 0.
5. **LEDs en serie y paralelo** (`simulaciones/serie-paralelo/`): dos LEDs o ruedas, con su resistencia (una en serie, una por rama en paralelo). En su menú se cambia el color de cada LED (y lo que necesita para encender), se rompen o se reparan; las resistencias se pellizcan o se cambian con su menú.
6. **Protoboard** (`simulaciones/protoboard/`): una protoboard de 16 columnas con rieles + y − arriba y abajo. Cada tira de 5 agujeros (a–e, f–j) está unida por dentro; en el agua es un canal y los rieles son tubos largos. La pila de 9 V (en el agua, la bomba) tiene cables que se arrastran a cualquier agujero. De la bandeja se arrastran (o se tocan) cables, resistencias y LEDs; se mueven agarrando una pata o el cuerpo y se quitan soltándolos fuera de la protoboard. Tocar una resistencia o un LED abre su menú: el valor de la resistencia (100 Ω a 10 kΩ), el color del LED, girarlo, poner uno nuevo si está quemado y quitarlo. Tocar un agujero resalta todos los que están unidos con él y muestra su voltaje (o presión). **Por dentro** muestra u oculta las tiras de metal y los canales. Arriba de 30 mA el LED se quema y con un cortocircuito se funde el fusible de 1 A (en el agua se cierra la válvula de seguridad); se repone tocando la pila. No usa `banco.js`: resuelve el circuito por nodos en la propia página.
7. **Capacitores** (`simulaciones/capacitores/`): circuito RC con una resistencia (de 470 Ω a 10 kΩ) y un capacitor (de 220 µF a 4700 µF) que se pellizcan o se cambian con su menú. En el agua el capacitor es un tanque partido por una membrana elástica: el agua no la cruza, la estira, y la membrana estirada empuja de regreso con la presión que guarda. Un conmutador (válvula de tres vías) a la izquierda cambia entre cargar (con la fuente) y descargar (por un puente que pasa por encima de la fuente). Adentro del circuito, una gráfica del voltaje (presión) del capacitor y de la corriente (caudal), con una marca en τ = R·C, cuando la carga o la descarga lleva el 63 %. La inercia empieza en 0 para que la curva sea la del capacitor; `Sim.bench` recibe `stateful: true` para que la corriente que cambia sola con la carga no se tome como un cambio del circuito.
8. **Osciloscopio** (`simulaciones/osciloscopio/`): generador de funciones (en el agua, una bomba de vaivén que cambia de sentido) con forma de onda, frecuencia de 0.1 Hz a 1 kHz, amplitud y offset, una resistencia de 470 Ω y un LED (rueda con compuerta) que se quita. El osciloscopio (en el agua, un registrador de presión en papel) tiene V/div, tiempo/div y disparo; su punta roja y su caimán de tierra se arrastran al circuito. No usa `banco.js`: la señal se calcula en cualquier instante con la fase del generador, así se ve bien aunque cambie más rápido que la pantalla.

La primera versión con las 4 en pestañas (con textos y preguntas para el grupo) sigue en `simulaciones/agua-electricidad/`, aunque ya no aparece en la página de inicio.

## Agregar una simulación

1. Crear una carpeta nueva en `simulaciones/` con su `index.html`.
2. Agregar una tarjeta numerada en `index.html` que apunte a esa carpeta, en su lugar del orden.
3. Subir los cambios a `main`; la página se actualiza sola en uno o dos minutos.

Para probar en local basta con abrir el archivo en el navegador o correr `python3 -m http.server` en la raíz.
