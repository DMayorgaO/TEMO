# Reduccion de transferencias sin cambiar la operacion

Fecha: 2026-10-08. Estado: API y web optimizadas confirmadas en produccion. No requiere migraciones.

## Revision de produccion, exclusivamente lectura

- 7 usuarios; 2 tienen foto de perfil. Foto mas grande: 14,859 bytes; total almacenado en fotos: 24,982 bytes.
- pg_stat_statements: 1,024,584 ejecuciones de la consulta de validacion de usuario que incluye foto y 1,500,273 ejecuciones clasificadas como consultas de turnos.
- Son contadores acumulados de PostgreSQL desde sus reinicios de estadisticas, no necesariamente del ciclo de facturacion de Supabase. Clasificacion por patrones SQL, sin extraer valores de registros ni publicar SQL con datos privados.
- No se puede convertir ese numero de llamadas en GB exactos: los usuarios tienen fotos distintas o ninguna, y no se dispone del historial de bytes por llamada. No se atribuye todo el consumo de Supabase a estas dos causas.
- No se modificaron ni reiniciaron estadisticas de produccion, usuarios, variables, saldos o registros. El desglose de Egress por proyecto/servicio de Supabase sigue siendo necesario para atribucion completa.

## Cambios

1. Validacion de sesion sin foto de perfil. Conserva consulta actual de estado, rol, version, permisos y MFA, sin cachear autorizacion. La foto sigue cargandose en login, consulta /auth/me, cambio de clave y actualizacion de foto.
2. Nuevo GET /shifts/access exclusivo de CAJERO, sin aceptar otro usuario como parametro. Una consulta devuelve solo database_id, estado, sucursal y caja para su turno activo/preparado. Sustituye las descargas periodicas de turno completo e historial destinadas solo al bloqueo de acceso. PENDIENTE_APROBACION conserva acceso como antes; al cerrar el turno desaparece del resultado.
3. Consultas globales de notificaciones y acceso al turno se pausan con pestana oculta. Mantienen cinco segundos cuando esta visible y consultan al recuperar foco/visibilidad o ante evento local de cambio; no se acumulan solicitudes solapadas. Un error transitorio conserva la ultima certeza.
4. Lecturas GET identicas por ruta y token comparten exclusivamente una solicitud en curso. Cada consumidor recibe una copia independiente del JSON. No se almacenan respuestas completadas; las escrituras invalidan el mapa antes de ejecutarse y nunca se comparten ni reintentan automaticamente. Un fallo de lectura permite una consulta nueva.
5. Respuestas de otra sesion no restauran datos del usuario anterior; un401 atrasado no expira la sesion nueva. La restauracion inicial del perfil tambien comprueba que conserva el mismo token.
6. /shifts/current reutiliza la fila del turno que acaba de consultar y autorizar para ese cajero, en lugar de descargarla de nuevo mediante detail. Sigue comprobando el arqueo actual y consultando efectivo, saldos, cuentas y movimientos en cada llamada. La consulta de detalle por ID conserva su propia autorizacion; no se introduce cache entre peticiones.

## Comparacion local

Mismo cajero de ejemplo con turno abierto, consultas de solo lectura:

| Medida | Detalle + historial anteriores | Acceso ligero |
|---|---:|---:|
| Consultas de servicio | 9 | 1 |
| Bytes de filas serializadas a JSON | 15,678 | 124 |
| Bytes de respuesta serializada a JSON | 15,596 | 149 |

El benchmark anterior excluye verificaciones auxiliares de /shifts/current y de autenticacion, por lo que no se presenta como numero exacto de consultas HTTP antiguas. Son tamanos logicos JSON de la muestra local, no medicion de trafico del protocolo PostgreSQL ni facturacion. No representan el ahorro total de TEMO.

Prueba con foto de15KB: login y /auth/me conservan el contenido; validacion habitual deja de transferirlo. El token revocado sigue rechazandose en la siguiente peticion.

## Verificacion

- Build y lint correctos.
- Backend83/83, sin omisiones: HTTP autenticado, alcance por cajero, perfil, MFA, revocacion, turnos preparados/abiertos, exportaciones y regresiones financieras. Prueba adicional confirma que /shifts/current lee datos financieros nuevos en cada llamada y evita la lectura duplicada del turno.
- Regresion financiera repetida tras agregar comparacion completa entre /shifts/current y detail, antes y despues de un deposito:18/18, con rollback.
- Frontend18/18: aislamiento por sesion/ruta, invalidacion por escrituras, rechazo y recuperacion, ausencia de cache completada, copias independientes, visibilidad, ausencia de solapamiento y limpieza de listeners.
- Navegador local: login de cajero.pruebas, acceso a Transacciones, Arqueo y Saldos con datos de ejemplo. No se guardaron transacciones ni cambios de efectivo/saldos. Evidencia local ignorada por Git: tmp/preview/egress-saldos.png.
- No se probaron nuevas operaciones financieras mediante interfaz; las regresiones de creacion, edicion, anulacion, pendientes y transferencias estan cubiertas por pruebas locales revertidas.
- Preview http://127.0.0.1:3187 actualizado. El reinicio del API puede exigir nuevo login; no reinicia el enrolamiento MFA.

## Continuidad y siguientes decisiones

- No se cambiaron tasas, formulas, importes, inventario de efectivo, transacciones ni intervalos operativos de saldos/arqueo. Las notificaciones recibidas mientras la pestana no se ve se consultan al volver a ella.
- No se aplican cupos de registros/consultas al cajero. No se introduce cache de permisos ni retraso en revocacion de sesiones.
- Pro y optimizacion son complementarios: este codigo no evita el vencimiento de la cuota gratuita mientras no se publique, ni borra consumo acumulado.
- Publicacion realizada con API antes de web. /shifts/access con cajero, /auth/me con foto, MFA administrativo y permisos se comprobaron en pruebas locales autenticadas; no se usaron credenciales ni OTP de usuarios reales en produccion. No requirio modificar DATABASE_URL ni claves MFA.
- Despues de publicar, comparar GB/dia en Supabase por proyecto y Shared Pooler Egress durante dias de operacion comparables. Registrar fecha de cambio, usuarios/horarios y numero de transacciones; no prometer un porcentaje global sin esa medicion.
- Siguiente candidato: paginacion/filtros en servidor y reemplazo de recargas completas de listados por deteccion de cambios. Requiere pruebas de busqueda, orden, filtros, exportaciones y actualizaciones cruzadas; no se introduce apresuradamente ni se ralentiza la actualizacion financiera para cumplir una cuota.

## Publicacion autorizada

- Usuario autoriza publicar si las comprobaciones son correctas. API primero:7965d1c, publicada en main/develop sin force push. La web anterior es compatible con esta API.
- 2026-10-09 05:12:02 UTC: health responde200, database ok y revision7965d1cdd51c4ec16ebe1454bc815e7f4d7aab73. Solo despues de esta confirmacion se publica13e690e88d49eea2addd3e4dd25c803c66d26424 en main/develop con los cambios web.
- Web confirmada: HTTP200, asset/assets/index-CJf_vxWS.js contiene /shifts/access y proteccion ante cambio de sesion. CSP y X-Frame-Options DENY efectivos. /auth/me, /shifts/access y /transactions anonimos responden401 y Cache-Control no-store. CORS admite el origen web de TEMO y no autoriza https://untrusted.example.
- 2026-10-09 05:13:31 UTC: revision final de API13e690e88d49eea2addd3e4dd25c803c66d26424 confirmada, HTTP200 y database ok. La confirmacion corresponde a la noche del8 de octubre en Managua.
- Respaldo previo:backups/production/temo-production-20261008-230928.dump. SHA-256:f194853e0941ca5f29ca892e22405cf550fc185e3b634c90e242465961f357ee. pg_restore --list lee500 entradas; no equivale a simulacro completo de restauracion.
- No se ejecutaron migraciones ni se cambiaron claves, usuarios, tasas o datos financieros de produccion.
- Se mantienen tres segundos para refresco operativo habitual (cinco segundos donde ya correspondia, como formulario abierto) y cinco segundos para notificaciones/acceso de turno. Las pestanas ocultas no generan estos sondeos y al recuperar visibilidad consultan de inmediato.
- Limite de esta comprobacion: notificaciones, transferencias y refresco entre dos equipos no se ensayaron con escrituras en produccion. Las pruebas financieras usan exclusivamente PostgreSQL local y datos revertidos. La reduccion real debe medirse en Supabase durante dias comparables despues del despliegue.
