# Proteccion de formularios de transacciones obsoletos

Estado: solo desarrollo, 2026-10-26. Sin commit, push ni despliegue. Control de gastos local e ignorado.

## Comportamiento

- Cada grupo de transacciones tiene version_edicion BIGINT, transmitida como texto. Detalle y detalle de grupo devuelven editVersion; el listado devuelve edit_version para la anulacion desde la tabla.
- El formulario conserva la version que leyo al abrirse. Edicion individual, edicion/anulacion de grupo y anulacion individual envian expectedVersion junto a la referencia de solicitud.
- Antes de una escritura nueva, el servidor revalida identidad/alcance y bloquea el registro, el turno y la version del grupo. Si expectedVersion ya no coincide, devuelve HTTP 409, codigo TRA-VER-409, sin aplicar cambios, auditoria de exito ni recibo de una operacion inexistente.
- La interfaz conserva el borrador ante conflicto; no reemplaza automaticamente importes, arqueos ni version por los actuales. Se debe revisar y abrir nuevamente para una nueva correccion. Nunca combina automaticamente dos ediciones.
- La anulacion compara la version del registro mostrado en la tabla. Ante rechazo definitivo por version, consulta nuevamente los datos y libera esa referencia fallida. Un intento posterior exige una nueva confirmacion, incluyendo el importe visible actualizado. No vuelve a enviar una escritura automaticamente.
- Si una respuesta se pierde despues de confirmar, el recibo se resuelve antes de verificar la version del formulario. El mismo requestId, expectedVersion y contenido confirma lo ya aplicado, aunque el contador haya avanzado. El recibo no vuelve a aplicar ni sobrescribe cambios posteriores.
- La web actual no envia una correccion sin version valida. Si la API no entrega metadata compatible, conserva el formulario y pide actualizar; no degrada silenciosamente la proteccion.

## Datos relacionados

Migracion 053_transaction_edit_versions.sql, aplicada solo en PostgreSQL preview local (127.0.0.1:55433):

- Contador monotono en grupos_transacciones. Una actualizacion del grupo lo incrementa; una asignacion ordinaria no permite disminuirlo.
- Triggers sobre transacciones, transacciones_montos, pagos_pendientes, abonos_pendientes, arqueos, arqueos_denominaciones y correcciones_transacciones_cerradas invalidan los grupos relacionados, incluyendo origen/aplicacion de un pendiente cuando corresponde.
- Un cambio de estado del turno invalida sus grupos. Esto incluye pasar a revision o cerrar, sin propagar operaciones entre cajeros.
- Los refrescos de Arqueo no invalidan un editor de transaccion por si mismos; los conteos ACTUAL del turno no se confunden con el arqueo del grupo. Una operacion ajena sin vinculo no cambia esa version.
- Funciones con search_path fijo y referencias SQL calificadas; sin SECURITY DEFINER ni privilegios administrativos nuevos para la API. Ensayo con rol SQL restringido correcto.
- La migracion es repetible sin reiniciar contadores existentes. El preflight verifica columna y los nueve triggers habilitados, ademas de su registro.

El detalle compara la version inicial y final de sus lecturas. El grupo exige versiones consistentes entre todos sus miembros y una comprobacion final despues de cargar las compensaciones. Si una escritura interviene, no devuelve campos antiguos con una version nueva; devuelve conflicto y permite consultar nuevamente. No cambia globalmente el aislamiento de las transacciones ni agrega reintentos de escrituras.

## Verificacion

- 230/230 backend y 27/27 frontend; build/lint de ambos proyectos y preflight local correctos.
- transaction-edit-version.test.cjs: contratos y enteros grandes como texto; migracion repetible; lecturas/refrescos/grupos ajenos estables; dos editores; retorno al importe original sin revivir un token antiguo; miembro de grupo cambiado; anulacion obsoleta y prioridad del recibo; pago por otro cajero; cambios directos de denominaciones/montos; rollback por fallo de auditoria/recibo; inyeccion de cambios entre lecturas para rechazar resultados mezclados; cambio de estado y correccion historica sin afectar fondos cerrados.
- transaction-change-concurrency.test.cjs: dos conexiones reales con referencias distintas y la misma version, tanto para transaccion individual como para grupo: solo una correccion confirma, la otra recibe TRA-VER-409. Se verifican saldo y arqueo; tambien reenvios simultaneos con igual referencia/version y anulaciones sin doble restitucion. Fixtures aisladas con limpieza, recibos clonados en esquema temporal sin desproteger los persistentes.
- transaction-edit-version.browser.cjs: dos contextos independientes con API interceptada, formulario obsoleto conserva monto, version 9007199254740993 sin redondear, respuesta perdida y confirmacion idempotente, reapertura con version/referencia nuevas, anulacion desde listado congelado y nueva confirmacion del importe actual, ausencia de version impide enviar. Sin cuentas ni escrituras reales.
- Regresion de navegador de ediciones/anulaciones, pagos, altas y traspasos correcta. Los calculos de compras de dolares y las monedas de centavos permanecen cubiertos por la regresion financiera.

## Limites y publicacion futura

- Por compatibilidad, expectedVersion sigue siendo opcional para clientes anteriores de la API. Estos conservan permisos y recibos, pero no obtienen la garantia contra ediciones obsoletas si no envian version. La web actual la exige; no se afirma que todos los clientes posibles ya la apliquen. Evaluar obligatoriedad en API despues de acordar la transicion y clientes moviles.
- La proteccion cubre correccion/anulacion de transacciones. No versiona aun todos los formularios, catalogos globales, aperturas/cierres ni pagos. Sus validaciones actuales siguen vigentes.
- Los triggers agregan trabajo y bloqueo sobre grupos relacionados. Medir carga/contencion representativa antes de publicar. Un timeout/deadlock revierte la escritura completa; no se reenvia automaticamente ni se promete ausencia de conflictos.
- QA manual con Administradora y cajeros en dos ventanas, operaciones multiples, pendientes liquidados y turnos en revision. Conservar respaldo, plan de retorno y autorizacion nueva antes de publicar.
- Orden futuro: respaldo y migraciones pendientes primero; API con metadata/versionado despues; web al final. No reiniciar contadores durante operacion. Una restauracion exige invalidar sesiones/formularios anteriores, no continuar con borradores de una base distinta.
