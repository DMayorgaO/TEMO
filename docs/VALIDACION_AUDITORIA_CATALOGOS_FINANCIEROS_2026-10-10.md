# Auditoria de bancos y reglas de comision

Fecha: 2026-10-10. Desarrollo, sin despliegue ni migraciones remotas.

## Riesgo mitigado

El guard y CatalogsService ya exigian Administrador para modificar catalogos,
pero banks/commissions no generaban antes/despues como users/roles. Un cambio
de configuracion quedaba sin ese detalle obligatorio de trazabilidad.

## Implementacion

- Reutiliza bloqueo transaccional de administracion de identidades y consulta
  del actor vigente: usuario/rol activos, codigo JEFA y version de sesion.
- Para editar, bloquea el registro antes de capturar la imagen anterior.
  Posteriormente lee lo realmente almacenado, no el payload enviado.
- Bancos: codigo, nombres corto/largo, tipo y estado.
- Comisiones: entidad/monedas/movimiento (IDs y etiquetas), tipo de calculo,
  porcentaje, monto fijo, rangos y estado. Numeric permanece con precision SQL.
- Bitacora obligatoria en la misma transaccion: CREAR o ACTUALIZAR, tabla real,
  UUID del registro, identidad del actor, antes/despues, IP valida opcional y
  navegador acotado a300 caracteres. Un fallo de auditoria revierte la escritura.
- Desactivar se registra como ACTUALIZAR, mostrando ACTIVO -> INACTIVO.
  No hay borrado fisico nuevo ni una accion ANULAR diferente para estos catalogos.
- Visor de cambios incorpora solo campos permitidos y etiquetas legibles;
  ausente no se interpreta como null/0. Sigue restringido a Administrador.
- No guarda cuerpos completos, hashes, tokens ni campos arbitrarios recibidos.
  Mantiene formulas, valores y comportamiento existente de la configuracion.

## Evidencia

backend/tests/financial-catalog-audit.test.cjs, nueve pruebas contando subcasos:

- Cajero/Transferista/perfil desconocido rechazados antes de consultar la base.
- Visor filtra campos extra y conserva diferencia entre null y no registrado.
- Alta, edicion y desactivacion de banco con imagen anterior correcta y contexto.
- Comision1.25 ->2.5 almacenada/auditada como1.2500 ->2.5000; entidades vinculadas,
  IP invalida omitida, navegador acotado y campos extra no persistidos en audit.
- Version de sesion obsoleta, usuario desactivado o rol cambiado impiden guardar.
- Auditoria fallida revierte insercion de banco y edicion de comision.
- UUID inexistente devuelve404 sin evento ficticio de exito.

Pruebas PostgreSQL exclusivamente en127.0.0.1:55433/temo_preview, fixtures y
eventos revertidos con rollback. Piloto con TEMO_TEST_RESTRICTED_ROLE=1:
compatible con rol temporal sin administracion de objetos ni modificacion de
bitacora; no se crean credenciales productivas.

Suite completa145/145 backend,21/21 frontend; build/lint backend correctos.

## Limites y pendientes

- No reconstruye cambios anteriores que carecian de auditoria.
- No acredita cobertura de sucursales/cuentas/movimientos ni todos sus vinculos;
  ampliar antes/despues en esos catalogos es el siguiente trabajo pendiente.
- No agrega validacion estricta nueva de todos los payloads administrativos.
- Revalidacion transaccional no equivale a reautenticacion con OTP ni elimina
  todas las carreras posibles con operaciones que no usan el bloqueo compartido.
- El piloto SQL no cambia el usuario de conexion actual de Supabase/Render.
- Revisar visualmente las nuevas diferencias en preview y realizar puertas de
  despliegue con respaldo/configuracion real y autorizacion expresa.
