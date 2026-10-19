# Taller de Electrónica

Simulaciones interactivas para el taller de electrónica, publicadas con GitHub Pages en
https://amongoooo.github.io/Taller-de-electronica/

## Estructura

- `index.html`: página de inicio con la lista de simulaciones.
- `simulaciones/<nombre>/index.html`: cada simulación en su propia carpeta, en un solo archivo HTML sin dependencias de compilación.

## Simulaciones

- **Circuitos de agua y corriente** (`simulaciones/agua-electricidad/`): voltaje y presión, resistencia, serie y paralelo, interruptor y LED.

## Agregar una simulación

1. Crear una carpeta nueva en `simulaciones/` con su `index.html`.
2. Agregar una tarjeta en `index.html` que apunte a esa carpeta.
3. Subir los cambios a `main`; la página se actualiza sola en uno o dos minutos.

Para probar en local basta con abrir el archivo en el navegador o correr `python3 -m http.server` en la raíz.
