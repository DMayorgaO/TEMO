# Alcance financiero y día local de pendientes

Estado: implementado en desarrollo el 2026-11-21. Sin publicación ni migraciones.

## Corrección

Las consultas compartidas de pendientes, el detalle de su transacción, la liquidación individual y la compensación dentro de un grupo comparaban fechas de apertura mediante `timestamptz::date`. El resultado dependía de la zona horaria de la conexión PostgreSQL. Ahora se compara explícitamente el día de `America/Managua`; las fechas que pasan de SQL a JavaScript se devuelven como texto YYYY-MM-DD.

Reproducción previa: con PostgreSQL en UTC, 2026-11-21 00:30Z y 15:00Z parecían el mismo día, aunque en Nicaragua son días distintos. También se rechazaba el acceso entre 2026-11-20 23:30Z y 2026-11-21 01:30Z, que sí pertenecen al mismo día local. Ambos escenarios fallaron antes de corregir el servicio.

Se conservan los permisos propios del administrador, los turnos propios consultables, el aislamiento de sucursales y los bloqueos existentes de escritura. No se modifican tasas, conversiones, importes, preferencias D, recibos ni cálculos de compras de dólares. La liquidación múltiple ya usaba America/Managua y se incluyó como regresión; conserva su criterio de fecha de creación del pendiente.

## Matriz con HTTP y SQL reales

`backend/tests/financial-http-scope.test.cjs` levanta una aplicación Nest efímera en loopback, con controladores, guardas y servicios reales. La autenticación traduce tokens de prueba a usuarios sintéticos; no utiliza ni suplanta sesiones de usuarios reales.

- Administrador, tres cajeros (dos sucursales) y Transferista.
- Turno origen abierto, pendiente de aprobación, en revisión y cerrado.
- Consulta de turnos, transferencias, transacciones y detalle/historial de pendientes compartidos.
- Tabla paginada: total del conjunto filtrado y exportación completa aun con límite de una fila.
- Exportación mezclando registros propios y ajenos: rechazo sin auditoría de éxito; administrador autorizado.
- Permisos de pendientes del mismo día y de otro día, con conexiones UTC, America/Managua y Asia/Tokyo.
- Liquidación individual, múltiple y compensación en grupo: mismo día permitido, otro día rechazado; se comprueba el saldo final y la ausencia de cambios de saldo/estado y auditoría de éxito al rechazar.

Resultado dirigido: 12 pruebas aprobadas, 250 solicitudes HTTP, ninguna omitida. Repetido con TEMO_TEST_RESTRICTED_ROLE=1. Los registros de prueba están dentro de una transacción revertida; cada escenario y pago usa savepoints. No se escribieron movimientos de producción.

## Validación general

Compilación y lint aprobados. Regresión completa del backend: 445 pruebas aprobadas, sin fallos ni omitidas (incluye las 12 de esta matriz; las 250 solicitudes no se suman como pruebas adicionales). Frontend: 37 pruebas aprobadas. Suite de navegador pending-payment-security aprobada para liquidación individual, efectivo, digital, mixto y compensación en transacciones, con APIs sintéticas interceptadas y comprobación de doble clic/reintento tras respuesta incierta. Vite conserva el aviso de tamaño de bundle superior a 500 kB.

Desarrollo reiniciado con la base existente conservada y correo deshabilitado. Web y health/API respondieron 200; consulta anónima de pendientes rechazada con 401.

## Límites

Esta matriz amplía la cobertura de las rutas financieras indicadas, no certifica todas las combinaciones de permisos de todos los módulos. No prueba el proveedor de autenticación real ni la infraestructura productiva. No altera el criterio histórico que distingue el día de apertura de turno del día de creación de un pendiente en la liquidación múltiple. Siguen pendientes los controles externos de auditoría, retención, alertas y verificación de CA desde Render.
