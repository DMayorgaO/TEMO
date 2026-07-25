# Modelo base TEMO

## Decisiones principales

- Internamente se usa `operational_entities` para agrupar bancos reales y servicios como PEX/TELEDOLAR.
- Para la duena, todos pueden mostrarse como bancos mediante `show_as_bank`.
- Las comisiones se guardan separadas del efectivo operativo en `transaction_commissions`.
- Los cajeros no deben recibir datos de comisiones desde el backend.
- Las transacciones pueden tener varios importes en `transaction_amounts`, permitiendo combinaciones de NIO/USD, efectivo, transferencia, credito y cuenta financiera.
- Las anulaciones no eliminan datos; cambian estado y generan reversos.
- Las correcciones de turnos cerrados se registran como nuevas transacciones trazables.
- La migracion de Excel pasa por staging: `excel_import_batches`, `excel_import_rows`, `excel_import_errors`.
- Los usuarios se relacionan con roles mediante `users.role_id`.
- Los permisos se asignan a roles mediante `role_permissions`; no se asignan directamente usuario por usuario.
- Las contrasenas se almacenan como `password_hash`, nunca como texto plano.

## Agrupacion de bancos y servicios

`operational_entities` permite registrar:

- Bancos reales: BAC, BANPRO, LAFISE, BDF.
- Servicios con saldo/comision: PEX, TELEDOLAR.

Campos clave:

- `kind`: clasificacion tecnica.
- `show_as_bank`: permite reportarlos juntos como bancos.
- `manages_balance`: indica si maneja saldo operativo.
- `manages_commission`: indica si genera comisiones.

## Comisiones

Las reglas viven en:

- `commission_rules`
- `commission_rule_ranges`

El resultado historico por transaccion vive en:

- `transaction_commissions`

Esto evita que los reportes historicos cambien si la duena modifica una regla futura.

## Seguridad, roles y permisos

Tablas base:

- `users`: usuario del sistema con nombres, apellidos, usuario unico, hash de contrasena, rol y estado.
- `roles`: catalogo de roles como DUENA o CAJERO.
- `permissions`: catalogo de permisos por funcion o pantalla.
- `role_permissions`: relacion muchos-a-muchos entre roles y permisos.

Campos recomendados por pantalla:

- Usuarios: IdUsuario, nombres, apellidos, usuario, contrasena temporal, IdRol y estado.
- Roles: IdRol, detalle o nombre clave, descripcion y estado.
- Permisos: IdPermiso, detalle o nombre clave, descripcion y estado.
