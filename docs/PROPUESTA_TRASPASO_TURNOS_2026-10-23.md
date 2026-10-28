# Traspaso entre cajeros: propuesta para desarrollo

Estado: implementado en desarrollo con aceptacion del receptor, elegida por el usuario. Limpiar retirado del Arqueo. Sin commits, despliegues ni cambios de datos en produccion.

## Encaje con TEMO

- ShiftsService.create y close requieren Administrador (JEFA). No se deben abrir estos permisos generales a CAJERO.
- Ya existe PENDIENTE_APERTURA y openPrepared, que exige que abra el cajero asignado. El traspaso necesita un registro propio: no basta con crear un turno preparado y cerrar el anterior por separado.
- La asignacion de sucursal esta en usuarios_sucursales. El catalogo de usuarios no debe exponerse completo al cajero: usar una consulta especifica con identificador y nombre de receptores elegibles.
- El arqueo guarda con retraso de 500ms y los saldos al salir del campo. El traspaso debe esperar esas escrituras, impedir edicion durante la confirmacion y comprobar la version de los datos al ejecutar.
- Los turnos y las escrituras de arqueo/saldos necesitan comprobacion transaccional de estado: una autorizacion hecha antes de BEGIN no evita que una peticion atrasada modifique un turno recien cerrado.
- Las notificaciones persistentes ya existen, pero su restriccion de tipos y las consultas actuales necesitan ampliarse para no presentar un traspaso como transferencia o pago pendiente.

## Flujo implementado

1. El cajero saliente pulsa Traspaso, selecciona un receptor y revisa arqueo, saldos por cuenta, diferencias y totales de ambas monedas.
2. Se guarda una solicitud con una instantanea identificable y vencimiento de 15 minutos, no un turno nuevo ni un cierre administrativo ficticio. Solo una solicitud pendiente por turno y por receptor; la reserva no reemplaza la comprobacion de disponibilidad frente a aperturas administrativas.
3. El receptor ve la propuesta en su propia sesion y acepta o rechaza. No se piden ni comparten sus contrasenas o MFA en la sesion del saliente.
4. Al aceptar se verifica que no cambiaron los datos ni la disponibilidad. Si cambiaron, debe generarse y aceptarse un resumen actualizado; nunca aceptar silenciosamente una cifra diferente.
5. Cierre, apertura, relacion de ambos turnos, auditoria y avisos a cada Administrador se confirman juntos en una transaccion. Si algo falla, se revierte todo.
6. El saliente pierde acceso operativo al turno cerrado; el receptor opera solo en el turno nuevo. La Administradora conserva el cierre habitual y la revision historica.

La ejecucion inmediata por el saliente no se implementa: el usuario eligio la aceptacion del receptor. La espera no congela las operaciones del origen; si cambian sus datos debe cancelarse y reenviarse la propuesta.

## Datos que se traspasan

- Misma sucursal y caja fisica; no permitir cambiar ninguna desde el formulario.
- Cantidades por denominacion y moneda: cierre contado del saliente = apertura y arqueo actual del receptor.
- Saldo Sistema de cada cuenta exacta = saldo inicial del nuevo turno. Conservar precision numerica y saldos negativos permitidos. No copiar el agregado bancario a cada cuenta.
- Teledolar conserva Pagos/Envios diarios y sus referencias, sin duplicar movimientos. Se usa America/Managua para comparar el dia de los movimientos. Esta primera version solo traspasa dentro de la misma jornada de negocio; si el turno pertenece a otra fecha se requiere cierre administrativo, sin trasladar contadores diarios incorrectos.
- Los ingresos/egresos, transacciones, transferencias, compras de dolares, sus diferencias y los registros de pendientes pertenecen a su turno original. No se copian como operaciones nuevas ni se anulan.
- El efectivo inicial nuevo es el dinero contado, no el monto esperado. No arrastrar cambio_nio/diferencia registrada como si fuera efectivo nuevo.
- Diferencias detectadas o diferencia registrada distinta de cero: se bloquea el traspaso autonomo y se remite al cierre administrativo existente. No ajustar ni poner a cero diferencias automaticamente. Es la politica conservadora inicial, a revisar con la Administradora durante las pruebas.

## Seguridad y consistencia requeridas

- Solo el CAJERO activo propietario del turno ABIERTO puede proponer. No habilitar create/close administrativos para lograrlo.
- Receptor distinto, ACTIVO, con rol CAJERO activo y asignado a la sucursal real del turno. No deducir sucursal del ultimo turno del receptor.
- No elegible con turno ABIERTO, PENDIENTE_APROBACION o PENDIENTE_APERTURA; comprobar otra vez al aceptar, no solo al mostrar la lista.
- Sin cierre pendiente ni otra solicitud de traspaso activa. Rechazo, cancelacion y caducidad no deben cerrar ni abrir turnos.
- Bloqueos de turno/caja/participantes y restricciones de unicidad que tambien cubran las aperturas administrativas concurrentes. Revisar datos existentes antes de agregar indices.
- Clave idempotente y relacion unica origen-destino para doble clic, reintentos y perdida de respuesta. Un reintento no puede crear otro turno.
- Verificar sesion vigente, estados y asignaciones en servidor. Conservar MFA existente; no aceptar actor/sucursal/caja enviados por el cliente como autoridad.
- Auditoria distingue TRASPASO de APROBACION_ADMINISTRATIVA. Registra proponente, receptor, ambos turnos, sucursal, caja, fecha, instantanea y resultado sin secretos.
- Notificacion individual para cada Administrador activo con quien entrega/recibe, ambos codigos, sucursal, caja y fecha. Lectura independiente por destinatario y persistencia en la misma transaccion.
- En el flujo con aceptacion, la reserva y la invalidacion de propuestas deben considerar tambien transferencias y pagos aplicados por otros operadores. No bloquear esas operaciones sin definir su coordinacion.

## Pruebas previstas para el bloque funcional

- Recorrido con dos sesiones CAJERO y varias JEFA; cantidades, saldos exactos, cuenta multiple por banco, NIO/USD y Teledolar.
- Usuario ajeno, receptor inactivo, otra sucursal, mismo usuario, sesion revocada y acceso directo al endpoint.
- Turno receptor preparado, abierto o pendiente de cierre; cierre administrativo simultaneo, dos salientes al mismo receptor y doble confirmacion.
- Datos modificados despues del resumen, escrituras tardias y movimientos externos durante la propuesta.
- Fallo de apertura/notificacion/auditoria: rollback completo. Reintento despues de respuesta perdida: mismo resultado, sin duplicados.
- Diferencias y cambio de dia, sin duplicar compras, pendientes ni movimientos del origen.
- Rechazo/cancelacion/caducidad; notificacion y lectura independiente por cada Administrador.
- UI en 1366x768 y 1920x1080; prototipo y datos aislados de produccion.

El control de gastos sigue local y no forma parte de esta propuesta ni de una publicacion futura.

## Verificacion realizada

- Migracion 044 aplicada solo al PostgreSQL aislado de preview (127.0.0.1:55433/temo_preview).
- 36 pruebas focalizadas de backend correctas, incluyendo regresion financiera, limites de identificadores, traspaso y concurrencia con conexiones reales.
- Pruebas del traspaso tambien correctas con rol de base de datos restringido.
- Se comprobo preservacion de efectivo NIO/USD, precision de saldos positivos/negativos y referencias Teledolar.
- Se simulo fallo de notificacion: cierre, apertura y auditoria se revierten juntos. Reintentar la aceptacion devuelve el mismo turno nuevo.
- Playwright con dos sesiones sinteticas: enviar, revisar, rechazar, cancelar, rechazar resumen obsoleto y aceptar. Capturas verificadas a 1366x768, 1920x1080 y 390x844, sin desplazamiento horizontal del dialogo.
- Regresion visual del Arqueo unificado y sus campos de saldo correcta.
- 21 pruebas unitarias del frontend correctas; compilacion y lint correctos en la verificacion del bloque.
- Suite general backend: 97 pruebas correctas y 21 pruebas optativas omitidas sin activar preview. Las 36 pruebas focalizadas mencionadas arriba se ejecutaron aparte con preview habilitado.

## Prueba manual local

1. Abrir http://127.0.0.1:3188 en dos perfiles de navegador distintos, con las cuentas de prueba habituales. No usar datos de produccion.
2. Con el Administrador, asegurar que el receptor este ACTIVO, asignado a la misma sucursal y sin turno vigente/preparado. Abrir un turno de prueba del dia al saliente y dejar el arqueo y saldos conciliados.
3. Saliente: Arqueo -> Traspaso -> seleccionar receptor -> Enviar traspaso.
4. Receptor: su pantalla Sin turno abierto muestra Revisar traspaso (actualizacion de hasta 5 segundos). Revisar cantidades y cuentas, luego Aceptar traspaso.
5. Comprobar que el saliente queda sin turno abierto, que el receptor tiene un turno nuevo con las existencias aceptadas y que cada Administrador recibe su aviso.
6. En otra prueba cambiar el arqueo despues de enviar: la aceptacion debe rechazar el resumen anterior; cancelar y reenviar. Rechazo, cancelacion o vencimiento no cierran ni abren turnos.

## Limites y requisitos antes de produccion

- Pendiente la validacion humana del nuevo flujo. No hay autorizacion de despliegue de este bloque.
- La migracion agrega tabla, tipos de avisos, indice de unicidad y proteccion de escrituras tardias. Antes de aplicarla en nube revisar turnos duplicados y permisos DML de la cuenta API sobre traspasos_turno; no desactivar controles para saltar errores.
- Para una instantanea consistente esta primera version toma bloqueos cortos de escritura de tablas operativas durante preparar/aceptar, nunca durante la espera humana. Medir su impacto con la concurrencia real antes del despliegue.
- Los cierres ya traspasados no permiten modificar existencias retroactivamente: alteraria la apertura aceptada del receptor. Las correcciones historicas por anotacion independiente conservan su comportamiento.
- El correo de desarrollo esta deshabilitado; los avisos de traspaso son internos de TEMO, no correos de Resend.
