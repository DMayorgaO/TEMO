# Transferencias: correcciones seguras

Estado: solo desarrollo. No autoriza despliegue ni aplica migraciones productivas. Se conserva el ajuste pendiente del saldo del cliente en el encabezado de transacciones.

## Alcance

- PUT /transfers/:id y POST /transfers/:id/void incorporan recibos atomicos EDITAR_TRANSFERENCIA y ANULAR_TRANSFERENCIA. La identidad, operacion, referencia y contenido identifican una solicitud; repetirla devuelve su confirmacion sin aplicar movimientos ni auditoria de nuevo. Reutilizarla con otro registro, motivo o contenido devuelve conflicto.
- Antes de cualquier escritura y de confirmar un reenvio se revalidan identidad activa, rol, cambio obligatorio y version de sesion. Se mantienen los permisos previos de Administrador/Transferista y de egresos propios del Cajero, sucursal/cuenta/moneda y bloqueo por cierre/traspaso.
- La migracion 055 agrega version BIGINT a cada transferencia y triggers del registro y sus denominaciones. Un editor antiguo recibe TRF-VER-409 antes de revertir/aplicar fondos. Los bloqueos conservan el turno original; no permite mover una transferencia a otro turno ni corregir financieramente uno cerrado.
- El detalle obtiene version, datos y denominaciones en una sola sentencia SQL. Lecturas normales o cambios de otra transferencia no invalidan un editor. Un recibo confirmado se valida antes de la version vieja: el reintento no es una segunda escritura.
- Altas, ediciones y anulaciones registran auditoria obligatoria en la misma transaccion. Si falla la auditoria o el recibo, se revierten fondos, arqueos, movimientos y versiones. Snapshots explicitos de monto, moneda, estado, tipo/direccion, cuenta por alias, codigo de turno, descripcion/motivo y denominaciones; no guardan credenciales ni datos completos de usuarios/cuentas bancarias.
- La interfaz conserva referencia y borrador ante un resultado incierto, limita doble envio con ref sin esperar otro render y recarga datos actuales al confirmar. No reintenta escrituras automaticamente. No toma una respuesta historica de recibo como estado actual de la tabla.
- Anular usa ventana TEMO con monto, cajero y motivo obligatorio (3-500 caracteres), en lugar del prompt nativo. Relee el detalle antes de abrirla; una modificacion posterior exige revisar nuevamente, no renueva version ni referencia de forma silenciosa.

## Compatibilidad

Las referencias y versiones siguen siendo opcionales en API para clientes anteriores. La web actual las exige al editar/anular; clientes que las omitan no obtienen la garantia de confirmacion idempotente/versionado, aunque conservan permisos, bloqueos, auditoria y rollback. Decidir obligatoriedad/version de API movil en otro bloque.

Un reenvio confirmado es de solo lectura: puede acreditar al Administrador/Transferista una operacion anterior sobre un turno ya cerrado; no habilita otra escritura. Cajeros sin acceso actual o sesiones revocadas no recuperan el recibo saltandose autorizaciones.

## Evidencia local

- Node 22.23.4: build y lint de ambos proyectos correctos. 254/254 pruebas backend y 33/33 frontend sin omitidas.
- 12 pruebas focalizadas aprobadas tambien bajo rol SQL restringido; DDL de la migracion se comprueba como propietario antes de bajar al rol de aplicacion. No se ampliaron permisos para hacer pasar las escrituras.
- Dos conexiones reales: ediciones con referencias distintas y la misma version, solo una gana; referencias iguales confirman el mismo resultado. Doble anulacion con la misma referencia no restituye efectivo dos veces. Recibos de este ensayo se aislan en esquema temporal propio.
- Ocho recorridos de navegador aprobados, incluido transfer-change-security: efectivo/digital, formulario obsoleto, conexion interrumpida, cambio de contenido tras respuesta incierta, borrador conservado, doble clic y anulacion. APIs interceptadas, no operaciones reales.
- Ventana de anulacion sin desborde en 1366x768, 1920x1080 y 390x844. Saldo fijo de transacciones conserva altura de herramientas, colores y ambas monedas.
- Preflight local exige migracion 055 y dos triggers de transferencias habilitados. Ensayo de respaldo/restauracion de preview: coinciden datos/estructura de 62 tablas, 1533 elementos estructurales y 7 secuencias, ademas de vistas. Solo se amplia la normalizacion de CHECK a la lista exacta de operaciones de 055, sin ignorar valores alterados.

## Pendientes y publicacion futura

- QA manual con Administradora, Transferista y Cajero: dos ventanas sobre la misma transferencia, egreso propio, efectivo/digital, anulacion con motivo y revision de Auditoria.
- Completar recibos/versionado del resto de formularios (por ejemplo aperturas/cierres), politica de retencion, clientes antiguos e infraestructura/CA pendientes. No se declara completo el checklist global.
- Para publicar: autorizacion nueva, respaldo productivo verificado y ventana acordada; migracion 055 antes de API y web. Conservar claves MFA y recibos. El ensayo de migraciones 044-054 del despliegue anterior no sustituye el ensayo de 055 sobre un respaldo del estado productivo actual.
- Control de gastos, certificados, configuracion privada, respaldos y tmp siguen locales. Este bloque no hace commit/push ni modifica Render/Supabase productivos.
