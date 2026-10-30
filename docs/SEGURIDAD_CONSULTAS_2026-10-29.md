# Consultas operativas y contencion de carga

Estado: solo desarrollo, sin migracion SQL ni despliegue. Fecha: 2026-10-29.

## Contratos de consulta

- GET /transactions admite solamente limit y offset. Valores decimales enteros sin coercion parcial: limit de 1 a 200 y offset de 0 a 2147483647. Omision conserva 50/0. Valores repetidos, arrays, objetos, notacion exponencial, sufijos y campos ajenos devuelven 400 antes de SQL.
- Cambio deliberado respecto al contrato anterior: limites invalidos ya no se corrigen silenciosamente mediante parseInt/clamp. La web soportada envia enteros canonicos. No se altera la cantidad total de registros disponibles ni la exportacion autorizada de hasta 5000 IDs.
- Panel General y su exportacion PNG comparten el mismo validador de fechas. Fechas reales YYYY-MM-DD, sin ano cero; ambos extremos o ninguno, orden correcto y el maximo existente de 367 dias inclusivos. Se admite dia de tabla independiente del rango, como usa actualmente la interfaz.
- GET del Panel rechaza parametros repetidos/ajenos, sin convertir arrays a fechas. Mensajes constantes, sin devolver el valor recibido. SQL sigue parametrizado y no se aceptan identidades/alcances enviados por query.

## Perfiles de lectura

- Lista, detalle individual, detalle de grupo, pendientes y pagos de un pendiente requieren explicitamente JEFA o CAJERO en la frontera del controlador. TRANSFERISTA y perfiles no soportados no pasan a SQL/servicios, tampoco un usuario con cambio obligatorio de contrasena.
- El Administrador conserva su alcance; el Cajero conserva las restricciones por propietario/turno de los servicios. Este bloque no convierte parametros de consulta en autorizacion ni sustituye el guard de autenticacion vigente.
- No es una matriz completa de permisos granulares ni de todos los modulos. Servicios internos confiables siguen conservando sus reglas existentes; la politica nueva protege las cinco entradas HTTP de lectura de Transacciones.

## Consultas pesadas simultaneas

- Interceptor global exclusivo para GET /transactions, GET /shifts/dashboard y GET /dollar-purchases.
- Hasta 4 en curso por usuario y 16 en total por proceso de API. Es concurrencia, no cupo por minuto/dia ni limite de registros financieros. No usa la IP compartida de la sucursal para agrupar usuarios.
- Si no hay cupo devuelve 429 con Retry-After: 1 antes de ejecutar el manejador. No reintenta automaticamente operaciones ni consultas.
- Rutas de escritura, login/MFA, detalle de transacciones, turno actual, notificaciones, arqueo y preparacion/resolucion de traspasos no participan en este presupuesto. Una escritura valida sigue su control habitual; no se garantiza ausencia de espera SQL causada por otros trabajos.
- Adquisicion/liberacion vinculadas a la suscripcion HTTP; errores sincronos/asincronos, respuestas completadas y cancelaciones liberan el cupo. No se conserva un mapa de usuarios inactivos.
- Limites iniciales conservadores, no medidos como capacidad de Render. Son locales al proceso, no un control distribuido. Requieren observar 429/p95/pool y ajustar con evidencia si el uso legitimo necesita mas concurrencia. No prometen eliminar saturacion ni detener ataques distribuidos.

## Pruebas

- Contratos unitarios: defaults, limites, tipos repetidos, fechas bisiestas/inexistentes, limites de rango y rechazo sin reflejar contenido privado.
- Matriz de cinco entradas de Transacciones por perfil; rechazos antes de SQL/servicios y continuidad de Administrador/Cajero.
- HTTP real local con Nest: query pollution, campos de alcance falsos, anonimo/revocado/cambio obligatorio, enlace de parametros SQL y paridad de fechas GET/PNG.
- Concurrencia con cuatro HTTP pendientes: quinto rechazado con Retry-After, escritura pasa a su validador y cupos reutilizables tras completar. Pruebas adicionales de aislamiento entre usuarios, techo global de 16, cancelacion, error y resuscripcion sin fugas.
- Regresion completa y recorridos de navegador se registran en el checklist/candidato; no hay prueba de carga contra produccion.

## Antes de publicar

- QA manual de consultas, filtros, grafico/PNG y exportaciones con usuarios normales; verificar que no existan integraciones que dependan de limites fuera de rango o parametros ignorados.
- Medicion del plan 0.5c-512mb sigue pendiente. Este bloque no implementa la paginacion/filtros/totales en servidor del plan de optimizacion ni elimina la descarga del historial durante refrescos.
- Publicacion conjunta solo autorizada, con respaldo productivo nuevo y migracion 055 acumulada; ningun SQL adicional por este bloque. Control de gastos, informe privado y secretos permanecen locales.
