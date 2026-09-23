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
| 2026-09-22 | Pendientes | `Internal server error` para Administrador | Alias SQL incorrecto en la consulta de turnos | Se corrigió la referencia a la fecha del turno. |

## Datos para un reporte

Al reportar un error se debe incluir: código, referencia, fecha y hora aproximada, usuario, pantalla, acción realizada y captura. No se deben enviar contraseñas.
