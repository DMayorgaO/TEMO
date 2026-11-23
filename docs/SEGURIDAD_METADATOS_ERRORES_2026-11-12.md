# Metadatos de errores: privacidad y robustez (2026-11-12)

Estado: implementado en desarrollo; sin publicación, migración ni cambios financieros. Conserva los bloques anteriores y D desde la primera transacción.

## Cambios

- El filtro central deja de copiar códigos HTTP arbitrarios desde excepciones. Solo admite los códigos explícitos de conflicto de edición/bloqueo de turno y rechazo de parser, con su estado HTTP correspondiente; el resto usa el catálogo existente.
- El campo postgresCode del log solo admite una cadena de cinco caracteres con formato SQLSTATE. Códigos de transporte, objetos y cadenas arbitrarias no se registran como información PostgreSQL.
- Un cuerpo HTTP inesperado (nulo, lista, número u objeto de mensaje) no provoca un fallo adicional del filtro. Mensajes de validación válidos conservan su contenido; formas inesperadas o excesivas usan el mensaje del catálogo.
- Los errores del servidor siguen devolviendo mensajes genéricos, con referencia y ruta parametrizada. Se mantiene la captura auxiliar de denegaciones autenticadas.
- El catálogo PostgreSQL consulta únicamente propiedades propias: constructor, toString y __proto__ no se interpretan como entradas del catálogo.

## Pruebas dirigidas

Ocho pruebas aprobadas en error-metadata-security y denied-access-audit, sin fallos ni omitidas. Incluyen:

- Excepciones con códigos, mensajes, detalles y credenciales sintéticas que no aparecen en respuestas/logs internos; referencia correlacionada entre respuesta y log.
- Compatibilidad de errores PostgreSQL conocidos, avisos de edición desactualizada, turno bloqueado y rechazos del parser.
- Rechazo de códigos con estado HTTP incongruente, mensajes malformados o excesivos y claves heredadas del prototipo.
- HTTP real de Nest: respuesta 500 segura, conflicto 409 preservado y cuerpo inválido 400 con ruta parametrizada; no se registran cuerpo, query, autorización ni identificador concreto de la URL.
- Denegaciones y fallos de captura auxiliar mantienen su respuesta y no registran detalles privados de base de datos.

## Límites

El filtro conserva mensajes de validación 4xx válidos producidos por la aplicación; no es un detector semántico de secretos ni sustituye revisar dónde se construyen esos mensajes. La captura auxiliar sigue siendo best effort. No se implementa centralización, retención, alertas ni cambios de infraestructura; esos pendientes continúan abiertos. No se afirma filtración previa ni se probaron rutas productivas.

## Regresión final

Compilación y lint correctos. 408 pruebas backend, 37 frontend y seis suites de navegador aprobadas sin fallos ni omitidas: paginación, filtros de moneda, revisión, liquidación de pendientes, vuelto/cambio y edición con versión. Las ocho pruebas dirigidas están incluidas en el total backend. Logs privados: tmp/security-error-metadata-directed.log y tmp/transaction-table-*.log.

Desarrollo reiniciado con datos conservados y correo deshabilitado. API y web HTTP 200, rechazo anónimo de Transacciones HTTP 401 con código catalogado comprobado. Producción sin cambios.
