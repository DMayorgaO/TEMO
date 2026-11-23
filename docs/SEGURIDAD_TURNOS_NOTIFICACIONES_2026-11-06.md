# Turnos, traspasos y notificaciones — solo desarrollo

Se mantiene el trabajo local anterior. No se publica ni se consulta producción. Este bloque no agrega migraciones; la 056 de Directorio sigue siendo un cambio local pendiente de publicación.

## Política HTTP explícita

`ShiftsRouteGuard` cubre los 26 manejadores de `ShiftsController`, después del AuthGuard global. Valida rol, versión exacta de sesión y cambio obligatorio de contraseña antes de procesar el controlador. Todo manejador nuevo sin política explícita queda rechazado. Los controles de registro, estado, sucursal, actor vigente, bloqueos y auditoría siguen en los servicios.

| Operaciones | Roles admitidos en HTTP |
| --- | --- |
| Listar turnos, abiertos, actual, detalle, notificaciones y confirmar lectura | Administrador, Cajero, Transferista; conservan el alcance por usuario existente |
| Consultar acceso al turno; candidatos, vista previa, propuesta, diferencia y resolución de traspaso; apertura preparada; solicitar/cancelar cierre | Cajero |
| Lista de traspasos, exportar turnos, guardar arqueo y saldos | Administrador y Cajero |
| Panel administrativo/exportación; crear/editar apertura, corregir cierre, cerrar/rechazar cierre | Administrador |

No se convierte al Transferista en lector global de turnos: las consultas anteriores siguen limitadas por sus condiciones SQL. Los turnos cerrados propios continúan visibles en el historial del cajero; no se confunde esa política con el listado de Transferencias o Compra de dólares, que tiene otras condiciones.

Se rechazan parámetros de consulta donde no existe un contrato de filtros. El dashboard conserva sus fechas estrictas. Aceptar/rechazar/cancelar traspaso, cancelar solicitud de cierre, abrir turno preparado, rechazar cierre y confirmar una notificación no aceptan campos de cuerpo adicionales. Las demás escrituras mantienen sus esquemas estrictos existentes. No cambian las reglas de efectivo, bancos, monedas, liquidaciones ni cierre.

## Confirmación segura de notificaciones

La confirmación ahora revalida usuario/rol activos, versión de sesión y cambio obligatorio de contraseña dentro de la transacción. El bloqueo compartido de identidad se conserva hasta terminar la escritura. Tanto las notificaciones generales como las de cierre se actualizan únicamente por su destinatario/solicitante; conocer un UUID ajeno no autoriza marcarlo leído, tampoco para el Administrador.

Un reintento autorizado de la misma notificación retorna el identificador y conserva la primera fecha de lectura mediante COALESCE. No requiere recibo financiero: no duplica dinero ni cambia el estado del cierre. Una sesión revocada no puede recuperar este resultado ni marcar la notificación. Esta mejora no sustituye la auditoría financiera obligatoria ni agrega contenido privado a registros de auditoría.

La consulta directa del servicio de traspasos también rechaza el cambio obligatorio de contraseña antes de actualizar vencimientos.

## Evidencia

- `shifts-http-permissions.test.cjs`: 26 manejadores descubiertos y comparados con una matriz independiente; 438 casos de roles/contratos, más fechas permitidas, acción inválida, campos anidados y rechazo de rutas futuras sin política. AuthGuard/controlador/guards/pipes reales, identidad y servicios simulados. Dos pruebas contabilizadas en la suite.
- `record-id-access.test.cjs`: conserva las comprobaciones de UUID e identidad; usa un Administrador simulado válido en las operaciones que lo requieren, para llegar al pipe sin eludir el guard.
- `financial-contract-boundary.test.cjs`: conserva los rechazos de contratos y la comprobación del actor autenticado; usa el Cajero simulado para solicitar cierres/proponer traspasos/registrar diferencia, en vez del Administrador antes utilizado por el servicio simulado.
- `financial-request-security.test.cjs`: SQL real y rollback; historial propio en cinco estados, aislamiento entre cajeros/sucursales y exportaciones; notificaciones ajenas, reintentos, fecha inmutable de primera lectura y revocación/estado/rol/contraseña. Marca de lectura sin cambios de efectivo, arqueo, estado o bloqueo de cierre.
- `shift-handover-concurrency.test.cjs`: dos conexiones reales; una revocación mantiene el bloqueo de usuario mientras la confirmación espera; al confirmar la revocación, el servicio rechaza y la notificación permanece sin leer. Conserva las pruebas anteriores de aceptación única y bloqueo de arqueo concurrente.
- Prueba dirigida inicial: 33 comprobaciones SQL de recibos, traspasos, concurrencia y bloqueo de cierres aprobadas, con datos sintéticos únicamente locales.

Verificación final: build/lint aprobados; 374 pruebas backend y 37 frontend sin fallos ni omisiones. Se repitieron 77 comprobaciones con rol SQL restringido de recibos/permisos, traspasos, bloqueo por solicitud de cierre, regresión financiera y edición/anulación de transferencias; todas aprobadas. Siete suites de navegador aprobadas: traspasos, tabla de transacciones, filtros de moneda, transacciones en revisión, pagos pendientes, cambios/anulaciones y versión de edición. Los recorridos interceptan sus APIs y no escriben operaciones productivas.

API y web locales responden 200. Se inició desarrollo con el lanzador habitual, datos conservados y correo deshabilitado. Sin commit, push ni publicación de este bloque. Permanecen pendientes los contratos/matrices del resto de rutas, retención/centralización/alertas externas de auditoría, CA desde Render y controles de infraestructura. No se declara cerrado el checklist general.
