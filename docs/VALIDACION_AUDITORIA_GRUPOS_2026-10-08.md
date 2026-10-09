# Auditoria de grupos multiples: desarrollo

## Alcance

- updateGroup de turnos abiertos captura auditTransactions antes y despues de la operacion en la misma transaccion de base de datos, preservando los datos previos de bitacora.
- Cada miembro incluye UUID, orden, estado, monto, moneda, banco, movimiento, tasas y arqueos almacenados. Incluye miembros anulados para comparar su estado.
- El visor compara por UUID, no por posicion del array. Orden identifica la pestaña; no se reutiliza como identidad.
- Campos expuestos siguen lista permitida; no retorna JSON completos ni claves arbitrarias. Grupos de comparacion limitados a 20 miembros; identificadores invalidos o duplicados no se emparejan.
- Conteos compartidos se etiquetan como del grupo, no son efectivo adicional por cada pestaña. No sumar estos cambios como movimientos financieros nuevos.
- Registros viejos sin snapshots comparables no se reconstruyen. No incluye aun correcciones de grupos cerrados ni todas las rutas de anulacion individuales/digitales.

## Evidencia

- Build y lint backend/frontend correctos.
- 21 pruebas auditoria/regresion financiera aprobadas con PostgreSQL local y rollback.
- Reordenamiento no genera cambios falsos; cambio de monto/anulacion se asocia al miembro correcto; secretos adicionales omitidos.
- Caso real: anular dos pestañas mediante updateGroup registra ambos estados ANULADA y restaura el efectivo anterior.
- Base local inicialmente apagada: primer intento de integracion fallo por conexion rechazada; tras iniciar preview se repitio y aprobo la suite.
- Preview disponible en http://127.0.0.1:3187. Pendiente revision visual por usuario. No se modifico produccion.
