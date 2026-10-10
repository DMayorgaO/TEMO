# IDs de registros y frontera de autenticacion

Fecha: 2026-10-10. Solo desarrollo. Sin despliegue, migracion ni cambios remotos.

## Cambio implementado

RecordIdPipe valida exclusivamente parametros de ruta llamados id en cuatro
controladores cuyos IDs internos son UUID. Usa ParseUUIDPipe de Nest, igual
que la validacion existente en CatalogsController, con error generico en espanol.

| Controlador | Rutas con ID cubiertas |
| --- | ---: |
| Transacciones y pendientes | 9 |
| Turnos y notificaciones | 9 |
| Transferencias | 3 |
| Directorio | 2 |

Un ID malformado devuelve400 antes de ejecutar el controlador/servicio.
No refleja el valor recibido ni llega a PostgreSQL para fallar en un cast UUID.
Esto reduce trabajo innecesario y errores de entrada; no demuestra que todos
los errores de PostgREST provengan de TEMO ni resuelve ese incidente remoto.

Se conservan UUIDs validos, mayusculas y la semantica de ParseUUIDPipe para
UUID nil. El formato no acredita existencia ni propiedad: un UUID valido sigue
sujeto a los permisos y reglas del servicio. No se aceptan codigos visibles
TRA/TUR/DIR como sustitutos del UUID interno; la interfaz ya envia UUIDs.

El pipe no transforma cuerpos, importes, query de paginacion ni parametros
resource. No altera tasas, liquidaciones, saldos, arqueos ni frecuencia de polling.

## Evidencia automatizada

backend/tests/record-id-access.test.cjs agrega cuatro pruebas:

- Inventario de los8 controladores: solo5 rutas publicas explicitas (health,
  login, verificacion MFA, solicitud/confirmacion de recuperacion). Ningun
  controlador entero publico; todos los demas handlers rechazan falta de token.
- UUIDs validos conservados; valores no-string, codigos visibles, SQL de prueba,
  espacios y null bytes rechazados sin incluir el valor en el error.
- AuthGuard mantiene solo me/change-password/logout para contrasena pendiente
  o perfil operativo no soportado. Metodo/ruta deben coincidir exactamente.
  Cabeceras malformadas se rechazan sin validar token; sesiones revocadas
  rechazan tambien endpoints basicos. Se prueban los tres roles operativos.
- HTTP real de Nest sobre puerto local efimero, con controladores y guard reales
  pero servicios/sesiones simulados: las23 rutas rechazan tres IDs malformados
  y solicitudes anonimas, revocadas, perfil desconocido o contrasena pendiente,
  sin llamar al servicio. UUID valido llega intacto a consultas y acciones sin
  cuerpo obligatorio; cuerpos vacios en otras escrituras conservan su rechazo
  por schema. El servidor temporal se cierra en finally.

Resultado conjunto:134/134 pruebas backend,21/21 frontend, build/lint backend
correctos. Suite backend con TEMO_TEST_PREVIEW=1 y TEMO_TEST_RESTRICTED_ROLE=1:
incluye regresion financiera, MFA/recuperacion y piloto de rol SQL restringido
contra PostgreSQL local; fixtures revertidos conforme a esas pruebas.

## Limites y siguientes puertas

- La matriz HTTP nueva no usa registros productivos ni demuestra propiedad
  real por sucursal: la autorizacion de negocio permanece en los servicios.
  Completar esa matriz por ruta/rol/registro sigue pendiente.
- AuthGuard no cambia en este bloque; se agregan pruebas de sus controles
  existentes. No se implementan aqui sesiones individuales ni nuevos dispositivos.
- No cierra PostgREST: hacen falta logs recientes durante actividad real.
- Antes de publicar: revision del paquete acumulado, respaldo reciente y plan
  de retorno, configuracion real CORS/API/CSP, autorizacion expresa y recorrido
  habitual de login/MFA, recuperacion por correo, exportaciones y operacion.
