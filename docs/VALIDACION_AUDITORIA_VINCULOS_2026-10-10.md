# Auditoria de sucursales, cuentas y movimientos

Fecha: 2026-10-10. Solo desarrollo, sin migraciones ni despliegues remotos.

## Cambios

Las siete rutas logicas de escritura de catalogos (roles, usuarios, bancos,
comisiones, sucursales, cuentas, movimientos) quedan con auditoria transaccional
obligatoria. Esto NO afirma cobertura de todas las otras escrituras de TEMO.

Los cinco catalogos no identitarios reutilizan revalidacion administrativa y
bloqueo transaccional compartido. Para editar, capturan el registro bajo bloqueo
y luego lo realmente almacenado; los cambios y su bitacora se confirman juntos.

- Sucursales: codigo/nombre/estado, usuarios asignados y cuentas vinculadas.
- Cuentas: alias/banco/moneda/estado, sucursales y vinculos operativos heredados.
  Numero completo solo se compara internamente y se elimina de ambas imagenes
  antes de guardar auditoria. Se conserva referencia enmascarada; numeros de
  hasta4 caracteres se ocultan completamente. Si cambia conservando el mismo
  sufijo, se registra igualmente Numero de cuenta cambiado.
- Movimientos: codigo/nombre/estado, cuenta vinculada, codigo/nombre operativo,
  prioridad, estado y banderas/direcciones de efectivo, cuenta, pendiente,
  contraparte, conversion y credito. No se captura observaciones ni filas completas.
- Visor compara colecciones por UUID, no posicion. Muestra adiciones/retiros
  y cambios escalares permitidos; arrays ambiguos, invalidos o de mas de1000
  elementos se identifican como no comparables, nunca como lista vacia.

## Correccion adicional

saveMovement aceptaba mappingIds que podian desactivar vinculos de otro
movimiento al editar el seleccionado. Ahora comprueba pertenencia al mismo
id_movimiento y bloquea los seleccionados; IDs ajenos/inexistentes provocan400
y rollback de toda la edicion. El UPDATE incluye tambien id_movimiento.

No se modifica quien puede operar ni la logica de calculo financiero. No se
habilita escritura nueva para cajeros ni transferistas. El bloqueo compartido
se limita a administracion de catalogos, no al polling de saldos/notificaciones.

## Evidencia

financial-catalog-audit.test.cjs ampliado a15 pruebas contando subcasos:

- Rechazo de tres perfiles no administradores en los cinco catalogos.
- Version administrativa desactualizada, usuario desactivado o rol cambiado.
- Asignaciones de sucursal agregadas/retiradas comparadas por UUID.
- Cambio de alcance de cuenta y cambio de numero con mismo sufijo, sin numero
  completo ni campo interno persistidos en bitacora.
- Direcciones ENTRA/SALE de efectivo/cuenta y snapshot limitado al movimiento.
- ID de vinculo ajeno rechazado sin desactivar otra operacion ni confirmar el
  cambio de nombre del movimiento editado.
- Fallo de bitacora revierte asignaciones, alta de cuenta con efectos heredados
  y cambios de direcciones. Casos previos de bancos/comisiones conservados.
- Visor ignora secretos/campos no permitidos y rechaza comparaciones ambiguas.

Suite completa:151/151 backend con preview y rol SQL restringido del piloto;
21/21 frontend. Build y lint de ambos proyectos correctos. Fixtures/eventos
revertidos; secuencias de prueba pueden avanzar, como cualquier rollback SQL.

## Alcance pendiente

No reconstruye auditorias antiguas ni garantiza que el Administrador no abuse
de permisos legitimos. No audita aun todas las entidades/rutas restantes ni
todos los cambios directos hechos fuera de la API. El numero completo sigue
existiendo en la tabla operativa con sus permisos actuales; enmascararlo en la
bitacora no equivale a cifrarlo en la base.

Faltan QA visual manual de diferencias nuevas, carga/volumen real y puertas
productivas del candidato acumulado. Ver CANDIDATO_SEGURIDAD_2026-10-10.md.
