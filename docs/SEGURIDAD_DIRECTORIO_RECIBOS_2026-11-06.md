# Directorio: recibos, permisos y recuperación del formulario

Bloque implementado exclusivamente en desarrollo por solicitud del titular el 6 de noviembre de 2026. Producción sigue en la revisión funcional `0a6b23c`, con registro documental `cf08337`; esta tarea no publica ni consulta datos productivos.

## Problema y comportamiento nuevo

La versión de contenido impedía sobrescribir una edición reciente, pero un alta cuyo resultado se perdía en la red podía repetirse como otro destinatario. Una edición confirmada cuyo resultado se perdía encontraba su propia versión anterior al reintentar. Ahora las altas, ediciones y desactivaciones requieren una referencia UUID y se confirman mediante recibos persistentes e inmutables.

La identidad, rol activo, versión de sesión y cambio obligatorio de contraseña se comprueban antes de ejecutar o recuperar un recibo. Un bloqueo transaccional por usuario/operación/referencia serializa reintentos simultáneos. La huella identifica el cuerpo validado completo, incluido destinatario y versión esperada para ediciones. Reutilizar la referencia con otro cuerpo o destinatario produce 409. La mutación, sus hijos, auditoría y recibo comparten una transacción: cualquier fallo revierte todo.

El recibo guarda sólo `{id: UUID}` como resultado. No duplica nombres, cuentas, cédulas, referencias ni notas. Al repetir una solicitud autorizada se vuelve a leer el destinatario actual bajo bloqueo: no se restaura una fotografía antigua ni se exponen datos obsoletos guardados en el recibo. Si posteriormente fue desactivado, se devuelve inactivo. La auditoría conserva las reglas previas de nombre/estado, conteos y banderas, sin copiar números ni texto libre adicional.

## Formulario y reintentos

- Cada intención de guardado genera una referencia criptográfica. Se bloquea el doble envío antes de esperar respuestas.
- Ante fallo de red, timeout o respuesta 5xx, el formulario conserva exactamente el cuerpo y referencia enviados, sólo en memoria. Se bloquea su edición mientras el resultado es incierto y se ofrece «Reintentar guardado». No se reenvía automáticamente.
- Un rechazo confirmado 400/401/403/404/409/413/422/429 descarta la intención fallida. El borrador permanece, y una corrección posterior obtiene otra referencia. La protección de versión antigua sigue vigente.
- Una respuesta exitosa debe identificar el destinatario esperado para confirmar el guardado. Una respuesta inválida se considera incierta.
- No se permite reenviar una intención bajo otra sesión. No se guardan contenidos del Directorio ni tokens de reintento en localStorage/sessionStorage.
- Cerrar un formulario incierto requiere una advertencia: al cerrar/recargar se pierde la intención mantenida en memoria y hay que revisar el registro antes de crear otra. No se promete deduplicar solicitudes distintas con referencias nuevas.
- La anulación desde la tabla conserva una intención por destinatario cuando hay incertidumbre y protege el doble clic, además de mantener la confirmación existente.

## Matriz de permisos y contratos

| Ruta | Administrador | Cajero | Transferista | Anónimo / perfil no soportado / cambio de contraseña pendiente |
|---|---|---|---|---|
| GET `/directory` | Permitir | Permitir | Permitir | Rechazar |
| GET `/directory/:id` | Permitir | Permitir | Permitir | Rechazar |
| POST `/directory` | Permitir | Permitir | Rechazar | Rechazar |
| PUT `/directory/:id` (incluye desactivar) | Permitir | Permitir | Rechazar | Rechazar |

El Directorio continúa compartido; no se inventaron restricciones por sucursal o turno que cambiarían su uso actual. La lectura conserva el contenido permitido anteriormente. Se rechazan parámetros de consulta no previstos, UUID inválidos, referencias ausentes/malformadas, campos de propiedad/permisos y campos anidados desconocidos. Los permisos no dependen de botones ocultos.

## Base local y publicación futura

`056_directory_request_receipts.sql` amplía únicamente el CHECK de operaciones de `solicitudes_financieras` para incluir `CREAR_DIRECTORIO` y `EDITAR_DIRECTORIO`. No crea copias de datos sensibles ni altera recibos existentes, movimientos financieros o tablas de destinatarios. Se reutilizan sus claves, ACLs y trigger de inmutabilidad. Aplicada sólo a `temo_preview`, en loopback 55433, comprobando que no cambió la cantidad de recibos existentes. El lanzador comprueba que la migración esté presente.

La futura publicación requiere autorización, ensayo y migración 056 antes de la API, más la web correspondiente. Clientes anteriores que no envían referencia recibirán 400 al escribir Directorio y deberán recargar. No se elimina el control para permitir clientes antiguos. Nada se aplicó a producción en este bloque.

## Evidencia

Pruebas nuevas: `directory-receipts.test.cjs`, `directory-concurrency.test.cjs`, `directory-permissions.test.cjs`, `directory-write-intent.test.mjs` y `directory-receipts.browser.cjs`. Incluyen concurrencia real con conexiones separadas en esquema temporal local; SQL completo con rollback; matriz HTTP a través de AuthGuard/Controller/Pipes; referencias y cuerpos congelados; respuestas perdidas; pruebas visuales 1366×768 y 1920×1080.

Los tests históricos de Directorio se adaptaron para expresar intenciones nuevas con referencias diferentes, conservando todas sus comprobaciones de identidad, versión, auditoría y rollback. Se mantienen las regresiones financieras generales, incluidos los escenarios de tasas y liquidación entre monedas publicados el día anterior.

Verificación final: build y lint aprobados; 365 pruebas backend y 37 frontend aprobadas, sin fallos ni omisiones. Se repitieron 67 comprobaciones de Directorio, recibos y regresión financiera bajo rol SQL restringido, todas aprobadas. Nueve suites de navegador aprobadas: transacciones paginadas, filtros de moneda, transacciones en revisión, seguridad de pagos pendientes, cambios/anulaciones, versión de edición y las tres de Directorio (versión, titular y recibos). La suite nueva comprueba altas, ediciones y anulaciones con respuesta perdida en ambas resoluciones. La matriz HTTP nueva contiene 37 casos; se cuenta como una prueba dentro del total backend, no como 37 pruebas adicionales.

Permanecen fuera de este bloque la matriz del resto de rutas, retención/centralización/alertas externas de auditoría, prueba negativa de CA desde Render y controles de infraestructura/Zero Trust. Este bloque no declara cerrado el checklist general.
