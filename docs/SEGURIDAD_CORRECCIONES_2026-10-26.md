# Seguridad de ediciones y anulaciones

Estado: solo desarrollo, 2026-10-26. Sin commit, push ni despliegue. Control de gastos local e ignorado.

## Cambios

- PUT /transactions/:id, POST /transactions/:id/void y PUT /transactions/:id/group aceptan requestId opcional UUID en contratos estrictos. No aceptan identidad ni turno manipulados en el cuerpo.
- Las operaciones EDITAR_TRANSACCION, ANULAR_TRANSACCION y EDITAR_GRUPO usan el recibo atomico existente: misma identidad, operacion, referencia y contenido confirman el resultado original sin repetir movimientos o auditoria. El ID del registro tambien participa en la huella; cambiar contenido o destino con la misma referencia provoca conflicto.
- La edicion/anulacion de un grupo se confirma con un solo recibo externo. Sus cambios internos no generan recibos separados. Fallar la auditoria o el recibo revierte todo el grupo.
- Cada reenvio vuelve a validar usuario/rol activos, version de sesion y cambio obligatorio de contrasena. Se verifica el registro y el estado actual de su turno antes de devolver la confirmacion. Un ancla anulada puede confirmar el recibo de una anulacion ya aplicada, sin volver a ejecutar la operacion.
- El cajero conserva edicion sobre sus turnos ABIERTO/EN_REVISION y no obtiene acceso a registros ajenos. Sus recibos no se devuelven cuando el turno ya esta cerrado. Se mantienen las restricciones de liquidaciones en otro turno y de pendientes ya pagados.
- Administradora mantiene correcciones historicas de CERRADO sin alterar fondos del cierre. ANULADO y PENDIENTE_APERTURA ya no permiten corregir transacciones, tampoco con perfil administrativo. Una anotacion historica anulada no se reabre mediante una nueva edicion.
- La anulacion ordinaria registra antes/despues de estado, importe, moneda, movimiento, tasas y arqueo permitido. El visor de Auditoria conserva su lista de campos aprobados; no muestra el cuerpo completo ni las referencias internas no permitidas.

## Interfaz

- Cada formulario de edicion recibe una referencia nueva. Ante resultado incierto se conserva, tambien si se cambia el borrador: el servidor detecta el conflicto en vez de ocultarlo con otra referencia.
- La anulacion individual conserva una referencia por registro hasta obtener confirmacion y refrescar los datos. No se guardan estas referencias en almacenamiento persistente ni se implementan escrituras offline.
- Bloqueo inmediato de doble clic en edicion, anulacion y grupos. Las confirmaciones de anulacion individual/grupal tambien estan protegidas contra clics simultaneos; cancelar libera el bloqueo sin enviar nada.
- Despues de confirmar, la tabla vuelve a consultar los datos actuales. Una confirmacion antigua no sobrescribe una edicion posterior ni inserta filas repetidas.
- La anulacion historica informa que cierre y fondos se conservaron, no que se revirtio dinero. Si la relectura muestra cambios posteriores o el registro ya no esta disponible, se informa ese resultado en vez de afirmar un estado actual no comprobado. El caso de cambios posteriores tras una anulacion se prueba como defensa de interfaz con API sintetica; no habilita reapertura de anulaciones en el servidor.

## Migracion y despliegue futuro

052_transaction_change_receipts.sql amplia la restriccion de operaciones de solicitudes_financieras. No elimina ni desprotege recibos existentes. Aplicada solamente al preview PostgreSQL local 127.0.0.1:55433 y requerida por el preflight.

Para un despliegue autorizado: respaldo y migraciones pendientes primero, API despues, web al final. La API anterior rechazaria requestId en las rutas nuevas. No degradar la restriccion a una lista antigua si ya existen recibos de las operaciones nuevas.

## Verificacion

- Backend 219/219; frontend 27/27; compilacion, lint y preflight local correctos. Suites SQL restringidas donde el ensayo lo admite, sin operaciones contra produccion.
- transaction-change-security.test.cjs: formatos/identidad/turno manipulados; reenvio y conflicto de contenido/registro; edicion posterior preservada; anulacion sin doble restitucion/auditoria; grupo completo y pertenencia de IDs; fallo de auditoria/recibo con rollback; sesiones revocadas y usuarios ajenos; turnos indisponibles; correcciones historicas sin cambiar fondos. Datos del ensayo revertidos al terminar.
- transaction-change-concurrency.test.cjs: servicios reales con conexiones independientes del pool. Dos ediciones/anulaciones con igual referencia aplican una vez; un grupo completamente anulado confirma su resultado al reenviar; dos anulaciones con referencias distintas no restituyen dinero dos veces. Sucursal aislada de ensayo, solo recibos clonados en esquema temporal con sus restricciones/inmutabilidad para limpieza; no se deshabilitan protecciones persistentes.
- transaction-change-security.browser.cjs: edicion individual/multiple y anulacion individual/multiple, cancelacion de confirmacion, doble clic, perdida de respuesta, mismo requestId al reintentar, conflicto al cambiar borrador, nueva referencia al abrir otro formulario y relectura del valor actual. Tambien mensajes historicos y respuesta antigua defensiva. Todas las APIs interceptadas, sin escrituras reales.
- Regresion de pagos, recibos de altas, turnos en revision, monedas de centavos y compras de dolares conservada.

## Pendientes

- QA manual del paquete acumulado con Administradora y cajeros, incluyendo liquidadas digitales y correcciones de grupos con compensaciones en sucursales habituales.
- Referencias distintas siguen siendo operaciones distintas. Avance posterior: el versionado de transacciones ya esta implementado en desarrollo y documentado en FORMULARIOS_OBSOLETOS_2026-10-26.md; no debe confundirse con la deduplicacion de recibos descrita en este bloque.
- Extender cobertura de permisos/recibos a otras escrituras (aperturas/cierres, transferencias editadas, directorio); definir retencion/archivo y atender los controles de infraestructura del checklist.
- Clientes anteriores sin requestId mantienen compatibilidad, pero no reciben esta confirmacion idempotente. Los reintentos son manuales; no hay cola offline ni repeticion automatica de escrituras.
