# Solicitudes de exportacion: desarrollo

## Implementacion

- POST /api/catalogs/auditoria/exportaciones requiere sesion; identidad proviene del usuario autenticado, no del cuerpo.
- Payload estricto: formato EXCEL/PDF/PNG, apartado de lista permitida, cantidad entera0..1000000. No acepta filas, archivos, filtros, tokens ni identidad alternativa.
- Administrador puede registrar apartados definidos; Cajero solo Turnos/Transacciones. Otros roles no admitidos en este endpoint. PNG solo para grafica administrativa.
- Accion EXPORTAR con evento EXPORTACION_SOLICITADA, formato, apartado, filas_declaradas e IP observada valida. No altera permisos de consulta ni valida el alcance de filas del archivo: no recibe esas filas.
- Integrado en funciones comunes Excel/PDF y PNG de dashboard. PDF notifica solo despues de abrir ventana imprimible; PNG despues de generar blob. No altera apertura sincronica de impresion.
- Doble clic agrupado2s por usuario/apartado/formato, memoria acotada1000 claves por proceso. Excedentes se agrupan/omiten; no se limita la generacion de archivos.
- Frontend envia notificacion de mejor esfuerzo sin bloquear exportacion; fallo solo emite aviso generico en consola. No constituye control de exfiltracion: usuario malicioso puede omitir la notificacion o declarar otro numero de filas. Para garantia mayor, generar/controlar exportaciones en API y medir sus resultados en servidor.
- No prueba descarga/guardado/impresion final; auditoria no debe presentarla como archivo guardado. Cancelar dialogo no borra solicitud.
- Migracion042 aplicada solo en preview. Para desplegar se requieren040/041/042; produccion no modificada.

## Evidencia

- Build y lint frontend/backend correctos;54 pruebas backend y8 frontend aprobadas.
- Pruebas: metadatos invalidos/extra rechazados, rol/formatos comprobados, identidad enlazada, doble clic agrupado. HTTP real verifica evento EXPORTAR persistido con apartado y filas declaradas.
- Pendiente prueba manual de botones Excel/PDF/PNG en navegador habitual. Validacion anterior de exportaciones no sustituye esta comprobacion del nuevo aviso.
- Alertas de extraccion masiva, retencion y exportacion controlada por servidor siguen pendientes.
