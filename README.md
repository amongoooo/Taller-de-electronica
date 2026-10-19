# Taller de Electrónica

Simulaciones interactivas para el taller de electrónica, publicadas con GitHub Pages en
https://amongoooo.github.io/Taller-de-electronica/

## Estructura

- `index.html`: página de inicio con la lista de simulaciones.
- `assets/sim.css` y `assets/sim.js`: el formato común que comparten todas las simulaciones.
- `assets/banco.js`: el banco de agua y electricidad (bomba y fuente enlazadas, medidores con caimanes e inercia); cada simulación solo dibuja su parte del circuito.
- `simulaciones/<nombre>/index.html`: cada simulación en su propia carpeta, sin dependencias de compilación.

## Formato común

Cada simulación ocupa toda la pantalla: una barra delgada arriba (regreso, título y ajustes generales como la inercia) y dos paneles, agua y electricidad, lado a lado en pantallas horizontales o uno sobre otro en vertical. Cada fuente de energía (bomba, fuente de voltaje) es un controlador: una caja con su botón de encendido, su perilla y su medidor.

`assets/sim.js` reúne lo que se repite:

- `Sim.panel`: canvas que se escala para llenar su panel y coloca controles HTML en coordenadas del dibujo.
- `Sim.draw`: tuberías, cables, tramos angostos, resistencias y escala de perillas.
- `Sim.draw.meter`: el estilo de todos los medidores, una ruedita con aguja y una pantallita de siete segmentos con la medición.
- `Sim.water`: el agua como partículas; avanzan según el volumen que pasa (más rápido en los tramos angostos y en el centro del tubo) y su color indica la rapidez.
- `Sim.ramp` y `Sim.needle`: inercia (llega al valor en exactamente el tiempo elegido, con curva suave) y agujas con masa y resorte.
- `Sim.knob`: perilla que se gira arrastrando, con la rueda del ratón o con las flechas del teclado.

**Importante:** cada vez que cambien `assets/sim.css` o `assets/sim.js`, sube el número `?v=` con el que las páginas los cargan, para que el navegador no use una copia vieja guardada.

## Medidores con caimanes

El manómetro/voltímetro y el medidor de caudal/amperímetro están abajo, a los lados de la bomba y la fuente. Cada uno tiene un caimán rojo y uno negro que se arrastran (o se mueven con las flechas) a cualquier punto del circuito; los caimanes de los dos paneles se mueven juntos. La región entre los dos caimanes se pinta del color del medidor: morado el voltímetro y verde el amperímetro.

- El voltímetro marca voltaje(rojo) − voltaje(negro); puede salir negativo.
- El amperímetro marca la corriente que pasa por la región, positiva si va del rojo al negro. Si la región cruza un nodo y la corriente no es la misma en toda ella, muestra `----`.

Para eso cada simulación le dice al banco cómo es su circuito con `circuit(g, m, V)`: los tramos de cable, la corriente de cada uno y cuánto voltaje cae en cada componente (ver el comentario en `assets/banco.js`). Si no lo da, el banco supone una sola vuelta con todo el voltaje en el componente de arriba al centro.

## Simulaciones

1. **Voltaje y presión** (`simulaciones/voltaje-presion/`)
2. **Resistencia** (`simulaciones/resistencia/`): perilla de resistencia; el tramo angosto cambia con ella.
3. **Serie y paralelo** (`simulaciones/serie-paralelo/`): dos LEDs o ruedas; se rompen tocándolos.
4. **Interruptor y LED** (`simulaciones/interruptor-led/`): válvula/interruptor, resistencia del LED, girar el LED y quemarlo.

La versión anterior con las 4 en pestañas sigue en `simulaciones/agua-electricidad/`.

## Agregar una simulación

1. Crear una carpeta nueva en `simulaciones/` con su `index.html`.
2. Agregar una tarjeta en `index.html` que apunte a esa carpeta.
3. Subir los cambios a `main`; la página se actualiza sola en uno o dos minutos.

Para probar en local basta con abrir el archivo en el navegador o correr `python3 -m http.server` en la raíz.
