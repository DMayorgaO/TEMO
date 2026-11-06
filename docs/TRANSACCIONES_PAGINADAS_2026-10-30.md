# Transacciones: paginacion y medicion local (2026-10-30)

Estado: cambios locales en develop, sin commit, push, migracion ni despliegue productivo. Se preservaron las modificaciones documentales anteriores. Desarrollo reiniciado con el lanzador habitual, conservando su base y con correo deshabilitado.

## Cambio funcional

- La tabla usa `GET /transactions/table`: una pagina por consulta, sin descargar las paginas anteriores. Filtros de busqueda, columnas, moneda, estado, fechas y horas; ordenacion y desempate por grupo/UUID en SQL parametrizado.
- Se conserva el alcance anterior: JEFA puede consultar el historial; CAJERO solo sus movimientos de turnos ABIERTO, PENDIENTE_APROBACION o EN_REVISION. Los filtros no amplian ese alcance.
- Correcciones historicas y anulaciones se aplican antes de filtrar, ordenar, contar y sumar. Una sola sentencia SQL proporciona pagina, cantidad y totales del conjunto filtrado bajo la misma instantanea. Los importes se transmiten como texto decimal. Los totales monetarios excluyen anuladas y separan moneda/entrada/salida; la tabla conserva su contador de registros.
- La consulta ligera omite las liquidaciones completas por grupo. Los detalles, arqueos, escrituras, validacion de version y recibos financieros conservan sus rutas y controles existentes.
- `POST /transactions/export-filtered` exporta todo el filtro, con el orden solicitado, revalidacion de identidad y auditoria obligatoria. Mantiene el limite previo de 5000 filas: si se supera, rechaza el archivo completo y pide ajustar el filtro; nunca exporta solo la pagina ni corta silenciosamente.
- Lecturas y exportacion filtrada comparten el presupuesto concurrente existente (4 por usuario / 16 por proceso). La lectura paginada conserva la auditoria auxiliar de acceso.
- La interfaz espera 180 ms al cambiar filtros, cancela lecturas sustituidas e ignora respuestas de consultas o sesiones anteriores. Los sondeos no se superponen. Tras guardar se solicita una lectura nueva. Los fallos conservan datos previos con aviso; la carga inicial no muestra un conteo cero como resultado confirmado.
- Navegacion directa y anterior/siguiente del detalle entre paginas. Se conserva el marcador visual por ID durante la visita. Fechas y horas del servidor usan America/Managua. Montos y fechas se ordenan por valor, no por su representacion textual.

La paginacion es por offset sobre el estado vigente, con desempate estable; no congela el historial durante toda la visita. Inserciones/anulaciones concurrentes pueden mover filas entre paginas. La exportacion si consulta el filtro completo en una sola instantanea. La busqueda general cubre datos de la transaccion, no los valores internos predeterminados de un formulario vacio.

## Medidas y limites de la evidencia

La base preview existente tenia 24 transacciones. La primera carga anterior tuvo 2 consultas SQL, 40,4 ms de tiempo total local y 23.141 bytes JSON. Esa muestra NO reproduce por si sola la demora productiva reportada.

Se crearon clones temporales con indices de las tablas/vistas necesarias, dentro de una transaccion descartada. Los registros sinteticos tienen un movimiento por grupo y no tienen liquidaciones vinculadas. No se alteraron tablas persistentes, secuencias ni migraciones. PostgreSQL local 18; no es el runtime, red, CPU ni PostgreSQL 17 de produccion.

| Escenario | Mecanismo anterior | Consulta nueva, pagina de 10 y totales |
| --- | --- | --- |
| 20.000 filas | 101 lotes; 19.084.568 bytes JSON; 91.462 ms SQL principal acumulado | 1 consulta; ~5,8 KB; p50 223 ms / p95 231 ms |
| 100.000 filas | Solo primeras 5 paginas medidas: 954.675 bytes y 21.771 ms. El recorrido completo requiere 501 lotes, pero NO se midio su duracion completa. | 1 consulta; ~5,8 KB; p50 1.223 ms / p95 1.300 ms |

Percentiles de 10 repeticiones locales calientes; p95 corresponde al maximo de esa muestra pequena. Los bytes son JSON sin compresion, no trafico TLS. La linea base grande mide la consulta principal antigua, sin anadir su consulta posterior de correcciones, autenticacion, auditoria, red ni renderizado; por tanto no debe presentarse como tiempo HTTP total.

EXPLAIN ANALYZE BUFFERS nuevo: 20.000 filas, ejecucion 244 ms y cero bloques temporales escritos; 100.000 filas, ejecucion 1.450 ms y 2161 bloques temporales escritos. No se propuso indice ni se modifico work_mem/pool: falta evidencia representativa para ello. El agregado completo todavia recorre el conjunto filtrado; la paginacion evita transmitirlo y repetirlo en cientos de peticiones.

Navegador con API interceptada y 100.000 filas sinteticas: una peticion inicial, 4.273 bytes de fixture y ~755/471 ms hasta filas visibles en 1366x768/1920x1080. Es una prueba de interfaz y contrato, NO de API/SQL/red productivos. Se comprobo salto a ultima pagina sin cargar las intermedias, filtro rapido, respuesta anterior retenida, ausencia de sondeos duplicados y Excel con filas fuera de la pagina visible.

Reproduccion: `scripts/benchmark-transaction-table.cjs` usa exclusivamente 127.0.0.1:55433/temo_preview, tablas temporales e informacion agregada. Tras observar el coste del recorrido antiguo completo de 20.000, el script se dejo con una muestra maxima de cinco paginas antiguas en cada tamano. El nuevo reporte JSON queda en tmp; no se publica. Para regenerar el ensayo de 100.000, pasar `100000` como argumento despues del script.

## Verificacion

- Compilacion backend/frontend y lint aprobados. Vite mantiene aviso de bundle mayor a 500 KB; la division del bundle sigue pendiente.
- Corrida general: 321 pruebas backend y 34 frontend aprobadas, cero omitidas/fallos.
- Cuatro casos nuevos adicionales aprobados posteriormente: fixtures temporales de aislamiento/correcciones; presupuesto compartido de tabla/exportacion; captura auxiliar sin contenido de filtros; lector bajo rol SQL restringido. Total de casos backend verificados: 325, contando la corrida general y esos casos adicionales, sin contar dos veces las repeticiones.
- Seis recorridos de navegador aprobados: paginacion nueva (ambas resoluciones), monedas, turnos en revision, pagos pendientes, cambios de transacciones y versionado de ediciones. Todas las API de estos recorridos son sinteticas e interceptadas.
- Exportacion filtrada probada para conjunto completo, auditoria obligatoria, identidad revocada, limite de 5000 y rechazo de perfiles no autorizados.
- Equivalencia de filas/totales respecto a la consulta anterior en preview; fixtures temporales verifican turnos cerrados/abiertos/revision/pendientes, cajero ajeno, fechas/horas de Managua, correccion de moneda/monto y anulacion historica.

Verificacion final del entorno reiniciado: health de API (4187) y proxy web (3188) respondieron 200; GET /api/transactions/table sin sesion respondio 401. Contrato HTTP estricto revalidado; compilacion/lint final aprobados.

## Pendiente antes de considerar publicacion

- Medicion autenticada representativa de API, espera del pool, red y renderizado conjunto; una muestra SQL local no demuestra p95 productivo ni resuelve toda la capacidad.
- Escenarios de 1/5 usuarios concurrentes, mezclas reales de grupos/pendientes y distribucion de fechas; matriz completa de permisos general.
- Considerar cursor/instantanea de navegacion si los desplazamientos entre paginas bajo nuevas operaciones resultan problematicos; evaluar planes SQL bajo los filtros mas frecuentes.
- Confirmacion funcional del titular en desarrollo con su sesion habitual. Publicacion solo mediante nueva autorizacion; no se hizo push ni se modifico Render/Supabase/Cloudflare.
