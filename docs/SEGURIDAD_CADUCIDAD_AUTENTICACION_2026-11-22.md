# Caducidad de autenticación después de esperas SQL

Estado: desarrollo, 2026-11-22. Sin publicación ni migraciones.

## Hallazgo

PostgreSQL fija `now()` al comienzo de la transacción. Una confirmación de recuperación que esperaba el bloqueo de administración de identidad podía consultar una hora antigua y aceptar un código ya vencido. Un código incorrecto vencido durante la espera también incrementaba sus intentos en vez de rechazarse directamente por caducidad. La emisión de recuperaciones y desafíos MFA descontaba de su vigencia el tiempo pasado esperando ese bloqueo.

Se reprodujeron cuatro fallos con dos conexiones reales: código correcto vencido aceptado, intento modificado para código incorrecto vencido, fecha de emisión antigua en recuperación y fecha de emisión antigua en MFA. El rechazo de desafíos MFA vencidos ya funcionaba al comprobar Date.now(); se conserva y se cubre como regresión.

## Corrección

- Recuperación verifica la caducidad con `clock_timestamp()` después de obtener los bloqueos existentes.
- Fechas de emisión y vencimiento explícitas al insertar recuperaciones y desafíos MFA: 10 y 5 minutos respectivamente desde la inserción efectiva.
- Ventanas de solicitudes/intentos, bloqueos temporales MFA y marcas de consumo usan la hora actual en lugar de la hora inicial de la transacción.
- Se conservan cantidades máximas de intentos, duraciones, mensajes genéricos, bloqueo de identidad, revocación por versión/correo, HMAC y auditoría transaccional.

## Validación dirigida

`backend/tests/auth-expiration-boundary.test.cjs`: seis pruebas aprobadas (grupo y cinco escenarios), con dos conexiones reales. La prueba comprueba la espera mediante `pg_blocking_pids`, mantiene el bloqueo hasta después del vencimiento y luego lo libera.

- Recuperación con código correcto o incorrecto vencido: rechazo 400, sin consumo, sin incrementar intentos, sin cambiar contraseña/versión ni auditoría de éxito.
- Desafío MFA vencido: rechazo 401 y estado intacto.
- Recuperación emitida tras espera: fecha efectiva y vigencia completas; el código nuevo permite recuperar la contraseña.
- MFA emitido tras espera: fecha efectiva y vigencia completas; devuelve el desafío y QR de alta correspondientes.

Solo se usan usuarios sintéticos confirmados para ser visibles entre conexiones y eliminados al terminar. Envíos interceptados en el servicio; no se contacta al proveedor de correo ni se utilizan sesiones reales. Esta suite concurrente no se presenta como ejecutada bajo rol SQL restringido.

## Regresión general

Compilación y lint aprobados. 468 pruebas backend y 37 frontend aprobadas, sin fallos ni omitidas. Las seis pruebas nuevas están incluidas en el total backend. Se mantienen las pruebas de revocación, códigos nuevos de un uso, límites de intentos, auditoría y MFA. No hubo cambios de interfaz ni nuevos recorridos de navegador. Vite conserva el aviso de bundle superior a 500 kB.

Desarrollo reiniciado conservando la base existente y con correo deshabilitado. Web y health/API comprobados con 200; consulta anónima de Transacciones rechazada con 401.

## Límites

La vigencia se comprueba al autorizar la operación tras los bloqueos; no es un plazo máximo para completar el commit. Los relojes del sistema/API y PostgreSQL deben permanecer sincronizados; este bloque no configura NTP ni verifica infraestructura de Render. No modifica JWT ni las reglas financieras. No cierra el checklist general de seguridad.
