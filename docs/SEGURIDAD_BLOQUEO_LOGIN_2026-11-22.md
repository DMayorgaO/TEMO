# Bloqueo de inicio de sesión tras espera por usuario

Estado: desarrollo, 2026-11-22. Sin publicación ni migraciones.

## Hallazgo y corrección

La consulta de identidad calculaba si existía bloqueo antes de terminar su espera por la fila del usuario. Además, la penalización usaba la hora de inicio de la transacción. Con dos conexiones se reprodujeron tres fallos: quinto intento con bloqueo acortado, contraseña correcta rechazada después de vencer el bloqueo y primer fallo posterior al vencimiento tratado como todavía bloqueado.

Ahora se consulta nuevamente el bloqueo después de obtener la fila, con clock_timestamp(). Un resultado ausente no autoriza comprobar la contraseña. La decisión y la actualización del contador conservan el bloqueo del usuario hasta confirmar la transacción. Las decisiones temporales de login y finalización usan la hora actual.

Se mantienen cinco intentos fallidos y quince minutos de penalización. Una cuenta todavía bloqueada no ejecuta crypt ni prolonga el bloqueo por nuevos intentos. Al vencer, una contraseña incorrecta comienza el contador en uno; una correcta permite el acceso y reinicia contadores. Se conservan la comprobación de identidad/versión/rol al finalizar, MFA para Administrador y auditoría obligatoria.

## Pruebas

Nueva suite backend/tests/login-lockout-time.test.cjs: cinco pruebas (grupo y cuatro escenarios), con dos conexiones SQL reales y verificación de espera mediante pg_blocking_pids. Solo usuarios sintéticos, eliminados al finalizar.

- Quinto fallo después de la espera: 401, contador cinco, penalización completa desde la decisión.
- Bloqueo vencido durante la espera y contraseña correcta: sesión válida, contadores reiniciados.
- Bloqueo vencido y contraseña incorrecta: 401, contador uno y sin nueva penalización prematura.
- Bloqueo todavía vigente: 429, no se ejecuta crypt, contador y fecha límite intactos.
- Cada escenario verifica un único registro de intento; los rechazados no producen auditoría de ingreso exitoso.

La ejecución dirigida con login-concurrency y password-policy aprobó 18 pruebas, incluidas concurrencia, revocación antes de completar el acceso, rollback por fallos de auditoría/registro de intentos y contraseñas existentes compatibles. No se usaron credenciales ni sesiones reales, correo externo o producción.

## Regresión general

Compilación y lint aprobados. Regresión completa: 473 pruebas backend y 37 frontend aprobadas, sin fallos ni omitidas. Las cinco nuevas están incluidas en el total backend. No hubo cambios de interfaz ni nuevos recorridos de navegador. Vite conserva el aviso del bundle superior a 500 kB.

Desarrollo reiniciado conservando la base local y con correo deshabilitado. Web y health/API respondieron 200; consulta anónima de Transacciones rechazada con 401.

## Límites

No cambia la política de bloqueo ni resuelve ataques distribuidos o denegación de servicio por intentos contra una cuenta. No verifica reloj o infraestructura de Render. No altera transacciones financieras ni cierra el checklist general de seguridad.
