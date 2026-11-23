# Exportaciones: presupuesto compartido y ciclo de ejecución (2026-11-12)

Estado: implementado en desarrollo. Sin publicación ni migración. Conserva los cambios locales anteriores.

## Cambios

La ruta POST /api/transactions/export-filtered se incorpora al control específico de exportaciones. Antes tenía el control de consultas pesadas, pero no compartía el límite de las demás exportaciones. Ahora todas las rutas enumeradas comparten por usuario los límites existentes de dos exportaciones simultáneas y treinta ejecuciones por minuto. La exportación filtrada conserva además el límite de consultas pesadas.

La reserva del cupo se realiza al suscribirse/iniciar la ejecución, no al construir el observable. Cada suscripción reserva y libera su propio cupo. Así una operación no iniciada no ocupa capacidad y las suscripciones repetidas no producen contadores negativos. Finalización, error síncrono/asíncrono y cancelación liberan el cupo correspondiente. Se conserva la expiración y el máximo existente de mil identidades en memoria.

No cambia el contenido exportado, el máximo existente de registros por archivo, los filtros, permisos ni auditoría obligatoria. No se añade cuota a transacciones financieras ni se trunca una exportación para acelerar su respuesta.

## Evidencia dirigida

11 pruebas aprobadas en export-security y export-limit-http, sin fallos ni omitidas:

- Presupuesto compartido entre exportación filtrada, selección, turnos, gráfica, catálogos y registro de exportación; rechazo sin ejecutar el manejador.
- Aislamiento de usuarios y escrituras financieras sin afectación del límite de exportación.
- Reserva solo al ejecutar, suscripciones repetidas, liberación ante cancelación/errores y recuperación al expirar la ventana.
- HTTP real de Nest con ambos interceptores y controladores sintéticos: dos exportaciones mixtas ocupan el cupo, la siguiente recibe 429, otro usuario sigue exportando, la escritura recibe su respuesta normal y el contenido permitido se conserva completo.
- Prueba SQL existente: exportaciones con alcance, rechazo de IDs ajenos y ausencia de secretos en la salida; consulta local revertida al finalizar. No usa rol SQL restringido.

La primera ejecución dirigida no pudo conectar a PostgreSQL local porque estaba detenido; se inició con el lanzador conservando datos y la repetición aprobó las once pruebas. Correo deshabilitado y ninguna prueba en producción.

## Límites

El control sigue siendo por proceso y no distribuido. La liberación de una suscripción no implica por sí sola cancelación de SQL ya enviado; no se afirma capacidad ni protección absoluta bajo carga. Los servicios sintéticos HTTP prueban la frontera de concurrencia, no sustituyen las pruebas SQL de permisos. Continúan pendientes retención/alertas, infraestructura y el cierre de la matriz general de seguridad.

## Regresión final

Compilación/lint correctos. 402 pruebas backend, 37 frontend y seis suites de navegador aprobadas sin fallos ni omitidas: paginación, filtros de moneda, revisión, liquidación de pendientes, vuelto/cambio y edición con versión. Las once pruebas dirigidas forman parte del total backend. Evidencia privada local: tmp/security-export-directed.log y tmp/transaction-table-*.log.

Disponibilidad local comprobada después de la regresión: API y web HTTP 200. Datos conservados, correo deshabilitado y producción sin cambios.
