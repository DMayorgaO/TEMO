# Seguridad: alcance de catalogos

Fecha: 2026-10-07. Implementado y probado solo en desarrollo.

## Cambios

- Cajeros reciben exclusivamente sucursales activas asignadas o vinculadas a su turno abierto o pendiente de aprobacion.
- Sucursales no exponen asignaciones de personal ni cuentas a cajeros y operadores.
- Cuentas compartidas no exponen a cajeros datos de otras sucursales ni de sucursales inactivas. Se mantiene la ocultacion de numeros de cuenta.
- Contexto de transferencias del cajero conserva sus turnos autorizados, pero no devuelve cuentas bancarias: su operacion permitida es el egreso de efectivo.
- Administradores conservan el catalogo completo; operadores conservan cuentas activas para sus operaciones autorizadas.
- Roles desconocidos se rechazan antes de consultar sucursales.

## Evidencia

- Backend compilado y lint de ambos proyectos correctos.
- 21 pruebas backend y 8 frontend correctas, sin omisiones.
- Consultas independientes comparan sucursales y cuentas autorizadas contra las respuestas del controlador.
- HTTP: anonimo rechazado, cajero restringido, administrador permitido y respuestas privadas sin cache.
- Otro cajero no puede leer el turno ni consultar/anular la transaccion del titular.
- Regresion financiera con rollback: multiples, pendientes, pagos combinados, tasas preferenciales y anulaciones.
- La primera ejecucion fallo porque PostgreSQL local estaba apagado; tras levantar la base aislada se repitieron todas las pruebas correctamente.

## Pendientes

No se desplego ni se modificaron datos de produccion. No requiere migraciones.
Este bloque no acredita una auditoria completa de permisos de toda la API.
Los pendientes compartidos dentro de una sucursal conservan el alcance necesario para el negocio.
Antes del despliegue falta validar manualmente PDF, PNG y pantallas administrativas con la nueva CSP.
MFA, auditoria de accesos y dispositivos autorizados siguen pendientes en el checklist general.
