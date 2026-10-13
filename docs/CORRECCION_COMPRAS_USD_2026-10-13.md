# Reporte de compras USD y contexto de notificaciones

## Diagnostico

- Consulta productiva de solo lectura: turno actual de Cristina TUR-000085
  pertenece a Miscelanea Olivera; la caja coincide con esa sucursal.
- Su turno anterior TUR-000080 pertenece a Plaza Espana. La notificacion
  reportada no tiene captura y ya no hay cierres pendientes de lectura;
  no se ha demostrado que el aviso correspondiera al turno actual.
- La pantalla de turno preparado obtiene sucursal de turnos.id_sucursal.
  Los avisos de cierre tambien consultan el turno al que pertenecen.
- El reporte omitio retiros USD pagados en NIO: solo incluia ingresos USD
  financiados en NIO y cobros de pendientes. No era un fallo de arqueo.

## Correccion

- Incluye retiro USD no cubierto por depositos USD del grupo ni efectivo USD
  neto entregado. Reparte la cobertura una sola vez entre transacciones.
- Considera efectivo por transaccion y efectivo compartido del grupo;
  descuenta vuelto USD. Excluye anulaciones y efectivo de pendientes.
- Conserva alcance del cajero (turno activo propio) y consulta administrativa.
- Calcula sobre registros existentes, sin escrituras ni migraciones.
- Avisos muestran numero de turno y fecha local para distinguir eventos previos.
- Regresion: 153 backend y 21 frontend; prueba financiera enfocada final 20/20,
  incluyendo liquidaciones compartidas/individuales, USD fisico, grupos,
  anulacion y aislamiento de usuarios. Compilacion y lint correctos.
- Validacion del nuevo calculo contra produccion mediante transaccion READ ONLY;
  despliegue y revision remota se registran despues de la publicacion.

No se modificaron asignaciones, saldos, arqueos ni transacciones reales.
Control de gastos y diagnosticos temporales permanecen locales.
