import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { captureRecoveryManifest, assertRecoveryManifest, captureRecoverySequences, assertRecoverySequences } from './lib/recovery-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'backups', 'preview-recovery');
const [mode, filename, ...extra] = process.argv.slice(2);
let client;
try {
  if (extra.length || !['--backup', '--verify-restored'].includes(mode) || (mode === '--backup' && filename)
    || (mode === '--verify-restored' && !filename)) throw new Error();
  const started = Date.now();
  client = new pg.Client({ host: '127.0.0.1', port: mode === '--backup' ? 55433 : 55439,
    database: mode === '--backup' ? 'temo_preview' : 'postgres',
    user: mode === '--backup' ? 'temo_preview' : 'temo_restore', ssl: false,
    connectionTimeoutMillis: 5000, statement_timeout: 60000,
    options: '-c search_path=temo,public,extensions' });
  await client.connect();
  await client.query('begin isolation level repeatable read read only');
  if (mode === '--backup') {
    const sequencesBefore = await captureRecoverySequences(client);
    const snapshot = (await client.query('select pg_export_snapshot() as snapshot')).rows[0].snapshot;
    const manifest = await captureRecoveryManifest(client);
    assertRecoverySequences(sequencesBefore, manifest.sequences);
    if (!manifest.tables.length) throw new Error();
    await mkdir(directory, { recursive: true });
    const output = path.join(directory, `temo-preview-${randomUUID()}.dump`);
    const pgRoot = path.join(process.env.ProgramFiles || 'C:/Program Files', 'PostgreSQL');
    const version = (await readdir(pgRoot)).filter(name => /^\d+$/.test(name)).sort((a, b) => Number(b) - Number(a))[0];
    const environment = { ...process.env };
    for (const key of Object.keys(environment)) if (/^PG/i.test(key)) delete environment[key];
    const result = spawnSync(path.join(pgRoot, version, 'bin', 'pg_dump.exe'), [
      '-h', '127.0.0.1', '-p', '55433', '-U', 'temo_preview', '-d', 'temo_preview', '-w',
      '--format=custom', '--no-owner', '--no-acl', '--schema=temo', '--lock-wait-timeout=10s',
      `--snapshot=${snapshot}`, `--file=${output}`,
    ], { env: environment, windowsHide: true, stdio: 'ignore', timeout: 120000 });
    if (result.error || result.status !== 0) throw new Error();
    // Sequences are not MVCC snapshots: reject a backup if activity changed them during pg_dump.
    assertRecoverySequences(manifest.sequences, await captureRecoverySequences(client));
    const sha256 = createHash('sha256').update(await readFile(output)).digest('hex');
    await writeFile(`${output}.sha256`, `${sha256}  ${path.basename(output)}\n`, { flag: 'wx' });
    await writeFile(`${output}.manifest.json`, JSON.stringify(manifest), { flag: 'wx' });
    console.log(JSON.stringify({ backup: output, tables: manifest.tables.length,
      sequences: manifest.sequences.length, elapsedMs: Date.now() - started }));
  } else {
    const allowed = await realpath(directory);
    const backup = await realpath(filename);
    if (!backup.startsWith(allowed + path.sep) || path.extname(backup) !== '.dump') throw new Error();
    const expected = JSON.parse(await readFile(`${backup}.manifest.json`, 'utf8'));
    const actual = await captureRecoveryManifest(client);
    assertRecoveryManifest(expected, actual);
    const crypto = (await client.query("select crypt('RecoveryProbe123!',gen_salt('bf',4)) as hash")).rows[0].hash;
    if (!(await client.query("select crypt('RecoveryProbe123!',$1)=$1 as valid", [crypto])).rows[0].valid) throw new Error();
    console.log(JSON.stringify({ verified: true, tables: actual.tables.length, structuralItems: actual.structuralItems,
      sequences: actual.sequences.length,
      dataAndStructureMatch: true, pgcrypto: true, elapsedMs: Date.now() - started }));
  }
  await client.query('rollback');
} catch (error) {
  const code = ['RECOVERY_FORMAT_MISMATCH', 'RECOVERY_STRUCTURE_MISMATCH', 'RECOVERY_DATA_MISMATCH', 'RECOVERY_SEQUENCE_MISMATCH'].includes(error?.message)
    ? error.message : 'RECOVERY_FAILED';
  console.error(`Ensayo local de recuperacion fallido: ${code}. No se muestran datos ni detalles de conexion.`);
  if (code === 'RECOVERY_STRUCTURE_MISMATCH') console.error(JSON.stringify({ differingObjects: error.differences }));
  process.exitCode = 1;
} finally { if (client) await client.end().catch(() => {}); }
