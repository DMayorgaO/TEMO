# Plan de optimizacion TEMO

Fecha: 2026-10-29. Trabajo por etapas en desarrollo; no autoriza cambios productivos.

## Estado y alcance

El titular confirma cambio de Compute Plan de Render tras mostrar Free y posteriormente identifica 0.5c-512mb (0.5 CPU, 512 MB). Blueprint local ajustado para conservar ese plan al sincronizar. Pendiente medir comportamiento despues del cambio; no se inspecciono directamente el dashboard ni se modificaron planes remotos desde el agente. No actualizar el control interno de gastos con importes supuestos.

La mejora de infraestructura elimina una limitacion distinta de las consultas y de la interfaz. No se promete que pagar otro plan resuelva todas las demoras. Evidencia inicial en REVISION_CARGA_2026-10-29.md; tres health publicos son una observacion, no una linea base de operaciones autenticadas.

## Etapa 1: medir sin exponer datos

- Confirmar Compute Plan efectivo, region de Render y region de Supabase; observar CPU, memoria, reinicios y conexiones antes de cambiar recursos.
- Medir login/MFA, primera visita y visitas repetidas a Transacciones, Arqueo y Traspaso: tiempo de red/API, tiempo hasta datos utilizables, cantidad de peticiones y bytes.
- Separar servidor/base/espera de pool de descarga/renderizado. Medir p50/p95 y errores con muestra suficiente, no solo un promedio de tres solicitudes.
- Instrumentacion, si se agrega: metodo y plantilla de ruta (sin IDs), duracion, estado y requestId; contadores agregados de consultas/pool. Nunca cuerpos, query strings, usuarios, cuentas, codigos, claves ni cadenas de conexion.
- Medir usuarios autenticados mediante titulares o fixtures autorizados; no extraer tokens ni suplantar sesiones. Sin pruebas de carga contra produccion.

Salida: tabla de linea base y comparacion con el plan nuevo. No certificar ausencia de suspension unicamente por recibir health=ok.

## Etapa 2: Transacciones, prioridad alta

- Paginacion, busqueda, fechas, moneda, banco, cajero/sucursal, estado y ordenacion en servidor con validacion y SQL parametrizado. Mantener alcance por rol y turno en cada consulta.
- Evitar descargar todo el historial en lotes secuenciales cada cinco segundos. Pagina visible y totales filtrados independientes del detalle financiero.
- Orden estable por fecha/ID; definir comportamiento de nuevas filas durante la paginacion. Evaluar cursor frente a offset mediante medidas, sin perder navegacion habitual.
- Totales y cantidades del conjunto filtrado completo, no solo de la pagina. Mantener transacciones multiples, pendientes, ediciones historicas y monedas sin mezclar importes.
- Exportaciones completas del mismo filtro/seleccion con autorizacion, auditoria y proteccion de formulas; no exportar solo la pagina por accidente ni enviar IDs no autorizados.
- Refresco sin parpadeo ni peticiones solapadas; conservar filtros y seleccion valida. Cancelar/ignorar respuestas antiguas al cambiar de consulta o sesion. Sin reintento automatico de escrituras financieras.

Salida: recorrido con historial grande; navegar una pagina no debe exigir descargar las anteriores. Misma suma/conjunto que una consulta de referencia autorizada.

## Etapa 3: turnos, Arqueo, Traspaso y arranque

- Medir consultas del detalle de turno y ofrecer proyecciones ligeras donde solo se necesita identidad/estado; no enviar arqueos/denominaciones completos a cada sondeo.
- Consolidar lecturas repetidas por turno y eliminar viajes SQL redundantes. Paralelizar solo lecturas realmente independientes tras medir la cola del pool; no aumentar conexiones a ciegas.
- Carga diferida de catalogos administrativos segun pantalla/perfil. Las referencias necesarias para un formulario deben estar completas antes de habilitar el guardado.
- Conservar datos visibles durante refrescos silenciosos con indicador de error/actualizacion; en carga inicial no presentar ceros ni "sin turno" antes de una respuesta valida.
- Nunca cachear permisos ni reutilizar saldos antiguos para autorizar movimientos. Guardado/cierre/traspaso vuelven a comprobar estado, version, identidad y bloqueo en servidor.
- Evaluar division del bundle por pantallas con evidencia de tiempos y tamanos; evitar convertir una peticion grande en muchas dependencias bloqueantes.

Salida: menos consultas/bytes con datos y controles equivalentes; no atribuir una mejora visual a una mejora medida del servidor.

## Etapa 4: SQL e indices

- EXPLAIN (ANALYZE, BUFFERS) solo en copia local aislada para consultas representativas; revisar joins, subconsultas por fila, ordenacion, agrupaciones y volumen de resultados.
- Indices propuestos segun planes reales y filtros habituales, revisando los existentes primero. Evaluar costo de escritura, espacio y tiempo de construccion.
- Migraciones nuevas solo si aportan mejora demostrada, con ensayo de respaldo/restauracion y ventana apropiada. Ningun indice ni SQL productivo automatico en este plan.
- No desactivar auditoria, validacion TLS, aislamiento de turnos, versionado o recibos para obtener velocidad.

## Etapa 5: validar y publicar

- Comparar misma maquina/red/volumen antes y despues, con 1 y 5 usuarios concurrentes simulados, historiales de 20.000 y 100.000 transacciones sinteticas y patrones de grupos/pendientes representativos. Ajustar estos tamanos a la linea base real.
- Revisar carga inicial y sesion caliente, red lenta/interrumpida, cambios rapidos de filtros, cierre de sesion y respuestas fuera de orden. Escritorio 1366x768/1920x1080 al 100% y movil.
- Objetivo inicial sujeto a linea base: p95 hasta tabla utilizable <=2 s en sesion caliente y red de prueba definida; cero perdidas de registros, sumas correctas y cero ampliacion de permisos. No es SLA ni resultado obtenido.
- Pruebas financieras, permisos, auditoria, conflictos, exportaciones, build/lint y regresion de navegador. Vigilar p95, errores y consumo de recursos; no solo mejorar el caso de un usuario.
- Publicacion solo con autorizacion: respaldo/ensayo, migracion 055 pendiente y cualquier SQL adicional aprobado, API/web compatibles y verificaciones posteriores por titulares. Definir rollback compatible con contratos nuevos.

## Ya hecho frente a pendiente

Hecho en desarrollo: cargas independientes de lista/contexto, estado inicial honesto del Arqueo, eliminacion de doble detalle administrativo y resumen/candidatos de traspaso concurrentes. Pruebas con respuestas retenidas aprobadas.

Refuerzo posterior del mismo dia: contrato de paginacion/fechas estricto y presupuesto de consultas pesadas simultaneas (4 por actor, 16 por proceso). Es contencion de carga, no cumplimiento de la etapa de paginacion/filtros/totales; observar 429 y uso legitimo antes de ajustar limites. Ver SEGURIDAD_CONSULTAS_2026-10-29.md.

Pendiente: linea base autenticada despues del cambio de plan y etapas 2-5. El cambio de plan fue realizado por el titular, no es un despliegue de las mejoras locales.
