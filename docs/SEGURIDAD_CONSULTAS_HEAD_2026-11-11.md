# Consultas HEAD: límites y captura auxiliar (2026-11-11)

Estado: implementado en desarrollo; no publicado. Sin migración ni cambios financieros.

## Problema y cambio

Express puede atender HEAD mediante un manejador GET, ejecutando el controlador aunque no envíe el cuerpo de respuesta. El límite de consultas pesadas y la captura auxiliar de lecturas sensibles solo contemplaban GET; por ello HEAD podía ejecutar esas consultas sin ambos controles.

ReadWorkloadInterceptor ahora incluye HEAD en las mismas rutas protegidas. GET, HEAD y la exportación filtrada existente comparten los límites actuales: cuatro consultas por usuario y dieciséis por proceso. No se reduce la cantidad de registros ni se añade un límite a las escrituras financieras. Las consultas ligeras y herramientas de turno conservan su tratamiento.

SensitiveReadInterceptor incorpora HEAD en las rutas sensibles existentes y registra el método real. Conserva la agrupación por actor/método/ruta/registro, la captura solo tras éxito y la exclusión de contenido, filtros y credenciales. La auditoría financiera obligatoria no cambia.

## Pruebas dirigidas

13 pruebas aprobadas en read-workload, read-query-security y sensitive-read, sin fallos ni omitidas:

- HTTP real con controladores Nest y servicios simulados: cuatro lecturas mixtas GET/HEAD ocupan el cupo; ambas variantes adicionales reciben 429 con Retry-After; HEAD no envía cuerpo. Tras finalizar las consultas se reutiliza el cupo y las escrituras mantienen su validación normal.
- HEAD rechaza acceso anónimo, sesión revocada, cambio obligatorio de contraseña, perfil no autorizado y consulta inválida antes de SQL.
- Límite global compartido entre identidades, sin invocar la consulta excedente; los errores HEAD liberan los cupos.
- Captura auxiliar HEAD con método y registro correctos, agrupación, separación respecto de GET y ausencia de datos privados; lecturas fallidas no se registran como éxitos.

No cambia SQL ni el alcance por sucursal/turno/registro; los mocks HTTP verifican la frontera y no acreditan por sí solos aislamiento SQL. La regresión general complementa esas pruebas.

## Límites

Los límites siguen siendo por proceso, no distribuidos. La captura auxiliar sigue siendo best effort y sus contadores se reinician con la API; no sustituye auditoría financiera, retención centralizada ni alertas. HEAD aún ejecuta las lecturas admitidas, bajo los controles indicados: este bloque no implementa una respuesta de metadatos sin SQL ni demuestra capacidad bajo carga. No se afirma explotación previa ni se realizaron pruebas en producción.

## Regresión final

399 pruebas backend, 37 frontend y seis suites de navegador aprobadas sin fallos ni omisiones: paginación, filtros de moneda, revisión, liquidación de pendientes, vuelto/cambio y versión de edición. Las 13 pruebas dirigidas forman parte del total backend. Compilación y lint correctos. Logs locales privados: tmp/security-head-directed.log y tmp/transaction-table-*.log.

Desarrollo reiniciado con datos conservados y correo deshabilitado. API/web locales HTTP 200 y HEAD anónimo a Transacciones HTTP 401 comprobados. Producción sin cambios.
