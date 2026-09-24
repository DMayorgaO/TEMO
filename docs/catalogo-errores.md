# Catálogo de errores TEMO

Cada error mostrado por TEMO incluye un código estable y, cuando corresponde, una referencia única de ocho caracteres. El usuario puede comunicar ambos datos para localizar el evento exacto en los registros de Render sin exponer información técnica.

## Formato

- `MODULO-CATEGORIA-NUMERO`: identifica el tipo de error.
- `Ref`: identifica una ocurrencia específica en los registros del servidor.
- Prefijos de módulo: `TRF` transferencias, `TRA` transacciones, `PEN` pendientes, `TUR` turnos, `AUT` autenticación y `GEN` funciones generales.

## Errores controlados

| Código base | Significado | Acción sugerida |
| --- | --- | --- |
| `REQ-400` | Datos incompletos o inválidos | Revisar los campos marcados y volver a guardar. |
| `AUT-401` | Sesión vencida o inválida | Iniciar sesión nuevamente. |
| `AUT-403` | Operación no permitida para el usuario | Confirmar el rol y el turno asignado. |
| `REQ-404` | Registro no encontrado | Actualizar la pantalla y confirmar que no fue anulado. |
| `DAT-409` | Conflicto con el estado actual | Actualizar la pantalla antes de repetir la operación. |
| `REQ-429` | Demasiadas solicitudes | Esperar unos minutos antes de intentar nuevamente. |

## Errores de datos

| Código base | Significado | Acción sugerida |
| --- | --- | --- |
| `DAT-001` | Falta un dato obligatorio | Reportar el código y la referencia; no repetir muchas veces. |
| `DAT-002` | Falta un registro relacionado | Actualizar catálogos o verificar que el dato siga activo. |
| `DAT-003` | Registro duplicado | Confirmar si la operación ya fue guardada. |
| `DAT-004` | Regla de base de datos incumplida | Revisar estado, moneda, cuenta y turno. |
| `DAT-005` | Formato de dato incorrecto | Revisar identificadores y valores numéricos. |
| `DAT-006` | Valor fuera del límite permitido | Reducir o corregir el valor ingresado. |
| `DAT-007` | Cambio simultáneo de información | Actualizar e intentar nuevamente. |
| `DAT-008` | Dos operaciones actualizaron el mismo dato | Esperar un momento y volver a intentar. |

## Errores internos

| Código base | Significado | Acción sugerida |
| --- | --- | --- |
| `SYS-DB-001` | Falta una tabla o vista requerida | Revisar las migraciones desplegadas. |
| `SYS-DB-002` | Falta una columna requerida | Comparar la versión del backend y la base de datos. |
| `MODULO-500` / `SYS-500` | Error interno no clasificado | Reportar código, referencia, usuario, pantalla y hora. |

## Incidentes conocidos y corregidos

| Fecha | Pantalla | Síntoma | Causa | Corrección |
| --- | --- | --- | --- | --- |
| 2026-09-23 | Transferencias | `Internal server error` al registrar sin descripción | La notificación enviaba `NULL` a un campo obligatorio | Se almacena texto vacío y la notificación omite visualmente la descripción. |
| 2026-09-23 | Transacciones | La confirmación de anulación no producía cambios | El botón sólo alteraba el estado local de la tabla y no llamaba al API | Se agregó anulación atómica con reversión de arqueo, saldos y pendiente abierto. |
| 2026-09-24 | Transacciones | Vuelto de USD entregado en córdobas usaba venta y generaba diferencia | El vuelto heredaba la tasa principal en vez de seguir el sentido físico del dólar | Se usa compra cuando TEMO entrega el equivalente de USD y venta cuando lo recibe, incluso en operaciones múltiples. |
| 2026-09-24 | Pendientes | Una liquidación podía quedar pagada sin una forma de corregir su arqueo o banco | No existía reversión de liquidaciones ni compensación desde una transacción en curso | Se agregó corrección con reapertura y aplicación de saldo a favor sin movimientos ficticios. |
| 2026-09-24 | Transacciones | La referencia `3D5E7B08` rechazó un lote mixto de cinco operaciones por la tasa del vuelto | El servidor validaba cada pestaña de forma aislada aunque la interfaz calculaba el vuelto sobre el saldo acumulado | La validación ahora conserva el balance secuencial NIO/USD, descuenta cada vuelto y aplica la misma regla de compra/venta que la interfaz. |
| 2026-09-22 | Pendientes | `Internal server error` para Administrador | Alias SQL incorrecto en la consulta de turnos | Se corrigió la referencia a la fecha del turno. |

## Datos para un reporte

Al reportar un error se debe incluir: código, referencia, fecha y hora aproximada, usuario, pantalla, acción realizada y captura. No se deben enviar contraseñas.
