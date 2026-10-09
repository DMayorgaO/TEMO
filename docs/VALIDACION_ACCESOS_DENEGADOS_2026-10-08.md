# Accesos denegados: desarrollo

## Implementacion

- Filtro global registra respuestas403 solo cuando AuthGuard ya asigno identidad validada. Accion RECHAZAR, entidad seguridad, evento ACCESO_DENEGADO; Registro identifica al usuario rechazado.
- Guarda metodo, plantilla de ruta del servidor e IP valida observada. No usa URL completa, query, parametros, cuerpo, cabeceras de autenticacion ni agente del cliente.
- Visor restringido al Administrador muestra evento/metodo/ruta mediante lista permitida. No cambia los permisos ni concede accesos.
- Persistencia asincrona de mejor esfuerzo, fuera de transacciones financieras. Fallo emite aviso generico, sin secretos; respuesta403 se mantiene. No es una cola durable ni garantia de captura exhaustiva.
- Una entrada por usuario/metodo/ruta cada60s por proceso. Memoria maxima1000 claves y maximo10 escrituras simultaneas; excedentes se omiten. No restringe registros/consultas legitimos, pero no sirve como conteo exacto de intentos. Varias instancias pueden generar duplicados.
- Logs de excepciones conservan referencia, codigo, metodo, ruta de servidor y codigo Postgres; eliminan mensaje interno/stack/constraint/URL completa para reducir exposicion accidental. Respuesta path tambien usa plantilla del servidor; diagnostico se hace con referencia/codigo.

## Evidencia

- Build/lint ambos proyectos correctos. Suite completa backend50/50 con integracion local.
- HTTP real: acceso cajero a usuarios bloqueado y evento persistido.
- Pruebas: identidad invalidada omitida, parametros enlazados, IP invalida omitida, deduplicacion, secretos en URL/body/exception no registrados, fallo de persistencia no cambia403 y maximo10 escrituras pendientes.
- No se modifico produccion. Pendiente revision visual de Auditoria.

## Pendiente

- No registra todavia401 anonimos, intentos fallidos de clave que no tienen identidad validada, rechazosCORS/429 externos al filtro, ni404 usados para ocultar existencia de registros.
- Pendientes lecturas sensibles/exportaciones, alertas, retencion, metricas de eventos omitidos y cola durable si se requiere captura exhaustiva.
- IP observada no prueba identidad del dispositivo y depende de configuracion correcta del proxy.
