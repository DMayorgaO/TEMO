# Catálogos, auditoría y claves temporales — desarrollo, 2026-11-11

Bloque local posterior a Directorio, rutas financieras y Turnos. Conserva todos esos cambios. No se consultó ni modificó producción; no agrega migraciones. La 056 de Directorio continúa siendo únicamente local.

## Cambios

`CatalogsRouteGuard` declara la política de los 19 manejadores de Catálogos. Corre después de AuthGuard y comprueba rol, versión exacta de sesión y cambio obligatorio de contraseña antes del controlador. Una ruta nueva sin política explícita queda rechazada. Los controles transaccionales de identidad, auditoría, último Administrador, roles protegidos y alcance SQL se conservan.

| Operación | Roles |
| --- | --- |
| Usuarios, roles, reglas de comisión, auditoría/detalle/diagnóstico | Administrador |
| Crear/editar catálogos, revocar sesiones, restablecer clave temporal y exportar catálogos | Administrador |
| Entidades y sus alias operativos, monedas y alias, cuentas, sucursales y movimientos | Administrador, Cajero y Transferista, con los campos y alcance SQL existentes |
| Registrar solicitud de exportación operativa | Administrador y Cajero; el controlador conserva la restricción por apartado/formato |

Las rutas no admiten parámetros de consulta adicionales. La revocación de sesiones no admite campos de cuerpo adicionales. No se interpretan IDs, rol o sucursal enviados como autoridad. No se convierte al Cajero en lector global de cuentas/sucursales; los filtros y la ocultación de números de cuenta existentes se mantienen.

El restablecimiento de contraseña deja de usar `String(body.temporaryPassword)`. Requiere un objeto estricto con un único campo de texto `temporaryPassword`, aplica la política existente de longitud/composición y máximo de 72 bytes antes del servicio y conserva la clave exacta, sin recortar espacios ni coerción. Listas, objetos, campos adicionales y entradas inválidas se rechazan sin cambiar contraseña, versión de sesión, indicador de cambio obligatorio ni auditoría. Los errores no devuelven el valor enviado. El servicio sigue revalidando al Administrador en la transacción y limitando el restablecimiento a cajeros activos.

## Verificación

- Nueva matriz HTTP: 19 rutas y 251 casos de roles, consultas y UUID; comprobaciones adicionales de claves temporales, exportaciones, actor autenticado y rechazo de rutas sin política. Nest/AuthGuard/controladores/guard/pipes reales con servicios e identidad simulados; las dos pruebas de esta matriz no se cuentan como 251 pruebas adicionales.
- Prueba SQL de identidad: entradas inválidas al controlador preservan contraseña/sesión/auditoría; restablecimiento válido atraviesa el controlador y servicio reales. Conserva las comprobaciones de revocación, cambio obligatorio de contraseña, protección de Administrador y auditoría sin secretos.
- La sesión simulada de la prueba histórica de diagnóstico de auditoría ahora incluye versión válida; todas sus comprobaciones de autorización se conservan.
- Ensayo dirigido de 47 pruebas aprobado. Ejecución adicional de 43 pruebas de identidad, sesión administrativa y auditoría de catálogos aprobada con `TEMO_TEST_RESTRICTED_ROLE=1`: los casos SQL que soportan ese modo usan un rol sin superusuario/DDL/bypass RLS y sin UPDATE/DELETE de bitácora. Los casos unitarios y de concurrencia con preparación propia conservan su mecanismo de aislamiento. Fixtures locales y rollback/limpieza; ningún usuario productivo utilizado.

Regresión final: build/lint correctos; 377 pruebas backend y 37 frontend aprobadas, sin fallos ni omisiones. Siete suites de navegador aprobadas: estado de captura de auditoría, tabla de transacciones, filtros de monedas, operaciones en revisión, pagos pendientes, edición/anulación y versión de edición. APIs de navegador interceptadas; sin escrituras productivas. API y web locales responden 200; desarrollo iniciado conservando datos y con correo deshabilitado. Sin commit ni push.

No se declara terminada la matriz de todas las rutas ni el checklist general: autenticación, controles externos de infraestructura, centralización/retención/alertas de auditoría y prueba negativa de CA desde Render siguen requiriendo sus propios bloques/evidencias.
