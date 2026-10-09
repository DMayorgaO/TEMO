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
  const requiredIndexes = ['usuarios_usuario_normalizado_unique', 'usuarios_correo_normalizado_unique'];
  const indexes = (await client.query(`select c.relname from pg_index i join pg_class c on c.oid=i.indexrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='temo' and c.relname=any($1::text[]) and i.indisunique and i.indisvalid`, [requiredIndexes])).rows;
  const missingIndexes = requiredIndexes.filter(name => !indexes.some(row => row.relname === name));
  const requiredMigrations = ['040_audit_visible_number.sql', '041_audit_read_action.sql',
    '042_audit_export_action.sql', '043_unique_normalized_identities.sql'];
  const migrations = (await client.query('select name from public.preview_migrations where name=any($1::text[])', [requiredMigrations])).rows;
  const missingMigrations = requiredMigrations.filter(name => !migrations.some(row => row.name === name));
  const ready = identities.duplicate_usernames === 0 && identities.duplicate_emails === 0
    && identities.active_administrators > 0 && identities.active_core_roles === 3
    && identities.unsupported_active_users === 0 && !missingIndexes.length && !missingMigrations.length;
  console.log(JSON.stringify({ environment: 'isolated-local-preview', ...identities,
    missingIndexes, missingMigrations, ready }, null, 2));
  await client.query('rollback');
  if (!ready) process.exitCode = 2;
} finally {
  await client.end();
}
