# Seguridad de liquidaciones de pendientes

Estado: implementado y verificado solo en desarrollo, 2026-10-26. Sin commit, push ni despliegue. Control de gastos local e ignorado.

## Alcance

- POST /transactions/pending/:id/pay y POST /transactions/pending/pay-batch aceptan requestId opcional UUID. Se cubren efectivo individual/multiple, digital y combinado, desde Pendientes y Transacciones.
- Cada solicitud autenticada revalida dentro de la transaccion usuario activo, rol activo JEFA/CAJERO, version de sesion y cambio obligatorio de contrasena. Tambien se revalidan ambas rutas de reversion de liquidaciones.
- Un recibo confirmado se identifica por usuario, operacion y referencia. La misma referencia y contenido devuelve la respuesta original sin repetir abonos, efectivo, movimientos digitales, historial ni auditoria. Cambiar el contenido con esa referencia devuelve conflicto, no un segundo pago.
- El recibo y los movimientos se confirman juntos. Fallar auditoria o persistencia del recibo revierte el pago completo. No hay reintento automatico de escrituras.
- Antes de devolver un recibo se comprueban los abonos actuales y el turno de aplicacion bajo bloqueo: deben seguir existiendo y pertenecer a un turno autorizado ABIERTO/PENDIENTE_APROBACION. No se confunde ese turno con el origen de un pendiente compartido. Se conserva el pago por otro cajero de la misma sucursal/fecha permitido por TEMO.
- Revertir un pago invalida su recibo anterior para futuros reenvios. Aunque despues se liquide otra vez, los identificadores de abonos anteriores no habilitan un nuevo efecto. Corregir legitimamente inicia una referencia nueva.
- La reversion individual bloquea los turnos donde realmente se aplico el dinero antes de validar su estado; no basta tener otro turno abierto en la sucursal. Se mantienen las restricciones de lotes, compensaciones, cierres y revision.
- IDs duplicados, incluyendo distinta capitalizacion de un UUID, se rechazan en la seleccion multiple. Los contratos estrictos no aceptan userId ni shiftId manipulados para liquidar.
- Auditoria de pago multiple agrega saldo anterior/final, estado final, forma de pago, total y cantidad de pendientes. El visor muestra solo campos aprobados, no expande listas internas ni secretos.

## Interfaz

- Referencia creada al abrir un formulario y conservada ante error o reintento manual. Cambiar datos tras un resultado incierto conserva la referencia para que el servidor detecte conflictos, en lugar de ocultarlos con una referencia nueva.
- La transicion de Combinado a su arqueo conserva la misma referencia.
- Bloqueo sin esperar un nuevo render frente a doble clic en los cinco flujos cubiertos.
- Al confirmar se vuelven a consultar los datos actuales; no se fuerza PAGADO a partir de una respuesta antigua. Si falla esa consulta, se conserva el formulario y su referencia para comprobar/reintentar.
- Al confirmar un reintento se elimina el aviso anterior de resultado incierto.

## Base de datos

Migracion 051_pending_payment_receipts.sql aplicada exclusivamente a PostgreSQL preview local (127.0.0.1:55433). Amplia la restriccion de operaciones de los recibos de 049, sin borrar, actualizar ni desproteger recibos existentes. Es repetible. El preflight local exige su registro, junto al de 050.

En un futuro despliegue autorizado: respaldo comprobado y migraciones pendientes primero; API compatible despues; web con requestId al final. Publicar primero la web contra una API anterior provocaria rechazo de su campo nuevo. No ejecutar estas pruebas contra produccion.

## Verificacion

- Backend: 210/210 pruebas, sin omitidas, con PostgreSQL local y rol SQL restringido en las suites que lo soportan. Incluye regresion financiera, aislamiento entre turnos, permisos y auditoria.
- pending-payment-security.test.cjs: validacion estricta; efectivo/digital/mixto; respuesta repetida; conflicto de contenido; rollback por auditoria/recibo; sesion revocada/inactiva/rol cambiado/cambio obligatorio; otra sucursal; pendiente compartido; turno cerrado; reversion y referencia antigua invalidada.
- pending-payment-concurrency.test.cjs: servicios reales y varias conexiones del pool. Dos solicitudes con la misma referencia aplican una vez; referencias distintas compitiendo por el mismo pendiente no duplican el pago; dos reversiones restituyen efectivo una vez. Fixtures de sucursal aisladas y eliminadas al terminar. Solo la tabla de recibos se clona en un esquema temporal con clave/restricciones e inmutabilidad, para no desproteger recibos persistentes al limpiar.
- Frontend: 27/27 pruebas unitarias, compilacion y lint de ambos proyectos correctos.
- pending-payment-security.browser.cjs: cinco flujos con API interceptada y sesiones sinteticas. Doble clic, perdida de respuesta, reintento manual con misma referencia, conflicto tras editar un borrador incierto, relectura y limpieza del aviso anterior. No envia pagos reales.
- Regresion de navegador de transacciones y traspasos con dos sesiones correcta. Sin cambios de diseno de pantallas ni de las reglas de compras de dolares.

## Pendiente

- QA manual con Administradora y cajeros en desarrollo, incluyendo POR_PAGAR y monedas utilizadas en cada sucursal. La cobertura automatica nueva de recibos usa POR_COBRAR NIO; la regresion financiera existente mantiene casos USD y compras.
- Extender recibos al resto de escrituras financieras y completar la matriz de rutas. Los clientes anteriores sin requestId siguen operando, pero no reciben confirmacion idempotente tras perder una respuesta; el estado del pendiente sigue evitando duplicar pagos.
- Definir retencion/archivo de recibos, auditoria y respuesta a incidentes. Los recibos actuales son inmutables; no se implemento borrado automatico.
- Paginacion y limites de carga generales, dispositivos/Zero Trust, cookies/CSRF y controles de infraestructura siguen pendientes segun checklist. No se ofrece operacion offline ni garantia de seguridad total.
