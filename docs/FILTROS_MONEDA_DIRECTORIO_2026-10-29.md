# Filtros de moneda, mes completo y Directorio

Fecha: 2026-10-29. Entorno: desarrollo/preview aislado. Sin commit, push ni despliegue productivo.

## Cambios funcionales

- Control C$ / $ reutilizable: seleccionar una moneda filtra; pulsar nuevamente la seleccion devuelve ambas. No convierte importes ni modifica datos guardados.
- Filas por moneda en transacciones, transferencias, pendientes, cuentas y reglas/reportes de comisiones. Transferencias y pendientes muestran totales de la moneda seleccionada. Cambiar la moneda limpia la seleccion de liquidacion masiva de pendientes.
- En Arqueo/Saldos y Compras de dolares se ocultan los bloques o columnas de la otra moneda, sin borrar valores ni desmontar los campos del arqueo. Una compra contiene USD comprados y diferencia NIO: se filtran sus columnas, no se inventan operaciones separadas.
- Turnos conserva los mismos registros y muestra los importes de apertura/cierre de la moneda seleccionada; las exportaciones usan esa proyeccion. Los datos originales siguen disponibles al abrir el turno.
- Panel General conserva los filtros monetarios existentes y los aplica tambien a las columnas y resumenes inferiores. Mes completo usa el mes del campo Desde y ajusta sus limites, sin seleccionar automaticamente todos los dias. El control existente de seleccionar todas las barras permanece independiente.
- Cada dia del grafico muestra su cantidad, incluido cero. Con columnas estrechas las cantidades se rotan para evitar superposicion; el dibujo exportado usa la misma rutina. Se conservan seleccion por arrastre, fechas y suma de dias.
- Formularios de registro/edicion y configuracion de tasas mantienen ambas monedas cuando son necesarias para la operacion: el filtro de consulta no oculta ni cambia informacion dentro del formulario financiero.

## Seguridad del Directorio

- Altas y ediciones revalidan usuario/rol activo, rol real, cambio obligatorio de contrasena y version de sesion dentro de la transaccion SQL, con bloqueo compartido del actor y rol.
- Solo Administrador y Cajero mantienen el permiso existente de escritura. No se amplian permisos de lectura ni de otros roles.
- Edicion bloquea primero el destinatario antes de reemplazar identificadores, cedulas y referencias.
- Auditoria obligatoria del alta/edicion/desactivacion, en la misma transaccion. Desactivacion queda como ANULAR. Fallo de auditoria revierte tambien los datos relacionados.
- Auditoria registra nombre, estado, cantidades y banderas de cambios. No duplica numeros de cuentas/cedulas, titulares, referencias ni observaciones libres en la bitacora. El visor traduce las claves permitidas.
- No requiere migracion adicional. La 055 pendiente del bloque anterior sigue siendo requisito para publicar el paquete completo.

## Evidencia

- Node portable 22.23.4, compilacion y lint de ambos proyectos correctos.
- Backend: 261 pruebas aprobadas, cero fallos/omisiones; frontend: 34 aprobadas.
- Directorio bajo rol SQL restringido: 7 pruebas aprobadas, con rollback completo de fixtures.
- Nueve recorridos de navegador aislado: filtros de moneda, seleccion mensual del panel, seguridad de cambios de transferencias, cambios de transacciones, espacio de Arqueo/Saldos, transacciones en revision, traspasos, liquidacion de pendientes y version de edicion.
- Recorrido de monedas ampliado a cuentas/comisiones/reportes; comprueba ausencia de escrituras financieras al filtrar y limpieza de seleccion de pendientes.
- Mes completo: verifica 31 etiquetas de cantidades dibujadas y limites de octubre; pruebas unitarias incluyen febrero bisiesto, no bisiesto y diciembre.
- Arqueo/Saldos: perfiles Administrador/Cajero, 1366x768 y 1920x1080, tambien 1280x720 y 1366x650. Pruebas de diseno movil incluidas. Capturas y logs temporales en tmp, no publicables.
- Pruebas de interfaz con registros sinteticos y API interceptada: no acreditan sesiones MFA reales, correo ni produccion.

## Pendiente antes de publicar

- Revision manual del usuario en desarrollo de filtros, exportaciones y grafico mensual con sus datos de prueba.
- Seguimiento del bloque posterior del mismo dia: version de contenido incorporada para evitar sobrescritura de formularios antiguos; ver VERSION_DIRECTORIO_2026-10-29.md. Recibos idempotentes siguen pendientes.
- Continuar los puntos abiertos de la matriz de seguridad; este bloque no certifica el cierre general del checklist.
- Nueva autorizacion de publicacion, respaldo/ensayo y migracion 055; verificar ambos servicios y runtime en Render. No se cambio produccion ni el control interno de gastos.
