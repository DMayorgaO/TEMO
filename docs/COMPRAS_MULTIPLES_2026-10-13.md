# Compras USD con saldo entre pestanas

Sustituye la aproximacion por NIO aislado de COMPRA_USD_NETA_2026-10-13.md.
El reporte reproduce el saldo del cliente, en orden, como el formulario:
retiros menos efectivo entregado, ingresos menos efectivo recibido, conversion
entre monedas a tasas registradas, vuelto y compensaciones. No comparte dinero
entre grupos. Efectivo y vuelto compartidos se aplican una sola vez.

- Un retiro NIO retenido puede financiar el siguiente ingreso USD a VENTA.
- Un retiro ya entregado no puede financiarlo otra vez.
- USD fisico y retiros USD no se registran como compras a COMPRA.
- El financiamiento NIO neto limita la compra tras descontar vuelto.
- El importe por transaccion no supera el nominal; se reparte el saldo que
  financia varias pestanas y se separan residuos de redondeo.
- Credito queda fuera hasta cobro; cobros conservan su calculo NIO neto por lote.
- Arqueo y cierre muestran compras USD y diferencial desde el mismo servicio
  del listado. No se cambia esperado contable ni diferencia registrada ni se
  ocultan faltantes/sobrantes escribiendo ajustes automaticos.
- Consultas limitadas por usuario/turno. Resumen interno se obtiene solo tras
  autorizar acceso al turno; no existe una nueva ruta publica.

## Casos revisados

TRA-003926 contiene cuatro pestanas, no solo retiro/deposito final. El deposito
guardado es USD235.13. NIO8600 retenidos mas NIO100 financian NIO8699.81:
compra USD235.13, diferencial NIO141.078 y residuo NIO0.19. El billete NIO100
esta incluido en esa compra, no se suma otra compra por ese billete.

TRA-003894: nominal total USD207.02 menos USD200 fisicos compra USD7.02.
NIO400 menos NIO140 vuelto deja NIO260; costo NIO259.74 mas residuo NIO0.26.
La aproximacion anterior USD7.0270 incluia ese residuo como compra; ahora no.
TRA-003899-02 conserva compra USD130 y diferencial NIO78.

## Verificacion

- 170 pruebas backend, 21 frontend; build y lint correctos.
- 15 escenarios unitarios de saldo entre pestañas y regresion real PostgreSQL
  con rollback del grupo completo, coincidencia listado/arqueo y anulacion.
- Verificacion READ ONLY contra datos productivos. Sin migraciones ni
  escrituras a transacciones, saldos, arqueos o diferencias registradas.
- QA visual con sesion administrativa real y despliegue pendientes de registrar.
- Control de gastos y diagnosticos temporales permanecen locales.
