# Recuperacion de acceso: control de abuso y atomicidad

Fecha:2026-10-10, America/Managua. Solo desarrollo; sin despliegue, consultas ni modificaciones de produccion.

## Controles implementados

- Limite persistente por cuenta:una solicitud preparada por minuto, hasta tres en ventana movil de15minutos. Usuario y correo de la misma cuenta comparten control; cambiar IP o instancia de API no reinicia el historial.
- Bloqueo transaccional advisory por ID de usuario antes de comprobar limites y reemplazar codigo. Los limites solo afectan recuperacion de contrasena, no inicio de sesion, consultas, registros financieros ni notificaciones.
- Solicitudes frenadas devuelven la misma respuesta generica, no envian correo y no invalidan el codigo vigente.
- Creacion de codigo, invalidacion del anterior y auditoria CREAR/SOLICITUD_RECUPERACION ocurren en una misma transaccion. Solo despues de confirmar se contacta a Resend.
- Si falla la preparacion o auditoria, rollback antes de enviar, sin emitir un correo inutilizable por ese fallo.
- Si falla el envio, el codigo preparado se marca consumido:ya no se elimina su fila. Se conserva el historial para que fallos repetidos no evadan limites. La auditoria acredita solicitud preparada, no entrega confirmada.
- Se mantienen hash, expiracion10minutos, cinco intentos de codigo, consumo unico, revocacion de sesiones y MFA independiente; alcance solo Administrador.
- Sin nuevas migraciones ni dependencias. Se aprovechan recuperaciones_contrasena y las transacciones existentes.

## Verificacion

- Backend92/92 pruebas con TEMO_TEST_PREVIEW=1; frontend21/21.
- Compilacion y lint backend correctos. npm audit --omit=dev reporta0 vulnerabilidades conocidas; no equivale a ausencia de vulnerabilidades.
- Prueba local con pool y dos instancias de AuthService:solicitudes simultaneas desde diferentes IP y alias usuario/correo generan un solo correo simulado por ronda; persistencia real en PostgreSQL.
- Fallo de auditoria simulado dentro de transaccion real:el nuevo codigo se revierte y el codigo previo conserva estado. Transporte de correo simulado, sin claves reales ni mensajes externos.
- Prueba de ventana movil y cooldown contra base local:la cuarta solicitud no envia aun tras consumo de codigos/cambio de IP; solicitudes frenadas no invalidan el codigo actual; MFA sigue requerido tras recuperacion.
- Fixtures locales de concurrencia eliminados al terminar; otras suites usan rollback. Preview reiniciado con base demo local; no usa Supabase ni Render.

## Limites y riesgos pendientes

- La respuesta generica no garantiza indistinguibilidad temporal entre cuentas existentes y ausentes.
- Un atacante que conoce un identificador puede consumir temporalmente el cupo de recuperacion; no bloquea el login ordinario. No sustituye controles de borde, deteccion de abuso, soporte y posible reto adicional.
- El control depende de disponibilidad de base de datos y retencion del historial reciente. No borrar filas recientes como mecanismo de limpieza de logs.
- No hay cola duradera ni garantia de entrega:si el proceso termina despues del commit y antes del envio, el codigo puede quedar sin entregar hasta una nueva solicitud permitida. Un timeout tambien puede corresponder a correo aceptado por el proveedor; codigo consumido requerira reemplazo.
- No se debe interpretar la solicitud auditada como correo entregado ni registrar claves/codigos en logs.
- Probar recuperacion real tras publicacion autorizada; revisar PostgREST mientras el negocio opera. No cerrar esos pendientes por las pruebas locales.

## Paquete acumulado para proximo despliegue

- Correccion de accion de auditoria en recuperacion y transporte seguro con timeout/rechazo de redirecciones.
- Controles antiabuso y atomicidad descritos aqui.
- Resumen de transferencias por sucursal/cajero/banco/moneda.
- Configuracion fuente de URL propia y CSP de transicion; comprobar variables/cabeceras reales de Render, no asumir que editar render.yaml las cambia.
- Checklist, evidencia de PostgREST/correo y control de gastos. El informe de seguridad preexistente no se modifico.

Puertas antes de publicar:autorizacion final, revision de diff y respaldo segun procedimiento, salud/billing de Render recuperados, build/lint y pruebas de ambos paquetes, verificar dominio/CORS/CSP efectivos; despues prueba real de recuperacion por el titular sin compartir codigo ni contrasena.
