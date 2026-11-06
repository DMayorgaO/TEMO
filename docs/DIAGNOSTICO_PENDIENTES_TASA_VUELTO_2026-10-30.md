# Diagnostico: tasa de vuelto al compensar pendientes (2026-10-30)

Estado actual: corregido y probado en desarrollo; NO publicado. Se conservaron los cambios locales previos. La investigacion original se conserva a continuacion; la implementacion y sus pruebas se describen al final. No se realizaron operaciones ni consultas productivas.

## Reporte

La captura del titular muestra un grupo BANPRO RE USD 34.34 / LAFISE DC USD 40, conteo de la segunda transaccion NIO 23 y USD 32, tasa Venta 37 y rechazo TRA-DAT-409 indicando Compra 36.40. La captura no muestra el monto/moneda del pendiente seleccionado ni el conteo de la primera transaccion. Se solicitaron esos datos para reproducir el caso exacto; no deben inferirse del saldo final mostrado.

## Hallazgo reproducido

`calculateTransactionCustomerBalanceSteps` resta el pendiente seleccionado en la ultima transaccion efectiva, antes de compensar monedas y determinar la tasa de vuelto. Tambien resta compensaciones ya registradas al editar.

En `createBatch`, `assertChangeRateRule` calcula y valida la tasa durante el recorrido de transacciones SIN restar el pendiente. `applyPendingCompensations` consulta y aplica los pendientes despues de ese recorrido. Por ello pantalla y servidor pueden validar saldos diferentes.

Reproduccion pura local en tmp/reproduce-pending-change-rate.cjs, sin base de datos: retiro USD 34.34 sin entrega fisica en esa pestana, deposito USD 40, recibido NIO 23 / USD 32 y pendiente sintetico USD 26.34. Pantalla: saldo NIO 23 / USD aproximadamente cero, tasa Venta. Servidor antes de compensar: saldo NIO 23 / USD 26.34, exige Compra y reproduce literalmente el mensaje de la captura. El pendiente sintetico NO es el monto informado por el usuario: este todavia no se conoce. El ejemplo demuestra que el defecto tambien ocurre con pendiente y transacciones en la misma moneda.

El rechazo visible corresponde a la validacion de tasa; no prueba por si solo que el pendiente fuera de otra moneda. Otra validacion posterior exige cobertura por moneda en `applyPendingCompensations` y no convierte el saldo para cubrir un faltante de la moneda del pendiente.

## Correccion que debe verificarse

- Leer, autorizar y bloquear los pendientes dentro de la misma transaccion SQL antes de validar el saldo final; obtener montos desde la base, nunca confiar en montos de pago enviados por el navegador.
- Aplicar las compensaciones en el mismo punto de calculo que la pantalla, conservando el orden del grupo, compra/venta, tasa preferencial y efectivo recibido/entregado/vuelto.
- Revisar tambien `updateGroup`: actualmente valida tasas antes de considerar los abonos vinculados y comprueba cobertura despues. Crear y editar deben compartir la misma regla, sin descontar el pendiente dos veces.
- Mantener suficiencia por moneda, alcance de sucursal/dia/turno, pendientes ya pagados, bloqueo concurrente, recibos idempotentes, auditoria y rollback del grupo completo ante rechazo.
- Probar monedas iguales con efectivo mixto, compensacion parcial del saldo a favor, vuelto NIO/USD, anulacion/reapertura, edicion de grupos ya compensados y compra/venta de dolares. No sustituir la tasa enviada por una tasa forzada ni retirar la validacion.

## Mejora solicitada para una etapa posterior (estado histórico)

Permitir liquidar un pendiente con saldo a favor de otra moneda. Requiere definir y persistir moneda/importe de origen, moneda/importe aplicado al pendiente, tasa y sentido de conversion, diferencias de redondeo y tratamiento en compra/venta de dolares. Debe conservarse el saldo remanente, evitar duplicar efectivo o movimientos bancarios y soportar anulacion/edicion trazables. No habilitarlo simplemente eliminando la restriccion actual ni confundirlo con corregir el desacuerdo de tasas.

## Datos confirmados por el titular y segunda reproduccion

El titular confirmo pendiente USD 26.92; retiro real USD 34.31 (digitado USD 34.34 en la captura); deposito USD 40; efectivo adicional USD 32 y NIO 23; tasa Venta 37. El saldo del retiro se utiliza para liquidar el pendiente y completar el deposito, sin suponer una entrega y reingreso ficticios de efectivo en la primera pestana.

- Retiro 34.31: despues del pendiente quedan USD 7.39; con USD 32 suman 39.39. Faltan USD 0.61 para el deposito, que cuestan NIO 22.57. Vuelto NIO 0.43.
- Retiro digitado 34.34: despues del pendiente quedan USD 7.42; con USD 32 suman 39.42. Faltan USD 0.58, que cuestan NIO 21.46. Vuelto NIO 1.54, coincidente con la captura.

`tmp/reproduce-pending-change-rate-exact.cjs` ejecuto el calculo real de pantalla y los validadores compilados del servidor con fixtures en memoria, sin conexion ni escrituras de base. Ambos casos producen tasa Venta en pantalla y rechazo que exige Compra en el servidor.

Ademas se aislo la validacion posterior `applyPendingCompensations`: aun corrigiendo solo la tasa, rechazaria por saldo disponible USD 26.31 / 26.34 contra pendiente USD 26.92. Esa comprobacion resta el deposito completo antes de considerar que los cordobas financian los USD 0.61 / 0.58 faltantes del deposito. Por eso una correccion exclusivamente del mensaje/tasa no resuelve este caso.

Este caso no debe confundirse con habilitar el pago general de pendientes entre monedas distintas: retiro, pendiente y deposito son USD; los NIO se cambian para completar el deposito. La correccion debe representar esa asignacion y conversion de forma consistente en validacion, compensacion, efectivo esperado, compra/venta de dolares, edicion y anulacion, sin duplicar valor disponible. Estado al finalizar el diagnostico: aun sin cambios funcionales ni publicacion. La correccion posterior se registra debajo.


## Correccion inicial implementada en desarrollo (antes de la ampliación entre monedas)

- `loadPendingCompensations` obtiene saldos reales y bloquea los pendientes seleccionados antes de calcular el grupo. Mantiene validaciones de sucursal/dia, estado cobrable, tipo POR_COBRAR y seleccion sin duplicados; el orden de bloqueo es estable por UUID.
- `validateCompensatedGroup` aplica la deuda seleccionada en la ultima transaccion efectiva, antes de compensar monedas y validar la tasa del vuelto, igual que la pantalla. Crear y editar grupos compensados usan esta misma regla.
- Comprueba que existan fondos de la moneda del pendiente (retiros retenidos y efectivo recibido, descontando efectivo entregado/vuelto). No considera un nuevo pendiente como fondos disponibles. Luego comprueba que el saldo final cubra TODAS las operaciones y los pendientes despues de conversiones; no permite gastar el mismo dinero dos veces.
- No se habilito la liquidacion general de deudas mediante otra moneda. La conversion que completa el deposito sigue usando Venta 37, mientras la conversion inversa conserva Compra o la tasa preferencial aplicable.
- Los grupos sin compensaciones mantienen su validacion existente. Los arqueos independientes y los compartidos antiguos se contabilizan segun su modalidad; un conteo compartido no se suma una vez por cada pestana.
- La edicion obtiene las direcciones de los movimientos ya autorizados en base de datos. Valida el grupo completo antes de confirmar y conserva los abonos vinculados. La anulacion completa reabre el pendiente y revierte el grupo mediante los controles existentes.
- Se conservaron sesion, rol, bloqueo de turno, version de edicion, recibos idempotentes, auditoria y rollback atomico. No se modificaron esquemas ni se agregaron migraciones.

## Evidencia de verificacion

1. Regresion general: **333 pruebas backend y 34 frontend**, sin fallos ni omisiones. Compilacion y lint aprobados.
2. **55 pruebas bajo rol SQL restringido**, sin fallos ni omisiones: regresion financiera, seguridad de solicitudes/pagos y reglas de compensacion. Incluyen un caso adicional posterior de tasa preferencial y fondos compartidos; en total son 334 casos backend distintos verificados, sin sumar como nuevos los repetidos.
3. **Siete recorridos de navegador** aprobados: los seis de la tabla/monedas/turnos/pagos/ediciones mas el nuevo `pending-compensation.browser.cjs`, que reproduce ambos casos con BANPRO RE y LAFISE DC. Las API se interceptan, el payload se valida con el calculo real del servidor y no se guardan movimientos desde el navegador.
4. Integracion SQL local con rollback: para cada retiro 34.31/34.34 se crea un pendiente USD 26.92, se guarda el grupo, se verifica un unico abono y dos movimientos bancarios, y se comprueban efectivo fisico (NIO +23 / USD +32), efectivo esperado y reporte de compra de dolares (USD 0.61 / 0.58; diferencia NIO 0.366 / 0.348).
5. La repeticion con el mismo recibo no duplica efectos. Editar el retiro alterna correctamente la conversion sin alterar el efectivo contado ni el importe del abono. Anular el grupo reabre el pendiente con USD 26.92 y restaura los saldos/efectivo.
6. Tasa incorrecta, efectivo insuficiente, pendiente repetido, vuelto excesivo, uso de un nuevo credito como fondos y falta de fondos de la moneda de la deuda siguen rechazandose. Los rechazos de creacion/edicion dejan los datos anteriores intactos.

Los archivos de prueba y capturas estan bajo `tmp` o en los tests correspondientes. Los datos sinteticos de integracion se descartaron mediante rollback; no se resembro ni se reinicio la base. No hubo commit, push ni despliegue productivo. En ese momento la ampliacion general de liquidacion entre monedas diferentes seguia pendiente.

## Ampliación autorizada el 4 de noviembre de 2026

La liquidación entre monedas se incorporó posteriormente en desarrollo, con reporte de compra de dólares, conversiones visibles/auditadas, protección de todas las pestañas que financian el grupo y pruebas de edición/anulación. El estado actual y la evidencia están en [LIQUIDACION_ENTRE_MONEDAS_2026-11-04.md](LIQUIDACION_ENTRE_MONEDAS_2026-11-04.md). Las restricciones de moneda descritas arriba corresponden a la corrección inicial, no al comportamiento ampliado.
