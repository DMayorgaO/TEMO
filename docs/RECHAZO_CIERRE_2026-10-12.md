# Rechazo de cierre de turno

Solicitud autorizada del usuario: opcion administrativa en formulario y
notificacion, y reapertura puntual de TUR-000081. No cambia la politica de
edicion de transacciones mientras el turno permanece pendiente.

- POST /shifts/:id/reject-close: UUID validado, sesion autenticada y solo JEFA.
- Revalida en transaccion rol/usuario activos y version de sesion; bloquea turno.
- Solo PENDIENTE_APROBACION con solicitud PENDIENTE: solicitud CANCELADA,
  revision administrativa registrada y turno ABIERTO. No reabre CERRADO.
- Auditoria RECHAZAR con evento RECHAZAR_CIERRE_TURNO y estados antes/despues.
- No cambia saldos, arqueo, transacciones ni importes; fallo de auditoria revierte.
- Formulario muestra boton solo a Administrador y turno pendiente; confirmacion.
  Notificacion resumida identifica cada solicitud y permite revisar o rechazarla
  individualmente. Una cancelacion visual no rechaza solicitudes.
- Solicitar cierre ahora es atomico; solicitar, cerrar y rechazar bloquean el
  turno en el mismo orden para no dejar solicitud/turno descoordinados.
- Regresion:152 backend y21 frontend, build/lint correctos. Prueba real local
  con rollback acredita reapertura, edicion posterior, permisos, sesion obsoleta,
  rechazo repetido/cerrado y fallo atomico de auditoria.
- Backup productivo20261012-183940 restaurado en servidor local aislado,
 62 tablas/vistas. Preflight remoto solo lectura aprobado, sin migraciones.

## Caso autorizado

TUR-000081, ROSCAJA: reabierto y solicitud cancelada mediante transaccion
tecnica autorizada expresamente por el usuario; comprobado posteriormente.
Auditoria con origen SOPORTE_AUTORIZADO e id_usuario nulo: no se atribuye a
una cuenta administrativa que no inicio esa accion. Sin escrituras financieras.
La transaccion consultada permanece REGISTRADA en el mismo turno/cajero.

## Publicacion verificada

- Commit fe600668431a10a1c4f5c5bd369c7d130a8a56c4 publicado en main.
- API productiva: /api/health responde 200, database ok y revision fe60066.
- Web productiva: 200 y recurso index-CP7VdSLv.js con ruta y boton de rechazo.
- POST de rechazo sin sesion: 401 TUR-AUT-401, Cache-Control no-store;
  CORS permite https://temo.miscelaneaolivera.com. CSP conserva ambos origenes API.
- Regresion enfocada repetida tras compilacion final: 23/23 correctas.
- Reconsulta productiva: TUR-000081 ABIERTO, solicitud CANCELADA, sin fecha
  de cierre; TRA-003849-01 sigue REGISTRADA y pertenece a ROSCAJA.
- Pendiente QA visual con sesion administrativa real de los dos botones;
  no se simularon sesiones ni se rechazaron otras solicitudes en produccion.

El Control de gastos permanece local y excluido del repositorio.
