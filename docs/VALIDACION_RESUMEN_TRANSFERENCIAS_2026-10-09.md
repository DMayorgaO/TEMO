# Resumen de notificaciones de transferencias

Fecha:2026-10-09. Solo desarrollo, sin despliegue ni escrituras de produccion.

## Cambios

- Titulos Transferencia de Efectivo y Transferencia Digital, tambien en el distintivo del aviso individual.
- Resumen administrativo por sucursal con subtitulo; dentro de cada sucursal, Ingreso(n) y Egreso(n). Conteos de avisos, no de sucursales/cajeros, agrupados sin mezclar direcciones.
- Detalle agrupado por cajero afectado, banco en digital y moneda. Montos NIO/USD siempre separados; transferencias de efectivo sin banco redundante.
- Se aprovechan campos existentes autorizados por la API; no se amplian consultas, permisos, contratos ni datos descargados.
- Resumen por categorias y confirmacion de cada aviso conservados. Cierres y pendientes mantienen comportamiento previo.
- El resumen sigue siendo exclusivo de Administrador. El cajero conserva aviso individual y no ve su propio nombre.
- Nombres largos se ajustan a linea; en pantallas pequenas nombre/banco e importe ocupan filas separadas. Boton a ancho completo, sin texto desbordado. El limite de alto y desplazamiento accesible se conservan si hay tantos datos que no caben; no se ocultan sucursales para evitar scroll.

## Evidencia

- node --test frontend/tests/*.test.mjs:21/21 correctas, incluidas3 nuevas de agrupacion, monedas, bancos, direcciones y etiquetas ausentes.
- npm run build -w frontend y npm run lint -w frontend correctos.
- Playwright con Edge headless, datos simulados y API interceptada exclusivamente en preview: escritorio1366x768 y movil390x844, efectivo y digital, dos sucursales, nombres largos e importes grandes. Capturas inspeccionadas; sin desbordamiento horizontal del modal ni boton. Confirmacion genera una peticion por aviso y cierra resumen.
- Evidencia temporal local en tmp/notification-summary-desktop.png, tmp/notification-summary-mobile.png y tmp/notification-summary-cash.png. No contiene datos reales. Script visual temporal en tmp/test-notification-summary.cjs.
- Preview disponible en http://127.0.0.1:3187 con API y base demo aisladas. Las capturas emplean avisos simulados, no transferencias nuevas guardadas.

## Pendientes

- Revision del usuario y publicacion autorizada junto con la correccion de recuperacion. No publicado en esta entrega.
- Prueba real posterior de recuperacion por correo y comprobacion de PostgREST durante operacion del negocio siguen abiertas, segun checklist.
