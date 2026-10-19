# Taller de Electrónica

Simulaciones interactivas para el taller de electrónica, publicadas con GitHub Pages en
https://amongoooo.github.io/Taller-de-electronica/

## Estructura

- `index.html`: página de inicio con la lista de simulaciones.
- `assets/sim.css` y `assets/sim.js`: el formato común que comparten todas las simulaciones.
- `simulaciones/<nombre>/index.html`: cada simulación en su propia carpeta, sin dependencias de compilación.

## Formato común

Cada simulación ocupa toda la pantalla: una barra delgada arriba (regreso, título y ajustes generales como la inercia) y dos paneles, agua y electricidad, lado a lado en pantallas horizontales o uno sobre otro en vertical. Cada fuente de energía (bomba, fuente de voltaje) es un controlador: una caja con su botón de encendido, su perilla y su medidor.

`assets/sim.js` reúne lo que se repite:

- `Sim.panel`: canvas que se escala para llenar su panel y coloca controles HTML en coordenadas del dibujo.
- `Sim.draw`: tuberías, cables, tramos angostos, resistencias y escala de perillas.
- `Sim.draw.meter`: el estilo de todos los medidores, una ruedita con aguja y una pantallita de siete segmentos con la medición.
- `Sim.water`: el agua como partículas; avanzan según el volumen que pasa (más rápido en los tramos angostos y en el centro del tubo) y su color indica la rapidez.
- `Sim.lag` y `Sim.needle`: inercia de primer orden y agujas con masa y resorte.
- `Sim.knob`: perilla que se gira arrastrando, con la rueda del ratón o con las flechas del teclado.

**Importante:** cada vez que cambien `assets/sim.css` o `assets/sim.js`, sube el número `?v=` con el que las páginas los cargan, para que el navegador no use una copia vieja guardada.

## Simulaciones

- **Voltaje y presión** (`simulaciones/voltaje-presion/`): primera en el formato común.
- **Circuitos de agua y corriente** (`simulaciones/agua-electricidad/`): versión anterior con las 4 simulaciones en pestañas.

## Agregar una simulación

1. Crear una carpeta nueva en `simulaciones/` con su `index.html`.
2. Agregar una tarjeta en `index.html` que apunte a esa carpeta.
3. Subir los cambios a `main`; la página se actualiza sola en uno o dos minutos.

Para probar en local basta con abrir el archivo en el navegador o correr `python3 -m http.server` en la raíz.
