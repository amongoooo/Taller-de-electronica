# Taller de Electrónica

Simulaciones interactivas para el taller de electrónica, publicadas con GitHub Pages en
https://amongoooo.github.io/Taller-de-electronica/

## Estructura

- `index.html`: página de inicio con la lista de simulaciones.
- `assets/sim.css` y `assets/sim.js`: el formato común que comparten todas las simulaciones.
- `assets/banco.js`: el banco de agua y electricidad (bomba y fuente enlazadas, medidores con puntas, mangueras, pinza e inercia); cada simulación solo dibuja su parte del circuito.
- `simulaciones/<nombre>/index.html`: cada simulación en su propia carpeta, sin dependencias de compilación.

## Formato común

Cada simulación ocupa toda la pantalla: una barra delgada arriba (regreso, título, un selector para ver solo el agua, ambas o solo la electricidad, y ajustes generales como la inercia) y dos paneles, agua y electricidad, lado a lado en pantallas horizontales o uno sobre otro en vertical. Cada fuente de energía (bomba, fuente de voltaje) es un controlador: una caja con su botón de encendido, su perilla y su medidor.

`assets/sim.js` reúne lo que se repite:

- `Sim.panel`: canvas que se escala para llenar su panel y coloca controles HTML en coordenadas del dibujo.
- `Sim.draw`: tuberías, cables, tramos angostos, resistencias y escala de perillas.
- `Sim.draw.meter`: el estilo de todos los medidores, una ruedita con aguja y una pantallita de siete segmentos con la medición.
- `Sim.water`: el agua como partículas; avanzan según el volumen que pasa (más rápido en los tramos angostos y en el centro del tubo) y su color indica la rapidez.
- `Sim.ramp` y `Sim.needle`: inercia (llega al valor en exactamente el tiempo elegido, con curva suave) y agujas con masa y resorte.
- `Sim.knob`: perilla que se gira arrastrando, con la rueda del ratón o con las flechas del teclado.

**Importante:** cada vez que cambien `assets/sim.css` o `assets/sim.js`, sube el número `?v=` con el que las páginas los cargan, para que el navegador no use una copia vieja guardada.

## Medidores

El manómetro/voltímetro y el medidor de caudal/amperímetro están abajo, junto a la bomba y la fuente. Sus puntas se arrastran (o se mueven con las flechas) a cualquier punto del circuito y las de los dos paneles se mueven juntas. Cada punta toca el circuito de forma perpendicular y su cable (o manguera) sale recto y se arrastra como sobre una mesa: el roce lo frena y solo se mueve donde lo jala la punta.

- **Voltímetro:** dos puntas de multímetro, roja (+) y negra (−). Marca voltaje(rojo) − voltaje(negro); puede salir negativo.
- **Manómetro:** dos mangueritas con agua, roja y negra, conectadas a la pared del tubo. Cada una llena su columna en el medidor según la presión en su punto; la diferencia de alturas es lo que marca.
- **Amperímetro y caudal:** una pinza que abraza el cable (en el agua, una turbinita dentro del tubo que gira con el agua). Marca lo que pasa por ese punto.
- Tocar un medidor quita sus puntas: el siguiente toque en el circuito pone la roja y el siguiente la negra (la pinza o la turbinita con un solo toque). Tocar el medidor otra vez o Esc cancela y regresan a donde estaban.
- Tocar una punta sin arrastrarla la convierte en un pin pequeño (con + o − en el voltímetro y A en la pinza), para dejar el diagrama limpio; otro toque la vuelve a mostrar.

## Resistencias

Todas las resistencias se cambian pellizcando: se agarra el borde del tramo angosto (o las marcas de la resistencia) y se mueve, o se pellizca con dos dedos. Más angosto es más resistencia. También funcionan la rueda del ratón y las flechas. `b.pinch` y `b.grips` en `assets/banco.js` lo hacen para cualquier página.

## Colores

Todo va en modo claro, que se lee mejor proyectado. Los colores con significado son los mismos en todas las simulaciones: agua azul, electricidad ámbar, positivo (+) rojo, negativo (−) negro, presión y voltaje morado, caudal y corriente verde, y peligro (corto, quemado) rojo con texto.

## Simulaciones

1. **Voltaje y presión** (`simulaciones/voltaje-presion/`)
2. **Resistencia** (`simulaciones/resistencia/`): la resistencia (de 0 Ω a 10 kΩ) se cambia pellizcando el tramo angosto. Un puente salta la resistencia para mostrar un cortocircuito: la corriente solo la limita la resistencia interna de la fuente, los cables se ponen al rojo y el fusible (100 mA) se calienta y se funde más rápido entre más se pasa, aunque la inercia esté en 0; se repone tocándolo.
3. **Serie y paralelo** (`simulaciones/serie-paralelo/`): dos LEDs o ruedas; se rompen tocándolos.
4. **Interruptor y LED** (`simulaciones/interruptor-led/`): válvula/interruptor, resistencia del LED, girar el LED y quemarlo.
5. **Resistencias en serie y paralelo** (`simulaciones/resistencias-serie-paralelo/`): dos resistencias que se ajustan agarrando el borde del tramo angosto o pellizcándolo.

La versión anterior con las 4 en pestañas sigue en `simulaciones/agua-electricidad/`.

## Agregar una simulación

1. Crear una carpeta nueva en `simulaciones/` con su `index.html`.
2. Agregar una tarjeta en `index.html` que apunte a esa carpeta.
3. Subir los cambios a `main`; la página se actualiza sola en uno o dos minutos.

Para probar en local basta con abrir el archivo en el navegador o correr `python3 -m http.server` en la raíz.
