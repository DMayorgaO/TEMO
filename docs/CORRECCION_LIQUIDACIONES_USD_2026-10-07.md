# Liquidaciones USD y resumen de notificaciones

Fecha: 2026-10-07. Despliegue autorizado por el usuario.

## Causas y correcciones

- Compra de dolares solo reconstruia transacciones ordinarias. Ahora incluye abonos efectivos de pendientes USD por turno de aplicacion y fecha del abono. Distribuye la cobertura USD una sola vez por lote; excluye porciones digitales y compensaciones sin efectivo.
- Arqueo esperado de pendientes usaba el efectivo contado, ocultando diferencias. Ahora utiliza la deuda nominal efectivamente liquidada en efectivo; conteo recibido y vuelto permanecen en el arqueo fisico. No suma el diferencial por separado ni duplica el importe.
- Caso de prueba: USD84 liquidados con C$3108 a venta37. Esperado consolidado C$3057.60 a compra36.40, diferencia positiva C$50.40. El pago del cliente queda equilibrado a 37; no confundir balance del cliente con diferencia del arqueo.
- Consulta de liquidaciones reutiliza el formulario y las tablas habituales de denominaciones. Incluye tasas guardadas, porciones digitales y efectivo compartido una sola vez por lote. Liquidaciones antiguas sin UUID de lote pueden consultarse y revertirse.
- Resumen vertical agrupa transferencias por direccion y moneda: hasta cuatro filas por categoria, con cantidades de transferencias, sucursales y cajeros. Solicitudes de cierre se resumen por cantidad con acceso a revision. Boton de aceptacion a ancho completo sin desbordamiento.

## Verificacion

- Build backend/frontend y lint exitosos; 20/20 pruebas backend de preview y 5/5 frontend.
- Pruebas con PostgreSQL aislado y rollback: USD84 con NIO, dos pendientes con cobertura USD compartida, pago antiguo USD con USD sin compra, combinado USD50 digital y USD50 efectivo, reversion sin diferencias residuales. Regresiones previas de tasas preferenciales, transacciones multiples y compensacion retiro380/pendiente180/deposito200 conservadas.
- Navegador local: consulta USD84 muestra C$3108 y denominaciones 6x500, 1x100, 1x5, 3x1; cuenta del cliente equilibrada, tasa37. Resumen de veinte transferencias ocupa una sola fila vertical y boton completo sin scrollbar interno observado.
- Fixtures visuales exclusivamente en temo_preview: usuario qa.liquidacion y operaciones de ejemplo; no se crearon operaciones ficticias en produccion.

## Alcance operativo

Sin migraciones ni reescritura de registros financieros de produccion. Los informes y arqueos calculados incorporan los abonos existentes al volver a consultarlos. Los importes ya registrados manualmente como diferencias no se alteran automaticamente: requieren conciliacion del Administrador para no compensar dos veces un mismo diferencial.

No se audito mediante sesion autenticada el registro real de CristinaO. La evidencia reproduce el escenario informado en desarrollo. Las siguientes mejoras de seguridad permanecen fuera de este despliegue.
