# Pinza Bluetooth

Interfaz web para controlar una pinza robótica conectada a una ESP32 mediante Bluetooth Low Energy.

## Comportamiento

- La pinza permanece abierta por defecto.
- Mantener presionado el botón envía `CLOSE` cada 250 ms.
- Soltar, cancelar el gesto, cambiar de pestaña o perder el foco envía `OPEN`.
- Si se pierde la conexión, el firmware de la ESP32 abre la pinza por seguridad.

## UUID BLE

- Servicio: `b7f10001-9c8d-4f3a-a6d5-8d2e937b2201`
- Comandos: `b7f10002-9c8d-4f3a-a6d5-8d2e937b2201`
- Estado: `b7f10003-9c8d-4f3a-a6d5-8d2e937b2201`

Nombre anunciado por la ESP32: `PINZA-ESP32`.

## Publicación

El repositorio incluye el workflow `.github/workflows/deploy-pages.yml` para publicar automáticamente el sitio al hacer `push` sobre `main`.

En GitHub, selecciona una sola vez:

`Settings → Pages → Build and deployment → Source → GitHub Actions`

La dirección esperada es:

`https://andre-101.github.io/pinza-bluetooth/`

## Compatibilidad

Web Bluetooth requiere HTTPS y un navegador compatible. Para las pruebas se recomienda Chrome o Edge. El soporte puede variar según el sistema operativo y el dispositivo.

## Seguridad

El control web no mide fuerza ni corriente. El servo debe alimentarse con una fuente de 5 V adecuada y compartir GND con la ESP32. No introduzcas los dedos en la pinza durante las pruebas.
