import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';
import { captureRecoveryManifest, captureRecoverySequences,
  assertRecoverySequences, quoteRecoveryIdentifier } from './lib/recovery-manifest.mjs';

const root = path.resolve(import.meta.dirname, '..');
const [mode, filename, ...extra] = process.argv.slice(2);
let client;
let stage = 'arguments';
try {
  assert.equal(extra.length, 0);
  assert.ok(['--capture-production-manifest', '--isolated-restored-transfer'].includes(mode));
  const backup = await realpath(filename);
  const allowed = await realpath(path.join(root, 'backups', 'production'));
  assert.ok(backup.startsWith(allowed + path.sep) && path.extname(backup) === '.dump');
  const hash = createHash('sha256').update(await readFile(backup)).digest('hex');
  assert.equal((await readFile(`${backup}.sha256`, 'utf8')).trim().split(/\s+/)[0], hash);
  if (mode === '--capture-production-manifest') {
    const config = dotenv.parse(await readFile(path.join(root, '.env.production')));
    config.APP_ENV = 'production';
    if (config.DATABASE_SSL_CA_PATH) config.DATABASE_SSL_CA_PATH = path.resolve(root, config.DATABASE_SSL_CA_PATH);
    const require = createRequire(import.meta.url);
    const { buildDatabaseOptions } = require('../backend/dist/config/database.config.js');
    client = new pg.Client({ ...buildDatabaseOptions({ get: (key, fallback) => config[key] ?? fallback }),
      application_name: 'temo-release-manifest-readonly' });
    await client.connect();
    assert.equal(client.connection.stream.encrypted && client.connection.stream.authorized, true);
    await client.query('begin isolation level repeatable read read only');
    const history = (await client.query('select archivo,sha256 from public.temo_migrations_cloud order by archivo')).rows;
    assert.equal(history.length, 54);
    const before = await captureRecoverySequences(client);
    const manifest = await captureRecoveryManifest(client, { portableNotNull: true });
    assertRecoverySequences(before, manifest.sequences);
    assertRecoverySequences(before, await captureRecoverySequences(client));
    await client.query('rollback');
    await writeFile(`${backup}.manifest.json`, JSON.stringify({ backupSha256: hash, history, manifest }), { flag: 'wx' });
    console.log(JSON.stringify({ productionReadOnly: true, manifestCaptured: true, tables: manifest.tables.length,
      sequences: manifest.sequences.length, migrationBaseline: history.length }));
  } else {
    stage = 'restore-identity';
    client = new pg.Client({ host: '127.0.0.1', port: 55439, user: 'temo_restore', database: 'postgres', ssl: false,
      connectionTimeoutMillis: 5000, statement_timeout: 60000, options: '-c search_path=temo,public,extensions' });
    await client.connect();
    const identity = (await client.query(`select current_user actor,current_database() db,
      current_setting('data_directory') directory,inet_server_port() port`)).rows[0];
    assert.equal(identity.actor, 'temo_restore'); assert.equal(identity.db, 'postgres'); assert.equal(identity.port, 55439);
    assert.match(identity.directory.replaceAll('\\', '/'), /\/tmp\/pg-restore-test-[a-f0-9]{32}$/);
    const expected = JSON.parse(await readFile(`${backup}.manifest.json`, 'utf8'));
    assert.equal(expected.backupSha256, hash);
    await client.query('begin isolation level repeatable read read only');
    const restored = await captureRecoveryManifest(client, { portableNotNull: true });
    stage = 'restored-manifest';
    // Explicit cross-major rehearsal: keep exact structure/data/sequence checks.
    // The original preview-only verifier still requires the same server major.
    assert.equal(expected.manifest.format, 2); assert.equal(restored.format, 2);
    assert.ok(expected.manifest.serverMajor === restored.serverMajor
      || expected.manifest.serverMajor === 17 && restored.serverMajor === 18);
    if (restored.structureDigest !== expected.manifest.structureDigest) {
      console.error(JSON.stringify({ differingObjects: restored.structureEntries.filter(entry =>
        !expected.manifest.structureEntries.some(old => old.kind === entry.kind && old.name === entry.name && old.digest === entry.digest))
        .map(entry => `${entry.kind}:${entry.name}`).slice(0, 20) }));
    }
    assert.equal(restored.structureDigest, expected.manifest.structureDigest, 'RECOVERY_STRUCTURE_MISMATCH');
    assert.equal(restored.structuralItems, expected.manifest.structuralItems);
    stage = 'restored-data';
    assert.deepEqual(restored.tables, expected.manifest.tables, 'RECOVERY_DATA_MISMATCH');
    assertRecoverySequences(expected.manifest.sequences, restored.sequences);
    await client.query('rollback');
    const relations = (await client.query(`select c.relname name,array_agg(a.attname::text order by a.attnum) columns
      from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
      where n.nspname='temo' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
      group by c.relname order by c.relname`)).rows;
    assert.ok(!relations.find(row => row.name === 'transferencias').columns.includes('version_edicion'));
    const digest = async table => (await client.query(`select count(*)::text rows,
      md5(coalesce(string_agg(digest,'' order by digest),'')) digest from (
      select md5(to_jsonb(t)::text) digest from (select ${table.columns.map(quoteRecoveryIdentifier).join(',')}
      from temo.${quoteRecoveryIdentifier(table.name)}) t) hashes`)).rows[0];
    const before = [];
    for (const table of relations) before.push(await digest(table));
    const sequences = await captureRecoverySequences(client);
    const migration = '055_transfer_change_security.sql';
    const sql = await readFile(path.join(root, 'database', 'init', migration), 'utf8');
    stage = 'migration-rehearsal';
    await client.query(sql);
    for (const [index, table] of relations.entries()) assert.deepEqual(await digest(table), before[index], table.name);
    assertRecoverySequences(sequences, await captureRecoverySequences(client));
    assert.equal((await client.query('select count(*)::int n from temo.transferencias where version_edicion<>1')).rows[0].n, 0);
    assert.equal((await client.query(`select count(*)::int n from pg_trigger where not tgisinternal and
      (tgrelid='temo.transferencias'::regclass and tgname='version_transferencia'
      or tgrelid='temo.transferencias_denominaciones'::regclass and tgname='version_edicion_transferencia')`)).rows[0].n, 2);
    const target = (await client.query('select id_transferencia id from temo.transferencias limit 1')).rows[0];
    assert.ok(target, 'restored transfer required for trigger rehearsal');
    await client.query('begin');
    try {
      await client.query('update temo.transferencias set descripcion=descripcion where id_transferencia=$1', [target.id]);
      assert.equal((await client.query('select version_edicion::text version from temo.transferencias where id_transferencia=$1', [target.id])).rows[0].version, '2');
      const line = (await client.query('select id_transferencia from temo.transferencias_denominaciones limit 1')).rows[0];
      assert.ok(line, 'restored denomination required for trigger rehearsal');
      const previous = (await client.query('select version_edicion::text version from temo.transferencias where id_transferencia=$1', [line.id_transferencia])).rows[0].version;
      const changed = await client.query('update temo.transferencias_denominaciones set sueltos=sueltos where id_transferencia=$1', [line.id_transferencia]);
      const next = (await client.query('select version_edicion::text version from temo.transferencias where id_transferencia=$1', [line.id_transferencia])).rows[0].version;
      assert.equal(BigInt(next), BigInt(previous) + BigInt(changed.rowCount));
    } finally { await client.query('rollback'); }
    console.log(JSON.stringify({ restoredOnly: true, backupDataAndStructureMatch: true, tablesPreserved: relations.length,
      sourcePostgresMajor: expected.manifest.serverMajor, restoredPostgresMajor: restored.serverMajor,
      sequencesPreserved: sequences.length, migration, sha256: createHash('sha256').update(sql).digest('hex'),
      triggersVerified: true, scope: 'isolated-restoration-not-production-migration' }));
  }
} catch (error) {
  console.error(`Verificacion de respaldo/055 no aprobada en ${stage}: ${error.code || error.name}. Sin datos ni credenciales.`);
  if (error.message === 'RECOVERY_STRUCTURE_MISMATCH') console.error(JSON.stringify({ differingObjects: error.differences }));
  process.exitCode = 1;
} finally { if (client) await client.end().catch(() => {}); }
