# Login concurrente y emision de sesiones - 2026-10-10

Estado: solo desarrollo. Sin migraciones, cambios financieros o despliegue.

## Riesgos tratados

La comprobacion anterior calculaba crypt antes de verificar el bloqueo, fuera
de la transaccion que incrementaba los fallos. Solicitudes paralelas podian
seguir comprobando claves mientras otras activaban el bloqueo. El contador
acumulado tampoco iniciaba un ciclo nuevo al expirar una penalizacion.

La finalizacion de login actualizaba ultimo_acceso y limpiaba fallos por ID,
sin exigir la misma version/identidad que habia superado el paso anterior.
El guard ya rechazaba tokens revocados posteriormente; se refuerza tambien
la emision para evitar entregar una sesion basada en identidad desactualizada.

## Controles implementados

- Bloqueo de fila por cuenta antes de crypt; comprobacion y persistencia de
  fallos en una transaccion. Compartido por instancias que usan la misma base,
  no dependiente de IP o memoria de la API.
- Cuentas bloqueadas no calculan crypt ni prolongan su penalizacion por nuevos
  intentos. Se conserva politica de5fallos y15minutos.
- Fallo tras bloqueo expirado inicia contador en1. Acceso completo correcto
  limpia fallos. Se conserva el requisito MFA del Administrador.
- Intentos fallidos se confirman antes de devolver401/429. Si falla persistir
  el intento, se revierte el cambio del contador y no se entrega acceso.
- Antes de completar acceso: misma version de sesion, usuario, rol e ID de rol,
  usuario/rol activos y ausencia de bloqueo vigente. Una diferencia rechaza401.
- Auditoria de acceso exitoso, ultimo_acceso y limpieza de fallos siguen siendo
  atomicos; un fallo de auditoria no devuelve token ni deja el reset confirmado.

## Evidencia

- Build/lint backend correctos; 114/114 pruebas backend,21/21 frontend.
- PostgreSQL preview real, pool de conexiones independiente y3instancias del
  servicio:8intentos simultaneos,5comprobaciones crypt,5respuestas401 y3respuestas429.
- Se verifican8intentos persistidos, contador5 y vencimiento estable ante una
  nueva solicitud bloqueada incluso con clave correcta.
- Bloqueo vencido: primer fallo deja contador1 y sin bloqueo; login valido
  posterior entrega token aceptado por el guard y limpia contador.
- Cambios controlados entre verificar clave y emitir sesion: desactivacion,
  cambio de rol, usuario, revocacion y nuevo bloqueo; todos rechazan acceso.
- Fallos inducidos de persistencia de intento y auditoria exitosa verifican
  rollback. Fixtures locales eliminados; no se usan cuentas de produccion.
- Regresion completa conserva enrolamiento/OTP/recuperacion MFA, correo,
  permisos, exportaciones y operaciones financieras.

Referencia sobre bloqueos de fila:
https://www.postgresql.org/docs/17/explicit-locking.html

## Limites

No evita que alguien que conozca un usuario provoque su bloqueo temporal.
Los mensajes/tiempos de login no son uniformes para cuentas inexistentes y
bloqueadas; no se afirma eliminar enumeracion. Mitigacion de abuso distribuido,
alertas y controles del borde pendientes.

La serializacion mantiene una conexion mientras verifica una clave; deben
medirse tiempos/carga y definir limites de espera y saturacion de pool antes
de escalar. No se agregaron reintentos automaticos.

La revalidacion no congela una cuenta despues de completar la transaccion;
una revocacion posterior sigue siendo aplicada por el guard en cada solicitud.
Inventario/revocacion por dispositivo y proteccion contra robo de tokens siguen
pendientes. No se modifican hashes ni secretos MFA existentes.
