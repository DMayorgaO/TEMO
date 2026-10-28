import pg from 'pg';

// Deliberately fixed to the isolated preview: never loads production credentials.
const client = new pg.Client({
  connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview',
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  await client.query('begin read only');
  const identities = (await client.query(`select
    (select count(*)::integer from (select lower(usuario) from temo.usuarios
      group by lower(usuario) having count(*)>1) duplicates) as duplicate_usernames,
    (select count(*)::integer from (select lower(correo) from temo.usuarios
      where correo is not null and btrim(correo)<>''
      group by lower(correo) having count(*)>1) duplicates) as duplicate_emails,
    (select count(*)::integer from temo.usuarios u join temo.roles r using(id_rol)
      where u.estado='ACTIVO' and r.estado='ACTIVO' and r.codigo='JEFA') as active_administrators,
    (select count(*)::integer from temo.roles where codigo in('JEFA','CAJERO','TRANSFERISTA')
      and estado='ACTIVO') as active_core_roles,
    (select count(*)::integer from temo.usuarios u join temo.roles r using(id_rol)
      where u.estado='ACTIVO' and r.estado='ACTIVO'
      and r.codigo not in('JEFA','CAJERO','TRANSFERISTA')) as unsupported_active_users`)).rows[0];
  const requiredIndexes = ['usuarios_usuario_normalizado_unique', 'usuarios_correo_normalizado_unique',
    'uq_traspaso_origen_pendiente','uq_traspaso_receptor_pendiente','uq_traspaso_origen_aceptado','solicitudes_financieras_pkey'];
  const indexes = (await client.query(`select c.relname from pg_index i join pg_class c on c.oid=i.indexrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='temo' and c.relname=any($1::text[]) and i.indisunique and i.indisvalid`, [requiredIndexes])).rows;
  const missingIndexes = requiredIndexes.filter(name => !indexes.some(row => row.relname === name));
  const requiredMigrations = ['040_audit_visible_number.sql', '041_audit_read_action.sql',
    '042_audit_export_action.sql', '043_unique_normalized_identities.sql',
    '050_readable_handover_observations.sql','051_pending_payment_receipts.sql','052_transaction_change_receipts.sql',
    '053_transaction_edit_versions.sql','054_shift_submission_lock.sql'];
  const migrations = (await client.query('select name from public.preview_migrations where name=any($1::text[])', [requiredMigrations])).rows;
  const missingMigrations = requiredMigrations.filter(name => !migrations.some(row => row.name === name));
  const prerequisites=(await client.query(`select
    exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace
      where n.nspname='temo' and t.typname='estado_turno' and e.enumlabel='EN_REVISION') as review_state,
    exists(select 1 from information_schema.columns where table_schema='temo' and table_name='traspasos_turno' and column_name='modo') as handover_modes,
    (select count(*)=2 from information_schema.columns where table_schema='temo' and table_name='saldos_turno_cuentas'
      and column_name in ('traspaso_base_ingresos','traspaso_base_egresos')) as isolated_balances,
    exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='temo' and c.relname='solicitudes_financieras' and t.tgname='proteger_recibo_financiero' and t.tgenabled='O') as immutable_receipts,
    exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='temo' and c.relname='turnos' and t.tgname='proteger_estado_revision' and t.tgenabled='O') as review_guard,
    exists(select 1 from information_schema.columns where table_schema='temo' and table_name='solicitudes_cierre_turno'
      and column_name='bloquea_cambios' and data_type='boolean' and is_nullable='NO') as submission_locks,
    exists(select 1 from information_schema.columns where table_schema='temo' and table_name='grupos_transacciones'
      and column_name='version_edicion' and data_type='bigint' and is_nullable='NO') as edit_versions,
    (select count(*)=9 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='temo' and not t.tgisinternal and t.tgenabled='O' and
      ((c.relname='grupos_transacciones' and t.tgname='version_grupo')
       or (c.relname='turnos' and t.tgname='version_edicion_estado_turno')
       or (c.relname in ('transacciones','transacciones_montos','pagos_pendientes','abonos_pendientes','arqueos',
         'arqueos_denominaciones','correcciones_transacciones_cerradas') and t.tgname='version_edicion_grupos'))) as edit_version_triggers`)).rows[0];
  const ready = identities.duplicate_usernames === 0 && identities.duplicate_emails === 0
    && identities.active_administrators > 0 && identities.active_core_roles === 3
    && identities.unsupported_active_users === 0 && !missingIndexes.length && !missingMigrations.length&&Object.values(prerequisites).every(Boolean);
  console.log(JSON.stringify({ environment: 'isolated-local-preview', ...identities,
    missingIndexes, missingMigrations, prerequisites, ready }, null, 2));
  await client.query('rollback');
  if (!ready) process.exitCode = 2;
} finally {
  await client.end();
}
