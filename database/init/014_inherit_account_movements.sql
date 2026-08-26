begin;

with source_mappings as (
  select distinct on (target.id_cuenta, source_mapping.id_movimiento)
    target.id_cuenta as target_account_id,
    source_mapping.id_movimiento,
    source_mapping.codigo_operativo,
    source_mapping.nombre_operativo,
    source_mapping.prioridad,
    source_mapping.estado
  from temo.cuentas_bancarias target
  join temo.cuentas_bancarias source
    on source.id_entidad = target.id_entidad
   and source.id_moneda = target.id_moneda
   and source.id_cuenta <> target.id_cuenta
  join temo.cuentas_movimientos source_mapping
    on source_mapping.id_cuenta = source.id_cuenta
  order by target.id_cuenta, source_mapping.id_movimiento, source.consecutivo
)
insert into temo.cuentas_movimientos (
  id_cuenta, id_movimiento, codigo_operativo, nombre_operativo, prioridad, estado
)
select
  target_account_id, id_movimiento, codigo_operativo, nombre_operativo, prioridad, estado
from source_mappings
on conflict (id_cuenta, id_movimiento) do nothing;

with source_effects as (
  select distinct on (target_mapping.id_cuenta_movimiento)
    target_mapping.id_cuenta_movimiento,
    source_effect.afecta_efectivo,
    source_effect.direccion_efectivo,
    source_effect.afecta_cuenta,
    source_effect.direccion_cuenta,
    source_effect.genera_pendiente,
    source_effect.tipo_pendiente,
    source_effect.requiere_contraparte,
    source_effect.permite_conversion,
    source_effect.permite_credito,
    source_effect.observaciones
  from temo.cuentas_movimientos target_mapping
  join temo.cuentas_bancarias target_account
    on target_account.id_cuenta = target_mapping.id_cuenta
  join temo.cuentas_bancarias source_account
    on source_account.id_entidad = target_account.id_entidad
   and source_account.id_moneda = target_account.id_moneda
   and source_account.id_cuenta <> target_account.id_cuenta
  join temo.cuentas_movimientos source_mapping
    on source_mapping.id_cuenta = source_account.id_cuenta
   and source_mapping.id_movimiento = target_mapping.id_movimiento
  join temo.efectos_movimientos source_effect
    on source_effect.id_cuenta_movimiento = source_mapping.id_cuenta_movimiento
  order by target_mapping.id_cuenta_movimiento, source_account.consecutivo
)
insert into temo.efectos_movimientos (
  id_cuenta_movimiento, afecta_efectivo, direccion_efectivo,
  afecta_cuenta, direccion_cuenta, genera_pendiente, tipo_pendiente,
  requiere_contraparte, permite_conversion, permite_credito, observaciones
)
select
  id_cuenta_movimiento, afecta_efectivo, direccion_efectivo,
  afecta_cuenta, direccion_cuenta, genera_pendiente, tipo_pendiente,
  requiere_contraparte, permite_conversion, permite_credito, observaciones
from source_effects
on conflict (id_cuenta_movimiento) do nothing;

insert into temo.migraciones_sistema (codigo)
values ('014_inherit_account_movements')
on conflict (codigo) do nothing;

commit;
