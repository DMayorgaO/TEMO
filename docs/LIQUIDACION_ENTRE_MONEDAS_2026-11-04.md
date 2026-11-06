# Liquidación de pendientes entre monedas — desarrollo

Implementada por solicitud del titular el 4 de noviembre de 2026. Sin publicación, cambios de esquema ni migraciones. Conserva los cambios locales anteriores de Transacciones paginadas y de compensación de pendientes.

## Comportamiento

En «Liquidar pendientes» se pueden seleccionar cuentas por cobrar NIO y USD del día y sucursal autorizados. Se liquida el saldo restante completo de cada pendiente seleccionado; no se agregó un editor de abonos parciales en este formulario. Los abonos parciales existentes se respetan: se obtiene y bloquea el saldo pendiente actual desde PostgreSQL.

El saldo disponible de retiros retenidos, efectivo recibido y otras pestañas puede pagar la deuda en otra moneda. La deuda conserva su moneda. NIO a USD utiliza Venta; USD a NIO utiliza Compra, incluida la tasa especial D del grupo. Primero se descuentan las obligaciones por moneda y después se convierten sólo saldos de signos opuestos. El efectivo entregado o vuelto se descuenta y se valida el saldo final de todo el grupo. No se inventa entrega/reingreso de efectivo ni un movimiento bancario para la conversión.

Ejemplos con Compra 36.40 / Venta 37:

| Saldo disponible | Deuda seleccionada | Conversión | Restante |
|---|---|---|---|
| Retiro C$ 500 | USD 10 | C$ 370 → USD 10 | C$ 130 |
| Retiro USD 15 | C$ 364 | USD 10 → C$ 364 | USD 5 |
| Depósito C$ 100 con C$ 600 recibidos | USD 10 | C$ 370 → USD 10 | C$ 130 |
| Depósito USD 5 con USD 20 recibidos | C$ 364 | USD 10 → C$ 364 | USD 5 |
| Retiro C$ 500 | C$ 130 y USD 10 | C$ 370 → USD 10 | 0 |

El formulario muestra las deudas seleccionadas, las conversiones del grupo (importe y moneda de origen/destino, sentido y tasa), y el saldo global restante. Las dos equivalencias del vuelto no se suman entre sí. Las conversiones no se redondean a centavos durante el cálculo; se conserva la precisión contable y la presentación monetaria habitual.

## Registro, reportes y correcciones

- Los abonos siguen almacenados en la moneda original, con su importe, tasas utilizadas, turno y transacción vinculada. Los arqueos y transacciones guardados permiten reconstruir el origen del saldo. El historial registra las conversiones calculadas por el servidor para el grupo; al editar se incluyen en la auditoría obligatoria. No se confía en importes de deuda ni conversiones enviados por el navegador.
- Compra de dólares incluye la conversión que financia un pendiente USD aunque no exista un nuevo depósito USD. Lo ya asignado a depósitos se descuenta antes de asignar a la deuda; se limita por deuda y financiamiento NIO neto. La fila se asocia a la transacción que conserva el abono. No se suman las equivalencias del vuelto como compras adicionales.
- El ejemplo original conserva USD 0.61 comprados y C$ 0.43 restantes para retiro USD 34.31, o USD 0.58 y C$ 1.54 para retiro digitado USD 34.34. No se computan los C$ 23 completos como conversión.
- Crear y editar usan la misma validación de grupo. Una anulación parcial debe conservar fondos suficientes y reasocia el abono a la última transacción efectiva. La anulación completa elimina la compensación y recalcula/reabre el pendiente, conservando cualquier otro abono.
- Las rutas individuales de edición/anulación exigen usar el grupo cuando cualquier pestaña tiene una compensación vinculada, incluidas las pestañas que sólo aportan fondos. No se puede retirar el financiamiento dejando la deuda pagada.
- Al editar un grupo con D, se conserva la referencia a la tasa base y se guarda 36.55 como tasa usada del grupo; no se introduce una tasa general nueva por activar D. Los abonos actualizan su tasa y referencia al reasociarse.

## Controles preservados

Sesión vigente, rol, sucursal/día/turno, estado cobrable POR_COBRAR, pendientes ya pagados, selección duplicada, bloqueo de filas, recibos idempotentes, versiones de edición, auditoría y rollback atómico. Un crédito nuevo no aporta fondos. Tasas de vuelto incorrectas, fondos insuficientes, vuelto excesivo y doble utilización del dinero siguen rechazándose. Las operaciones sin pendientes conservan su cálculo y validaciones.

## Verificación

Pruebas en `backend/tests/pending-compensation-rates.test.cjs`, `purchase-ledger.test.cjs` y `financial-regression.test.cjs`; recorridos sintéticos en `frontend/tests/cross-currency-compensation.browser.cjs` y `pending-compensation.browser.cjs`. Los tests SQL se ejecutan contra preview local con rollback y también bajo rol SQL restringido. Los recorridos interceptan todas las APIs, verifican los payloads con el cálculo compilado del servidor y no guardan operaciones. Se cubren ambas resoluciones de pantalla indicadas por el titular.

Se comprueban creación, reintento idempotente, edición, rechazo sin cambios parciales, anulación parcial/total, reasociación de abonos, tasa preferencial, efectivo real/esperado y reporte de compra de dólares.

Resultados finales: **351 pruebas backend y 34 frontend aprobadas**, cero fallos u omitidas; **66 comprobaciones repetidas bajo rol SQL restringido**, todas aprobadas (no se suman como casos nuevos). Compilación y lint correctos. **Ocho suites de navegador aprobadas**, incluida la nueva suite con siete escenarios entre monedas y la reproducción de los dos retiros originales. Inspección visual de capturas a 1366×768 y 1920×1080; se corrigió también el rótulo para no mostrar «Venta 36.40» cuando la equivalencia utilizada es Compra.

La compilación mantiene la advertencia existente de Vite por un chunk superior a 500 kB. No se afirma capacidad ni rendimiento productivo a partir de estas pruebas. No se realizaron commit, push ni despliegue.
