# Lecturas sensibles: desarrollo

- Interceptor global observa solo GET exitosos autenticados en lista permitida de rutas: usuarios/roles/cuentas/auditoria, transacciones y pendientes, turnos/resumen, transferencias, directorio y compras de dolares.
- No registra login, salud, notificaciones periodicas ni GET fuera de esa lista. Errores siguen en su mecanismo separado; no se consideran lectura exitosa.
- Migracion041 agrega accion CONSULTAR, aplicada solo a preview. Ejecutar migraciones040/041 antes de desplegar este paquete; produccion no modificada.
- Evento LECTURA_SENSIBLE contiene metodo, plantilla del servidor, UUID objetivo si params.id es UUID, e IP valida observada. No copia resultados, filtros/query, cuerpos, tokens ni cabeceras. Registro de la fila identifica al actor; el UUID consultado se muestra en el detalle.
- Dedupe5min por usuario/metodo/ruta/UUID. Consultas de otro UUID si generan evento. Listados con filtros distintos se agrupan porque no se capturan query ni resultados; no representa un conteo exacto ni prueba de que la persona vio cada dato.
- Persistencia asincrona de mejor esfuerzo, maximo10 pendientes y1000 claves por instancia. Puede omitir eventos por saturacion/fallo/reinicio; no constituye registro forense exhaustivo ni alerta automatica. No limita consultas legitimas.
- Pruebas: datos de respuesta/credenciales omitidos, fallos no registrados como exito, rutas publicas/polling/escrituras excluidas, deduplicacion y objetivos distintos; HTTP real comprueba CONSULTAR para cuentas de cajero.
- Build/lint correctos; suite backend52/52 en preview. Pendiente revision visual del usuario.
- Exportaciones generadas en navegador aun no tienen evento especifico; pendiente su registro sin atribuir una consulta como descarga confirmada. Alertas y retencion siguen pendientes.
