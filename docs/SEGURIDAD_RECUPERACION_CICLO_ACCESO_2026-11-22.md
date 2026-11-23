# Recuperación vinculada al ciclo de acceso

Estado: desarrollo, 2026-11-22. Sin publicación ni migración de base de datos.

## Hallazgo y corrección

Un código de recuperación emitido antes de una revocación de sesiones, cierre de sesión o cambio de contraseña podía seguir siendo aceptado: su HMAC solo incluía usuario y código. La misma debilidad permitía usarlo después de cambios administrativos de correo, estado, rol o nombre de usuario, cuando la cuenta volvía a ser un Administrador activo. Se reprodujo con usuarios sintéticos y los servicios reales, sin enviar correos.

El HMAC ahora incluye un identificador de formato, UUID del usuario, versión de sesión, correo exacto de emisión y código. La confirmación utiliza la identidad vigente bajo los bloqueos transaccionales existentes. Se conserva HMAC-SHA256 y la clave configurada; no se almacena el código en texto ni se añade información de recuperación a respuestas o auditorías.

Modificar el correo desde Usuarios incrementa la versión de sesión, igual que otros cambios de acceso. Esto invalida sesiones y desafíos MFA anteriores, además del código de recuperación. Restablecer el correo original no reduce la versión y no reactiva códigos viejos. Una edición exclusiva de nombres/apellidos conserva la sesión y el código.

No se modifica el requisito de MFA para Administrador, sus secretos ni códigos de respaldo, la política de contraseñas, el límite de intentos, la caducidad o los límites de envío por cuenta. No se cambian reglas financieras, tasas ni permisos de sucursal/turno.

## Comportamiento visible

- Después de revocar sesiones, cerrar sesión o cambiar la contraseña, debe solicitarse un código nuevo si se desea recuperar el acceso.
- Después de cambiar el correo, las sesiones anteriores dejan de ser válidas. El próximo código se entrega al correo vigente; se mantienen los límites de envío existentes.
- Los códigos emitidos con el formato anterior se rechazan. No hay fallback al formato inseguro. Cuando se publique este bloque con autorización, cualquier recuperación en curso deberá solicitar un código nuevo.
- La respuesta pública permanece genérica; no revela si una cuenta existe o por qué su código dejó de ser válido.

## Pruebas

Nueva suite: `backend/tests/recovery-lifecycle.test.cjs`, 17 pruebas aprobadas. Casos:

- Revocación administrativa, logout y cambio de contraseña invalidan el código anterior.
- Cambio de correo y cambio/restauración de correo, estado, rol o usuario no reactivan códigos viejos.
- Rechazo de la sesión anterior; recuperación nueva al correo vigente permitida y de un solo uso.
- Cambios de nombre conservan recuperación y versión de sesión.
- Fallo de auditoría revierte correo y versión; el código previo sigue funcionando porque el cambio no se confirmó.
- El correo está ligado al código incluso si se altera directamente sin incrementar versión (caso sintético de defensa adicional).
- Copiar un digest entre cuentas no permite recuperarlas; el propietario original conserva su código.
- Código del formato anterior rechazado sin cambiar contraseña ni versión.
- Dos conexiones reales comprueban con `pg_blocking_pids` que la confirmación espera un cambio administrativo de correo o una revocación y rechaza el código antiguo después del commit; contraseña intacta y sin auditoría de recuperación exitosa.

Los casos de ciclo de vida se ejecutan dentro de una transacción revertida y se repitieron con rol SQL restringido. Los dos casos concurrentes requieren fixtures confirmadas para ser visibles entre conexiones, usan exclusivamente usuarios sintéticos y los eliminan al terminar. No se emplean sesiones de usuarios reales, secretos productivos ni el proveedor de correo; el envío se intercepta en el servicio.

Las suites existentes de identidad, recuperación/correo y límites transaccionales también pasaron en la ejecución dirigida.

## Validación general

Compilación y lint aprobados. Regresión completa: 462 pruebas backend y 37 frontend aprobadas, sin fallos ni omitidas. Las 17 nuevas están incluidas en las 462; no se suman aparte. No hay cambios de interfaz en este bloque y no se añadieron recorridos de navegador. Vite conserva el aviso de tamaño del bundle superior a 500 kB.

Desarrollo reiniciado conservando la base local, con correo deshabilitado. Web y health/API respondieron 200; consulta anónima de Transacciones rechazada con 401.

## Límites

No verifica la entrega real por Resend ni el funcionamiento desde Render. La revocación por cambios administrativos depende de que esos cambios respeten el servicio y su incremento de versión; modificaciones SQL externas que restauren deliberadamente versión/correo no están autorizadas por este flujo. No añade protección frente a phishing ni sustituye MFA. Continúan pendientes la matriz completa de permisos y los controles externos de auditoría, retención y alertas.
