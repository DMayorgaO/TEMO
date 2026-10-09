# Auditoria real: bloque en desarrollo

- GET /api/catalogs/auditoria requiere Administrador antes de consultar la base.
- Lista hasta 500 eventos mas recientes con orden estable: fecha, usuario, accion, entidad, ID del registro e IP cuando exista.
- No devuelve datos_anteriores, datos_nuevos, agente_usuario ni secretos. Los eventos disponibles dependen de las acciones que los servicios ya registran.
- La interfaz elimina ejemplos, evita recuperar snapshots antiguos, permite consultar y exportar metadatos, y no permite crear, editar o inactivar eventos. El servidor tampoco admite escritura del recurso audit.
- Sin polling automatico de cinco segundos ni carga del historial en el login; se consulta al abrir la pantalla.
- Verificacion: build y lint de ambos proyectos; 9/9 pruebas de catalogos, incluida integracion local. No se ejecutaron cambios en produccion.
- Pendiente: paginacion por servidor y busqueda de todo el historial, errores visibles de carga, auditoria de lecturas/exportaciones/denegaciones, alertas, retencion y proteccion contra modificacion directa en base de datos. Esta pantalla no acredita cobertura total ni constituye registro inmutable.
- Usuario confirma login MFA del Admin correcto en produccion. Se conserva esa evidencia en el checklist.

## Ajustes de legibilidad

- Navegador muestra nombre y version principal; reconoce Edg/ antes de Chrome y Safari, que son tokens de compatibilidad de Edge. Identificacion orientativa, no prueba de identidad.
- Registro muestra nombre legible de la entidad y debajo el codigo operativo para transacciones, grupos, pendientes y turnos, o usuario para accesos. Para entidades sin resolucion conserva UUID; nunca inventa un ID operativo. Los nombres/codigos resueltos corresponden al estado actual, no a una instantanea historica.
- Antes/despues: el listado aun no muestra comparacion. Algunos eventos guardan ambos JSON; otros solo el nuevo estado o un resumen. Ejemplos: edicion de grupo guarda antes/despues; edicion individual guarda entrada nueva; liquidacion guarda estado anterior y resumen final. No hay cobertura completa ni reconstruccion retroactiva.
- Un futuro visor debe usar una lista permitida de campos por entidad, ocultar secretos y distinguir dato ausente de campo eliminado. No exponer los JSON completos como solucion generica.

## Visor inicial de cambios (desarrollo)

- GET /api/catalogs/auditoria/:id exige Administrador y UUID valido. Consulta parametrizada y 404 si no existe.
- Doble clic en un evento carga el detalle, solo lectura. Error de carga explicito; respuesta tardia no sustituye el detalle de otro evento.
- Lista permitida por entidad, solo escalares, cadenas limitadas a 300 caracteres. No devuelve JSON originales, arrays ni objetos anidados. Ausencia significa No registrado, no eliminacion del campo; null se muestra Sin valor.
- Campos iguales omitidos. Falta de diferencias visibles no significa ausencia de cambios. Se declara si existen snapshots y que pueden ser parciales.
- Cobertura inicial: evento/usuario, monto/moneda/banco/movimiento, estado/saldo pendiente, resumen de grupos y estado de turno. No compara aun las estructuras anidadas de transacciones multiples ni denominaciones, ni registra retroactivamente valores faltantes.
- Build/lint y 12 pruebas correctas, incluyendo permisos, datos ausentes, secretos omitidos y lectura de PostgreSQL local. Pendiente comprobacion visual por usuario; no desplegado.

## Captura de edicion individual ordinaria

- Antes de modificar: consulta monto original, moneda, banco, movimiento y tasas desde registros bloqueados; datos normalizados al mismo formato de la entrada nueva.
- Bitacora guarda ambos snapshots en la misma transaccion; un fallo revierte tambien la edicion. No altera reglas financieras ni modifica registros antiguos de auditoria.
- Visor permite rates.buy y rates.sell exclusivamente, sin exponer otros valores anidados.
- Verificacion: build/lint correctos; 18 pruebas auditoria/regresion financiera con rollback local, incluida edicion de 100 a 120, lectura del antes/despues y anulacion que restaura efectivo.
- Alcance pendiente: efectivo por denominaciones, diferencias de grupos, captura comparable de edicion digital e historica, auditoria de denegaciones/lecturas/exportaciones y alertas. No se acredita cobertura completa.

## Denominaciones: edicion individual ordinaria

- Captura del efectivo anterior y posterior desde arqueos almacenados, no solo desde la solicitud, dentro de la transaccion de edicion.
- Comparacion de primaryCounts y changeCounts, separada por NIO/USD. Suma montones25 y sueltos por denominacion, orden descendente estable; entradas duplicadas equivalentes no generan diferencias falsas.
- Solo numeros finitos, cantidades enteras no negativas y totales seguros; arrays limitados a 100 filas por moneda/seccion. Registros incompletos o invalidos indican No registrado, no cero.
- Los datos historicos sin snapshot no se reconstruyen. No cubre aun comparacion de grupos completos, anulaciones ni ediciones digitales/historicas.
- Build y lint correctos; 19 pruebas con rollback local, incluida comparacion de 10 a 12 unidades de C$10 junto con cambio de monto100 a120 y conciliacion/anulacion correcta. Sin cambios en produccion.
