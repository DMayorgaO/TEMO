import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

if (process.env.ALLOW_CLOUD_MIGRATIONS !== 'TEMO') {
  throw new Error('Falta la confirmacion ALLOW_CLOUD_MIGRATIONS=TEMO.');
}

const connectionString = process.env.DATABASE_URL;
const sslCaPath = process.env.DATABASE_SSL_CA_PATH;
if (!connectionString || !sslCaPath) {
  throw new Error('La configuracion de nube esta incompleta.');
}

const parsedUrl = new URL(connectionString);
if (!parsedUrl.hostname.endsWith('.pooler.supabase.com')) {
  throw new Error('La migracion solo puede ejecutarse contra el pooler de Supabase configurado.');
}

const projectRoot = path.resolve(import.meta.dirname, '..');
const migrationsDirectory = path.join(projectRoot, 'database', 'init');
const sslCa = await readFile(sslCaPath, 'utf8');
const client = new pg.Client({
  connectionString,
  application_name: 'temo-cloud-migrations',
  ssl: { ca: sslCa, rejectUnauthorized: true },
});

try {
  await client.connect();
  await client.query(`select pg_advisory_lock(hashtext('temo-cloud-migrations'))`);
  await client.query(`
    create table if not exists public.temo_migrations_cloud (
      archivo text primary key,
      sha256 text not null,
      aplicada_en timestamptz not null default now()
    );
    revoke all on public.temo_migrations_cloud from anon, authenticated;
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((file) => /^\d{3}_.+\.sql$/i.test(file))
    .sort((first, second) => first.localeCompare(second));

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDirectory, file), 'utf8');
    // Supabase instala extensiones administradas en `extensions`; localmente pgcrypto
    // vive en `public`. La transformacion conserva una sola fuente de migraciones.
    const cloudSql = sql.replaceAll(
      /SET\s+search_path\s+TO\s+temo\s*,\s*public\s*;/gi,
      'SET search_path TO temo, extensions, public;',
    );
    const sha256 = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query(
      'select sha256 from public.temo_migrations_cloud where archivo = $1',
      [file],
    );
    if (existing.rowCount) {
      if (existing.rows[0].sha256 !== sha256) {
        throw new Error(`La migracion ${file} cambio despues de haberse aplicado.`);
      }
      console.log(`OMITIDA  ${file}`);
      continue;
    }

    // node-postgres envia cada archivo como un lote. PostgreSQL exige que un
    // valor nuevo de ENUM se confirme antes de utilizarlo en indices parciales.
    if (file === '006_cash_count_close_requests.sql') {
      await client.query(`alter type temo.tipo_arqueo add value if not exists 'ACTUAL'`);
    }

    process.stdout.write(`APLICANDO ${file} ... `);
    try {
      await client.query(cloudSql);
      await client.query(
        'insert into public.temo_migrations_cloud (archivo, sha256) values ($1, $2)',
        [file, sha256],
      );
      console.log('OK');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      console.log('ERROR');
      throw error;
    }
  }

  const validation = await client.query(`
    select
      (select count(*)::int from information_schema.tables where table_schema = 'temo') as tables,
      (select count(*)::int from information_schema.table_constraints where constraint_schema = 'temo' and constraint_type = 'FOREIGN KEY') as foreign_keys,
      (select count(*)::int from temo.usuarios) as users,
      (select count(*)::int from public.temo_migrations_cloud) as migrations
  `);
  const result = validation.rows[0];
  console.log('');
  console.log(`Validacion: ${result.tables} tablas, ${result.foreign_keys} llaves foraneas, ${result.users} usuarios, ${result.migrations} migraciones.`);
} finally {
  await client.query(`select pg_advisory_unlock(hashtext('temo-cloud-migrations'))`).catch(() => undefined);
  await client.end().catch(() => undefined);
}
