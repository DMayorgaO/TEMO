# Version de edicion del Directorio

Solo desarrollo. Completa el control de sesiones/auditoria del bloque anterior, sin migracion SQL nueva.

- Listado, detalle y resultado guardado incluyen edit_version, SHA-256 de la proyeccion almacenada actual: identidad del destinatario, nombre/estado/notas, identificadores, cedulas, referencias y fuentes. No es un secreto ni un token de autorizacion y no se registra en auditoria.
- PUT requiere expectedVersion valido. Bajo bloqueo del destinatario se lee la proyeccion actual y se compara antes de cambiar padre o hijos. Diferencia produce 409 sin escrituras ni auditoria de exito. Falta/formato invalido produce 400.
- Editar y anular en la web envian la version que se vio, no una obtenida silenciosamente antes de guardar. Ante conflicto el formulario conserva el borrador; el usuario debe cerrar y revisar el registro actualizado antes de aplicar una nueva correccion.
- Se conservan permisos JEFA/CAJERO, revalidacion transaccional de sesion/rol y rollback obligatorio si falla auditoria.
- Version basada en contenido, no contador: si todos los datos vuelven exactamente al mismo contenido, la version puede volver a ser igual. No pretende detectar una historia intermedia ya revertida. Scripts/importaciones externas deben respetar la misma coordinacion de bloqueo; no se certifica concurrencia con escritores que evadan el servicio.
- No agrega recibos idempotentes para altas/ediciones del Directorio. Un fallo de red con resultado incierto requiere revisar antes de repetir; no hacer reintentos automaticos.

Validacion: pruebas SQL de versiones de listado/detalle, requerimiento del contrato, edicion/anulacion antigua, hijos modificados sin cambiar padre, ausencia de auditoria en conflicto y regresion de permisos/rollback. Recorrido de dos sesiones de navegador sinteticas confirma version original y borrador conservado.

Build/lint correctos con Node 22.23.4; 264 pruebas backend y 34 frontend aprobadas. Directorio bajo rol SQL restringido: 10 pruebas aprobadas, sin omisiones, con fixtures revertidos. Sin migraciones productivas ni cambios de planes en este bloque.

Siete recorridos de navegador local aprobados: version de Directorio, monedas/cargas retenidas, Arqueo, cambios de transacciones, traspasos, turnos en revision y version de edicion. Entorno de desarrollo reiniciado conservando datos; no certifica tiempos de produccion.

Antes de publicar: QA manual de dos ventanas y anulacion desde lista. Coordinar API/web y recarga de clientes; clientes antiguos sin expectedVersion quedan bloqueados para editar, no se permite omitir la proteccion por compatibilidad. La migracion 055 del bloque financiero anterior sigue pendiente de publicacion conjunta autorizada.
