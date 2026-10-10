# Recuperacion de acceso y clasificacion de logs

Seguimiento2026-10-10:VALIDACION_RECUPERACION_ANTIABUSO_2026-10-10.md describe el comportamiento actual de desarrollo. Sustituye la eliminacion de filas tras fallo de envio por consumo conservando historial y mueve auditoria a transaccion previa al envio. Las notas inferiores registran etapas anteriores.

Fecha: 2026-10-09, America/Managua. Cambios de codigo solo en desarrollo.

## Archivo Supabase recibido

Analisis estructurado de supabase_logs.json, sin incorporar el archivo original al repositorio:

- 100 entradas, todas de nivel error, SQLSTATE 3F000, con el mismo mensaje: schema "pg_pgrst_no_exposed_schemas" does not exist.
- Intervalo UTC: 2026-10-09T18:06:33.815Z a 2026-10-09T18:59:34.216Z.
- Intervalo Nicaragua: 9 de octubre, 12:06:33 a 12:59:34.
- Son anteriores a la correccion aplicada esa noche, documentada en DOMINIO_CORREO_POSTGREST_2026-10-09.md. Este archivo no prueba persistencia posterior ni permite afirmar que el error desaparecio.
- No contiene otros tipos de error. No acredita ausencia de otros problemas, ni explica por si solo la totalidad del consumo de Egress o posibles fallos de transacciones.
- Mantener la Data API sin acceso a las tablas de TEMO; no reactivar tablas ni bajar la severidad de los logs para ocultar el problema.
- Comprobacion pendiente: filtrar nuevos eventos posteriores al ajuste, por SQLSTATE 3F000 y mensaje exacto. Si reaparece, revisar configuracion efectiva y recarga con soporte de Supabase antes de nuevos cambios en produccion. Los eventos historicos no desaparecen con la correccion.

## Refuerzo del transporte de recuperacion

### Segundo archivo recibido y comprobacion posterior

- El usuario reemplazo el archivo con una exportacion de las ultimas tres horas:222 eventos, todos con el mismo SQLSTATE3F000 y mensaje de esquema ausente.
- Intervalo UTC:2026-10-09T23:54:11.128Z a2026-10-10T01:52:27.095Z; Nicaragua:9 de octubre17:54:11 a19:52:27.
- No hay eventos posteriores a19:52 en este archivo. El ultimo es cercano al ajuste; no debe describirse todo el archivo como anterior al ajuste. Es compatible con cese de repeticiones tras la recarga, pero no demuestra cobertura continua ni ausencia de otros errores fuera de la exportacion.
- Verificacion de solo lectura en produccion a20:55 Nicaragua: authenticator conserva pgrst.db_schemas=pgrst_no_exposed_schemas; esquema vacio con0 relaciones; temo conserva221 relaciones; anon/authenticated sin USAGE en ambos esquemas. Sin nuevas escrituras ni reinicios.
- Si aparecen nuevos3F000 posteriores a19:52, investigarlos antes de cerrar este pendiente. No es necesario repetir el ajuste por los eventos historicos de esta exportacion.
- El usuario advierte que19:52 coincide con el cierre operativo. Por tanto, el silencio puede coincidir con falta de actividad y no acredita solucion: revisar durante operaciones del10deoctubre antes de dar el incidente por cerrado. No se ha configurado un monitor automatico.

- Solicitud de envio a Resend limitada a diez segundos con AbortSignal.timeout. Una espera del proveedor no deja la peticion abierta indefinidamente.
- Redirecciones HTTP rechazadas: el endpoint de correo es fijo y no debe seguir destinos alternativos.
- Sin reintentos automaticos de envio; no duplicar mensajes tras un resultado incierto.
- Se conserva la respuesta publica generica. Fallo de envio elimina el codigo creado, sin publicar detalles del proveedor ni credenciales. Los codigos anteriores ya invalidados no se reactivan.
- Se mantiene el alcance exclusivo de Administradores, codigo de seis digitos, diez minutos de vigencia, limite de intentos, hash en base y MFA independiente.
- Cinco pruebas nuevas sin red real: remitente/destinatario y escape HTML; timeout y aborto; configuracion ausente; rechazo del proveedor; limpieza del codigo y respuesta generica ante fallo.
- No se enviaron correos reales ni se utilizaron claves de Resend en las pruebas. Un timeout no garantiza que el proveedor no haya aceptado el mensaje: si llega un codigo eliminado, se requiere solicitar uno nuevo.

Validacion: compilacion y lint backend correctos; suite con TEMO_TEST_PREVIEW=1 completa, 88/88 pruebas correctas, incluidas regresion financiera, recuperacion, permisos y MFA. El primer intento de integracion encontro la base local apagada (ECONNREFUSED); se inicio exclusivamente el cluster demo en127.0.0.1:55433 y se repitio con exito. Fixtures de integracion revertidos por las suites. No se consulto ni modifico produccion en esta entrega.

## Configuracion externa y puertas pendientes

### Incidente de codigo recibido pero rechazado

El usuario confirma entrega real, pero TEMO devuelve AUT-REQ-400 al confirmar. Revision del flujo detecta una incompatibilidad: requestPasswordRecovery insertaba accion SOLICITAR en bitacora, no definida en temo.accion_bitacora por las migraciones. El envio precedia esa insercion; el fallo entraba en catch y eliminaba la recuperacion ya enviada. La respuesta generica ocultaba ese detalle deliberadamente.

Correccion solo en desarrollo: usar accion CREAR, conservando evento SOLICITUD_RECUPERACION. No requiere ampliar enum ni migracion. Nueva prueba integrada con PostgreSQL local y transporte de correo simulado confirma que solicitud y auditoria persisten, solo el ultimo codigo queda activo, se consume una vez, cambia la clave, incrementa version de sesion y login vuelve a requerir MFA. No se solicito ni se uso el codigo privado del usuario.

Validacion posterior:89/89 pruebas backend con integracion preview, build/lint correctos. Pendiente autorizacion/publicacion y nueva prueba real; codigos eliminados no son recuperables. La entrega real de correo confirmada no equivale a recuperacion completa verificada en produccion.

- Usuario confirma RESEND_API_KEY y PASSWORD_RESET_EMAIL_FROM guardadas en temo-api; no se inspecciono ni copio la clave.
- Usuario confirma dominio notificaciones.miscelaneaolivera.com verificado; captura muestra Verified y dominio listo para envio. Falta prueba real de recuperacion/entregabilidad; no se envio correo ni se restablecio ninguna cuenta en esta comprobacion.
- No habilitar recuperacion de cajeros ni modificar perfiles sin decision explicita.
- No desplegar este refuerzo ni los ajustes de dominio pendientes sin autorizacion.
