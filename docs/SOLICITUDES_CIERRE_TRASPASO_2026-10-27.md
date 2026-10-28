# Solicitudes de cierre y traspaso: bloqueo y resumen

Estado: implementado solo en desarrollo. No se ha publicado ni modificado produccion. Migracion 054 pendiente en nube; conserva las migraciones 044-053 anteriores. Control de gastos excluido.

## Comportamiento

- Enviar un traspaso congela las escrituras del cajero emisor en ese turno mientras la propuesta este pendiente y vigente. Abrir la ventana para preparar el traspaso no crea una solicitud en el servidor. El receptor conserva aceptar/rechazar y el emisor cancelar. Si vence, ya no puede aceptarse ni mantiene el bloqueo.
- Solicitar cierre bloquea ese turno en servidor y en arqueo/saldos. Se rechazan nuevas transacciones, edicion/anulacion individual o grupal, liquidaciones/reversiones, transferencias y cambios del arqueo/saldos/diferencia registrada. Los recibos de operaciones ya confirmadas pueden devolverse sin repetir movimientos.
- El cajero puede usar Cancelar solicitud. La Administradora puede rechazar. Un turno normal vuelve a ABIERTO; un turno ya traspasado EN_REVISION conserva EN_REVISION y su aislamiento. Solo se habilitan sus correcciones, nunca se reactiva la caja anterior ni se cambian fondos del receptor.
- Un aviso automatico de revision generado al aceptar un traspaso EN_REVISION no es una solicitud definitiva de cierre: permite seguir corrigiendo. El bloqueo de ese turno comienza cuando el saliente solicita expresamente su cierre tras las correcciones.
- El alcance no es global por usuario: otros cajeros, otras cajas y otro turno activo del mismo cajero no se bloquean. La Administradora mantiene sus permisos de revision/cierre. Los cambios administrativos pueden invalidar un resumen de traspaso; se conserva la comparacion antes de aceptar.
- Cancelar y rechazar tienen autorizacion de identidad/sesion vigente y auditoria. Comparten bloqueo del turno con las escrituras. La web envia la version de la solicitud revisada al cerrar: si fue cancelada o renovada, debe actualizarse la revision. Clientes anteriores sin expectedCloseRequest mantienen compatibilidad, sin esa comprobacion adicional.

## Presentacion

Resumen visual con Saliente/Entrante y nombres, iconos de entrega/recepcion, turnos, sucursal/caja, fecha y estado. Los datos provienen de relaciones de turnos/usuarios/traspasos, no de interpretar UUID o frases guardadas. Revisar cierre es un boton verde destacado con icono y altura minima de 40 px; Aceptar resumen conserva su accion independiente.

El cierre muestra la misma identidad en dos filas y mantiene las observaciones humanas en su campo editable. No se pierden notas de la Administradora ni se concatenan encabezados repetidos al volver a editar. Las observaciones de sistema anteriores siguen legibles y los datos historicos no se reescriben para el cambio visual.

## Evidencia

- Regresion completa en Node 22.23.4 portable parcheado: 239/239 backend, 27/27 frontend; build/lint correctos.
- shift-submission-lock.test.cjs cubre escrituras denegadas y fondos intactos, otra cajera operando, otro turno activo del mismo usuario, cancelacion, sesion revocada, identidad ajena, rechazo normal y en revision, reenvio confirmado de solo lectura y revision administrativa cancelada/renovada.
- Pruebas SQL restringidas del bloqueo aprobadas. La prueba de concurrencia usa dos conexiones y verifica que una escritura que espera el bloqueo del turno no entra despues de confirmar la solicitud.
- cash-workspace.browser.cjs prueba bloqueo/rehabilitacion de campos y botones, preservacion EN_REVISION, envio de la version revisada y observaciones humanas. Comprueba el color y tamano de Revisar cierre y resumen sin desborde horizontal en 1366x768, 1920x1080 y 390x844; capturas locales en tmp.
- Regresion de navegador de traspasos, versionado, correcciones, liquidaciones y transacciones en revision aprobada. Son APIs interceptadas, no evidencia de operaciones productivas.
- Preflight con migracion 054 correcto; ensayo de restauracion real en servidor temporal: 62 tablas, 1,527 elementos estructurales y 7 secuencias coinciden. Desarrollo reiniciado con la API nueva y Node 22.23.4; correo deshabilitado en preview. No es respaldo ni smoke test productivo.

## Salida

Revisar manualmente con Administradora y cajeros, incluidos cancelar mientras la Administradora tiene el cierre abierto, rechazar/aceptar traspaso y corregir el turno anterior sin modificar el receptor. Mantener las puertas de carga/contencion y respaldo real del candidato acumulado.

Publicacion futura: respaldo verificado y ventana sin escrituras, migraciones faltantes 044-054, API y luego web. Incluir Node 22.23.4 en ambos builds y confirmar runtime/CA reales en Render. No ejecutar auto-deploy antes de preparar el esquema. Un retorno no debe reactivar turnos transferidos ni borrar solicitudes/recibos para omitir validaciones.
