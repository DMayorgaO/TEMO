# Compra USD basada en ingreso NIO neto

El usuario confirma que se debe descontar el vuelto en cordobas.
Esta regla complementa REGLA_COMPRAS_USD_2026-10-13.md.

- Compra USD = NIO neto destinado a ingresos USD / tasa VENTA registrada,
  limitada al ingreso USD elegible; nunca incluye remesas de salida a COMPRA.
- Descuenta vuelto NIO y operaciones nominales NIO del mismo arqueo compartido.
- Reparte fondos compartidos una sola vez; respeta arqueos por transaccion.
- No infiere la compra restando todos los USD recibidos en una pestana: esos
  billetes pueden estar cubriendo otra operacion del mismo grupo.
- Aplica ingreso NIO neto tambien a cobros de pendientes, sin duplicar el lote.
- Mantiene precision interna y redondea a cuatro decimales en el reporte;
  la presentacion monetaria redondea a dos decimales.
- Validacion productiva READ ONLY de ambas transacciones de Kimberly y del
  caso Ficohsa: sin escrituras ni cambios a saldos o arqueos reales.
- Regresiones incluyen vuelto NIO, neto cero, efectivo de varias pestanas,
  operaciones NIO/ USD compartidas, pendientes, anulacion y aislamiento.

Compilacion backend y lint correctos. Bateria secuencial:154/154 correctas.
La primera ejecucion paralela fallo en revocacion HTTP (500 en vez de201);
la repeticion completa secuencial paso, sin modificar esa implementacion.
Despliegue verificado: /api/health200, database ok, revision
2491eeacca3eef632a16bf983ac9c2ad5d3219ca. Reporte sin sesion401 y CORS correcto.
Validacion visual con sesion real del usuario pendiente. Sin migraciones.
Control de gastos excluido y local.
