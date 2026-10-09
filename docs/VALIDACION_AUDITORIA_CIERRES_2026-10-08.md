# Auditoria de correcciones historicas

Entorno: desarrollo, 2026-10-08. No desplegado.

## Implementacion

- saveHistoricalCorrection sigue restringido al Administrador y a turno cerrado.
- Guarda auditTransaction en antes/despues del evento CORREGIR. Primera correccion toma monto, moneda, banco, movimiento, tasas y efectivo del registro original; siguientes toman los datos de la correccion vigente.
- Anulacion conserva los datos comparables y cambia estado a ANULADA. Se declara preservacion del cierre, no un nuevo movimiento de efectivo.
- Visor reutiliza campos permitidos y comparacion de denominaciones, sin devolver JSON completos. Entidad legible y codigo TRA resuelto en listado.
- No modifica datos originales, calculos bancarios, arqueos ni cierres; solo mantiene el registro de correccion existente y su auditoria dentro de la misma transaccion.
- Eventos historicos previos sin auditTransaction siguen sin detalle comparable; no se reconstruyen retroactivamente. No equivale a cobertura total de accesos, exportaciones o denegaciones.

## Verificacion

- Build y lint frontend/backend correctos.
- Suite backend completa: 46/46, con PostgreSQL local, fixtures revertidos.
- Caso integrado: grupo de dos transacciones, turno marcado cerrado dentro del fixture; cajero rechazado; Administrador edita100 a120 y anula segunda pestaña. Auditoria muestra ambos cambios.
- Segunda edicion de120 a130 conserva120 como anterior. Comparacion de arqueos y movimientos bancarios almacenados verifica que no cambiaron.
- Pendiente revision visual del formulario en desarrollo. No se probaron operaciones sobre produccion.
