# Rectificacion del reporte de compras USD

Regla confirmada por el usuario: solo ingresos denominados USD liquidados
en cordobas a tasa VENTA (37 actualmente); excluye salidas/remesas a COMPRA
(36.40 actualmente). No depende de fijar tasas constantes en el codigo.

- Elimina inclusion incorrecta de retiros introducida en 602c465.
- Exige arqueo recibido a tasa VENTA registrada y flujo neto NIO positivo.
- Arqueos independientes se calculan por transaccion, sin compensar otra
  pestana del mismo grupo. Arqueos compartidos conservan reparto por grupo.
- Descuenta USD fisicos netos recibidos para no contabilizarlos como cambio.
- Cobros de pendientes requieren igualmente arqueo recibido a tasa VENTA.
- No modifica transacciones, saldos, arqueos, tasas ni sucursales reales.
- Verificacion productiva READ ONLY: TRA-003899-02 es el ingreso de Cristina
  omitido; las remesas de salida ya no aparecen. No se persistio ningun calculo.
- 153 pruebas backend correctas, incluyendo salidas excluidas, ingresos a
  COMPRA excluidos, ingresos a VENTA incluidos, USD fisico, grupos compartidos,
  caso mixto independiente, anulacion y aislamiento de usuarios.
- Compilacion backend y lint correctos. No hay migraciones ni cambios web.

Despliegue verificado: /api/health 200, database ok, revision
abcff9c8d5339975727ac9289c7e6eb662010eed. Reporte anonimo 401 y CORS correcto.
Pendiente confirmacion visual del usuario con su sesion real.
Control de gastos local.
