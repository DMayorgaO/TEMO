import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { quoteRecoveryIdentifier } from './lib/recovery-manifest.mjs';

// Never reads cloud configuration. The restore wrapper owns and removes this cluster.
const config = { host: '127.0.0.1', port: 55439, user: 'temo_restore', database: 'postgres', ssl: false,
  connectionTimeoutMillis: 5000, statement_timeout: 30000, application_name: 'temo-restored-release-check' };
const client = new pg.Client(config);
const connections = [];
try {
  assert.deepEqual(process.argv.slice(2), ['--isolated-restored-release']);
  await client.connect();
  const identity = (await client.query(`select current_user as actor,current_database() as db,
    current_setting('data_directory') as directory,inet_server_port() as port`)).rows[0];
  assert.equal(identity.actor, 'temo_restore'); assert.equal(identity.db, 'postgres'); assert.equal(identity.port, 55439);
  assert.match(identity.directory.replaceAll('\\', '/'), /\/tmp\/pg-restore-test-[a-f0-9]{32}$/);
  assert.equal((await client.query("select to_regclass('temo.traspasos_turno') as existing")).rows[0].existing, null,
    'This release rehearsal expects the production baseline before migration 044');
  const relations = (await client.query(`select c.relname as name,array_agg(a.attname::text order by a.attnum) as columns
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
    where n.nspname='temo' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
    group by c.relname order by c.relname`)).rows;
  async function digest(table) {
    const projection = table.columns.map(column => `${quoteRecoveryIdentifier(column)}`).join(',');
    // Only these two denomination rows may be inserted/updated by migration 045.
    const filter = table.name === 'denominaciones' ? `where not (valor in (0.50,0.25) and id_moneda in (select id_moneda from temo.monedas where codigo='NIO'))` : '';
    return (await client.query(`select count(*)::text as rows,md5(coalesce(string_agg(digest,'' order by digest),'')) as digest
      from (select md5(to_jsonb(t)::text) as digest from (select ${projection} from temo.${quoteRecoveryIdentifier(table.name)} ${filter}) t) hashes`)).rows[0];
  }
  const before = [];
  for (const table of relations) before.push(await digest(table));
  const files = (await readdir(new URL('../database/init/', import.meta.url))).filter(file => /^(04[4-9]|05[0-4])_.*\.sql$/.test(file)).sort();
  assert.equal(files.length, 11);
  for (const file of files) {
    await client.query(await readFile(new URL(`../database/init/${file}`, import.meta.url), 'utf8'));
    console.log(`RESTORED_ONLY ${file}: OK`);
  }
  for (const [index, table] of relations.entries()) assert.deepEqual(await digest(table), before[index], `Existing data changed in ${table.name}`);
  assert.equal((await client.query(`select count(*)::int as n from temo.denominaciones d join temo.monedas m using(id_moneda)
    where m.codigo='NIO' and d.valor in (0.50,0.25) and d.estado='ACTIVO'`)).rows[0].n, 2);
  console.log(JSON.stringify({ restoredOnly: true, migrationsApplied: files.length, originalTablesPreserved: relations.length,
    allowedDataChange: 'two NIO cent denominations and new columns only' }));

  const target = (await client.query(`select t.id_transaccion,g.id_grupo_transacciones,g.version_edicion::text
    from temo.transacciones t join temo.grupos_transacciones g using(id_grupo_transacciones)
    where t.estado='REGISTRADA' order by t.fecha_transaccion desc limit 1`)).rows[0];
  assert.ok(target, 'A restored transaction is required for the trigger contention rehearsal');
  const samples = [], started = performance.now(), workers = 5, iterations = 20;
  await Promise.all(Array.from({ length: workers }, async () => {
    const worker = new pg.Client(config); connections.push(worker); await worker.connect();
    for (let i = 0; i < iterations; i++) {
      const time = performance.now();
      await worker.query('update temo.transacciones set descripcion=descripcion where id_transaccion=$1', [target.id_transaccion]);
      samples.push(performance.now() - time);
    }
  }));
  const after = (await client.query('select version_edicion::text as version from temo.grupos_transacciones where id_grupo_transacciones=$1', [target.id_grupo_transacciones])).rows[0];
  assert.equal(BigInt(after.version), BigInt(target.version_edicion) + BigInt(workers * iterations));
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ restoredOnly: true, contention: { workers, writes: samples.length,
    elapsedMs: Math.round(performance.now() - started), p95Ms: Math.round(samples[Math.ceil(samples.length * .95) - 1]),
    maxMs: Math.round(samples.at(-1)), lostVersionUpdates: 0 }, scope: 'local trigger contention, not Render capacity certification' }));
} catch (error) {
  console.error(`Ensayo aislado no aprobado: ${error.code || error.name}. No se muestran registros ni credenciales.`);
  process.exitCode = 1;
} finally {
  await Promise.all(connections.map(connection => connection.end().catch(() => {})));
  await client.end().catch(() => {});
}
