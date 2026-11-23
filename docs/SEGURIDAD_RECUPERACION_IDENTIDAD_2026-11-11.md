# Recuperación de contraseña: identidad y concurrencia (2026-11-11)

Estado: implementado en desarrollo; no publicado y sin migración nueva. Se conserva el trabajo local anterior.

## Cambios

La solicitud pública obtiene inicialmente el destinatario sin revelar si existe. Antes de guardar un código ahora vuelve a comprobar, dentro de la transacción, usuario activo, rol JEFA activo, versión de sesión, correo exacto e identificador coincidente. Si esa información cambió desde la lectura inicial, responde de forma genérica sin crear el código ni enviar correo.

Solicitud y confirmación utilizan el orden de administración de identidad: advisory 741260810 y bloqueo del usuario/rol antes de operar sobre los códigos. La solicitud conserva además su bloqueo por cuenta y los límites persistentes. La confirmación bloquea la identidad autorizada y su rol hasta finalizar; una desactivación concurrente que termina antes de esa autorización impide cambiar la contraseña.

Se conservan los códigos de seis dígitos, vencimiento, intentos, invalidación del código anterior, consumo único, cambio de versión de sesión y requisito posterior de MFA. No cambian las reglas financieras ni los permisos de cajeros.

## Verificación dirigida

34 pruebas aprobadas en recovery-identity-boundary, recovery-email e identity-security, sin fallos ni omitidas:

- Cambios entre lectura y escritura: versión revocada, usuario inactivo, rol distinto, correo cambiado y rol inactivo; sin correo, código ni auditoría nuevos.
- Fallo de auditoría al confirmar: contraseña, versión, código y auditoría quedan iguales; el reintento válido funciona y la repetición se rechaza.
- Dos conexiones locales: confirmación espera un bloqueo real de desactivación y luego rechaza sin consumir el código, incrementar la versión ni crear auditoría.
- Pruebas existentes de límites compartidos entre instancias, correo simulado, fallo del proveedor, respuestas genéricas, código más reciente, intentos persistentes, uso único y MFA conservado.

Los nuevos casos transaccionales y los de identidad compatibles se repitieron con rol SQL restringido. La prueba concurrente y las pruebas anteriores de correo usan la conexión local de pruebas: no se afirma que las 34 pruebas corrieran bajo rol restringido. Se usan datos sintéticos y correo interceptado; no se enviaron correos reales. Los casos nuevos revierten datos o eliminan exclusivamente sus registros sintéticos.

## Límites

El envío de correo ocurre después del commit y no es atómico con PostgreSQL; un cambio de cuenta posterior al commit puede coincidir con un envío ya iniciado. No se afirma entrega garantizada ni se cambia el procedimiento de recuperación. La respuesta genérica no acredita resistencia absoluta a inferencias por tiempos. El bloqueo compartido con administración requiere medición de carga para evaluar capacidad. Continúan pendientes infraestructura, retención/alertas y cierre de la matriz general.

## Regresión final

Compilación y lint correctos. 397 pruebas backend, 37 frontend y seis suites de navegador aprobadas sin fallos ni omisiones: paginación, filtros de moneda, revisión, liquidación de pendientes, vuelto/cambio y edición con versión. Las 34 pruebas dirigidas están incluidas en el total backend, no se suman nuevamente. Evidencia local privada: tmp/security-recovery-directed.log y tmp/transaction-table-*.log.

Entorno local reiniciado: API y web HTTP 200, datos existentes conservados y correo deshabilitado. Sin cambios productivos.
