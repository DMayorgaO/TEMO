# Tasa D desde la primera transacción (2026-11-12)

Estado: implementado en desarrollo, sin publicación ni migración. Requisito confirmado: el cliente deposita córdobas y entrega dólares. No se habilita tasa preferencial para que el cliente compre dólares con córdobas.

## Comportamiento

- El mismo botón D aparece desde la primera pestaña al crear o editar. No se añade otro botón ni otro valor de tasa.
- Activa la tasa existente C$ 36.55 para USD → NIO en el registro/grupo de ese cliente. Ejemplo: $100 recibidos cubren un depósito de C$ 3,655.
- La conversión NIO → USD sigue usando la tasa normal C$ 37.00. No se cambió la lógica del servicio financiero, el cálculo de Compra de dólares ni sus diferenciales.
- Se elimina únicamente la restricción de contrato que exigía dos transacciones para D, y el efecto visual que lo apagaba al quedar una sola pestaña. Se conservan el literal 36.55, los contratos estrictos y todas las validaciones financieras.
- Al abrir un registro nuevo, D empieza apagado. El cambio no escribe tasas globales ni almacenamiento de preferencias del cliente. Una edición identifica la D guardada y permite desactivarla conservando las tasas normales.
- Una liquidación independiente posterior no hereda D del pendiente original: usa las tasas normales. Las compensaciones dentro del mismo registro conservan el funcionamiento previo de D.

## Pruebas del caso correcto

SQL local con datos sintéticos y rollback:

- Depósito NIO inicial financiado con USD a 36.55; vuelto en USD, valores físicos y consolidado coherentes, sin sumar Compra de dólares.
- Edición conservando D, desactivación, registro posterior USD a 37, anulación y restauración de saldos/efectivo.
- Efectivo mixto NIO/USD, dos depósitos y compensación de deuda NIO usando USD. Se conservan las monedas de la deuda, las tasas almacenadas y la reapertura al anular.
- Casos anteriores de D con retiro USD, pendientes entre monedas y Compra de dólares siguen en la regresión.

Navegador con APIs sintéticas interceptadas, sin escrituras reales:

- 1366×768 y 1920×1080: D visible en primera pestaña, activación/desactivación, cuenta equilibrada para $100 → C$ 3,655 y contrato correcto.
- Edición con D guardada y desactivación; cliente posterior con compra de $100 por C$ 3,700, D apagado y configuración global intacta.
- Liquidación independiente de un pendiente originado con D no arrastra la tasa.
- Siete escenarios existentes de compensación entre monedas aprobados.

La propuesta inicial para la conversión inversa fue retirada tras la aclaración del titular. No permanece el campo specialExchangeRateKind ni lógica preferencial de venta. El alcance final es exclusivamente la función D existente disponible desde la primera transacción.

## Resultado final

- Build/lint correctos; 404 pruebas backend y 37 frontend aprobadas sin fallos ni omitidas.
- Ocho suites de navegador aprobadas: seis recorridos habituales, preferencia desde el primer depósito en ambas resoluciones y siete escenarios del recorrido de compensaciones entre monedas.
- 35 pruebas de regresión financiera repetidas bajo rol SQL restringido en preview, con rollback, todas aprobadas. No se suman al total backend porque repiten casos.
- Verificación visual del primer depósito NIO con D y $100 recibidos: encabezado equilibrado y tasa Compra C$ 36.55. Capturas privadas en tmp/preferential-first-1366.png y tmp/preferential-first-1920.png.
- Logs privados: tmp/preferential-first-restricted.log, tmp/preferential-first-browser.log, tmp/preferential-cross-currency-browser.log y tmp/transaction-table-*.log.

No se ensayaron operaciones financieras productivas ni se publicó el cambio. Los resultados corresponden a la versión corregida después de confirmar el sentido USD → NIO.

Desarrollo reiniciado con la versión corregida: API/web HTTP 200, datos conservados y correo deshabilitado.
