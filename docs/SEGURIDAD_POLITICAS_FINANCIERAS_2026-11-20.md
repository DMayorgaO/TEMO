# Políticas explícitas de rutas financieras — 2026-11-20

Estado: desarrollo, sin publicación ni migraciones nuevas.

## Cambio

Transacciones, Transferencias y Compras de dólares ahora enumeran las operaciones HTTP autorizadas. Antes aplicaban un permiso general por controlador: una ruta nueva habría heredado ese permiso. Ahora se rechaza hasta incorporarla expresamente a la política y verificarla.

Se conservan las 16 operaciones de Transacciones, seis de Transferencias y una de Compras de dólares. Administrador/Cajero mantienen Transacciones y Compras de dólares; Transferista conserva Transferencias. Sólo list/table de Transacciones admiten sus consultas con validación estricta existente. Continúan la versión de sesión obligatoria y el rechazo durante cambio obligatorio de contraseña.

El cambio se limita a la frontera HTTP. No modifica SQL, tasas, importes, asignación por sucursal/turno/registro, recibos, versiones, ni auditoría transaccional. El registro explícito no sustituye esos controles. Es prevención frente a futuras rutas sin revisión, no evidencia de explotación de una ruta actual.

## Comprobaciones

- Matriz HTTP existente: 23 rutas y 337 casos de rol/contrato, más consultas permitidas y atribución al usuario autenticado; aprobada.
- Nuevas rutas simuladas usando las guardas reales de los tres controladores: GET, HEAD y POST con Administrador, Cajero y Transferista (27 rechazos 403, cero ejecuciones del manejador).
- Rechazo de módulos desconocidos, claves heredadas y nombres de operaciones de otro módulo.
- Compilación y lint correctos. Cuatro pruebas de política HTTP más 67 pruebas de regresión dirigida aprobadas, sin fallos ni omitidas.
- Regresión dirigida: financiera, transferencias (versiones/recibos/atomicidad y concurrencia real), acceso por identificador, consultas, exportaciones y cupos. Las suites financiera y de cambios de transferencias se ejecutaron con TEMO_TEST_RESTRICTED_ROLE=1; no se atribuye ese alcance a las demás pruebas.
- Desarrollo reiniciado conservando datos y correo deshabilitado: health y web 200; consulta anónima de Transacciones 401.
- Sin cambios de interfaz: no se repitieron las suites de navegador del bloque anterior. Las pruebas nuevas ejecutan HTTP real de Nest con servicios sintéticos; las suites SQL locales complementan alcance y efectos financieros.

Se mantienen pendientes los controles de infraestructura, CA desde Render, centralización/retención/alertas de auditoría y el resto de la matriz granular del checklist. Este bloque no declara cerrado el checklist general.
