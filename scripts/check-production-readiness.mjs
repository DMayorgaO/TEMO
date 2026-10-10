import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(import.meta.dirname, '..');
let client;
try {
  if (process.argv.length !== 3 || process.argv[2] !== '--production-readonly') throw new Error();
  const config = dotenv.parse(await readFile(path.join(root, '.env.production')));
  config.APP_ENV = 'production';
  if (config.DATABASE_SSL_CA_PATH && !path.isAbsolute(config.DATABASE_SSL_CA_PATH)) {
    config.DATABASE_SSL_CA_PATH = path.resolve(root, config.DATABASE_SSL_CA_PATH);
  }
  const require = createRequire(import.meta.url);
  const { buildDatabaseOptions } = require('../backend/dist/config/database.config.js');
  client = new pg.Client({ ...buildDatabaseOptions({ get: (key, fallback) => config[key] ?? fallback }),
    application_name: 'temo-release-preflight-readonly', statement_timeout: 15000 });
  await client.connect();
  // With a pooler, pg_stat_ssl describes its backend hop, not this client's TLS connection.
  const transportTlsVerified = client.connection.stream.encrypted === true && client.connection.stream.authorized === true;
  await client.query('begin isolation level repeatable read read only');
  const identity = (await client.query(`select
    (select count(*)::int from (select lower(usuario) from temo.usuarios group by lower(usuario) having count(*)>1) x) as duplicate_users,
    (select count(*)::int from (select lower(correo) from temo.usuarios where correo is not null and btrim(correo)<>'' group by lower(correo) having count(*)>1) x) as duplicate_emails,
    (select count(*)::int from temo.usuarios u join temo.roles r using(id_rol) where u.estado='ACTIVO' and r.estado='ACTIVO' and r.codigo='JEFA') as administrators,
    (select count(*)::int from temo.roles where estado='ACTIVO' and codigo in('JEFA','CAJERO','TRANSFERISTA')) as core_roles,
    (select count(*)::int from temo.usuarios u join temo.roles r using(id_rol) where u.estado='ACTIVO' and r.estado='ACTIVO' and r.codigo not in('JEFA','CAJERO','TRANSFERISTA')) as unsupported_profiles,
    (select ssl from pg_stat_ssl where pid=pg_backend_pid()) as backend_hop_tls`)).rows[0];
  const indexes = (await client.query(`select c.relname from pg_index i join pg_class c on c.oid=i.indexrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='temo' and i.indisvalid and i.indisunique
    and c.relname in('usuarios_usuario_normalizado_unique','usuarios_correo_normalizado_unique')`)).rowCount;
  const history = (await client.query('select archivo,sha256 from public.temo_migrations_cloud')).rows;
  const directory = path.join(root, 'database/init');
  const files = (await readdir(directory)).filter(file => /^\d{3}_.+\.sql$/i.test(file)).sort();
  const missing = [], changed = [];
  for (const file of files) {
    const sql = await readFile(path.join(directory, file), 'utf8');
    const row = history.find(entry => entry.archivo === file);
    if (!row) missing.push(file);
    else if (!['\n', '\r\n'].some(ending => createHash('sha256').update(sql.replace(/\r\n|\n/g, ending)).digest('hex') === row.sha256)) changed.push(file);
  }
  const ready = transportTlsVerified && identity.duplicate_users === 0 && identity.duplicate_emails === 0
    && identity.administrators > 0 && identity.core_roles === 3 && identity.unsupported_profiles === 0
    && indexes === 2 && !missing.length && !changed.length;
  await client.query('rollback');
  console.log(JSON.stringify({ environment: 'production-readonly', ready, transportTlsVerified, ...identity,
    normalizedIndexes: indexes, migrationsChecked: files.length, missing, changed,
    scope: 'database-only-not-render-environment-or-functional-approval' }));
  if (!ready) process.exitCode = 2;
} catch {
  console.error('Preflight de produccion no aprobado. Revise configuracion privada, TLS, permisos o esquema; no se muestran credenciales ni registros.');
  process.exitCode = 1;
} finally { if (client) await client.end().catch(() => {}); }
