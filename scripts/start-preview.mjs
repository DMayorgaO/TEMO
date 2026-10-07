import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'tmp', 'preview');
const data = path.join(runtime, 'pgdata');
const databaseUrl = 'postgresql://temo_preview@127.0.0.1:55433/temo_preview';
mkdirSync(runtime, { recursive: true });

function run(file, args) {
  const log = openSync(path.join(runtime, 'setup.log'), 'a');
  const result = spawnSync(file, args, { cwd: root, windowsHide: true, stdio: ['ignore', log, log], timeout: 120000 });
  closeSync(log);
  if (result.error || result.status !== 0) throw new Error(`${path.basename(file)}: ${result.error?.message || `Revise ${path.join(runtime, 'setup.log')}`}`);
}
async function available(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Puerto ${port} ocupado. No se modifico el servicio que lo utiliza.`)));
    server.listen(port, '0.0.0.0', () => server.close(resolve));
  });
}
function launch(args, name, env) {
  const out = openSync(path.join(runtime, `${name}.log`), 'a');
  const err = openSync(path.join(runtime, `${name}-error.log`), 'a');
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, detached: true, windowsHide: true, stdio: ['ignore', out, err] });
  child.unref();
  closeSync(out);
  closeSync(err);
  return child;
}
async function waitFor(url) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return; } catch { /* Service is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`No responde ${url}. Revise ${runtime}`);
}

let alreadyActive = false;
try {
  const state = JSON.parse(readFileSync(path.join(runtime, 'services.json'), 'utf8'));
  process.kill(state.backend, 0);
  process.kill(state.frontend, 0);
  const html = await (await fetch('http://127.0.0.1:3187', { signal: AbortSignal.timeout(1500) })).text();
  const health = await fetch('http://127.0.0.1:4187/api/health', { signal: AbortSignal.timeout(1500) });
  if (html.includes('TEMO') && health.ok) {
    console.log('TEMO de pruebas ya esta activo: http://127.0.0.1:3187');
    alreadyActive = true;
  }
} catch { /* No active preview. Start its isolated services below. */ }
if (!alreadyActive) {
await available(3187);
await available(4187);
const pgRoot = path.join(process.env.ProgramFiles || 'C:/Program Files', 'PostgreSQL');
const version = readdirSync(pgRoot).filter(name => /^\d+$/.test(name)).sort((a, b) => Number(b) - Number(a))[0];
if (!version) throw new Error('No se encontro PostgreSQL local.');
const bin = path.join(pgRoot, version, 'bin');
if (!existsSync(path.join(data, 'PG_VERSION'))) {
  run(path.join(bin, 'initdb.exe'), ['-D', data, '-U', 'temo_preview', '--auth=trust', '--encoding=UTF8', '--locale=C']);
}
const status = spawnSync(path.join(bin, 'pg_ctl.exe'), ['-D', data, 'status'], { windowsHide: true, encoding: 'utf8' });
if (status.status !== 0) {
  await available(55433);
  // This cluster accepts local connections only and contains exclusively demo data.
  run(path.join(bin, 'pg_ctl.exe'), ['-D', data, '-l', path.join(runtime, 'postgres.log'), '-o', '-p 55433 -h 127.0.0.1', '-w', 'start']);
}
const adminUrl = new URL(databaseUrl);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
await admin.connect();
try {
  if (!(await admin.query("select 1 from pg_database where datname='temo_preview'")).rowCount) await admin.query('create database temo_preview');
  for (const role of ['anon', 'authenticated']) {
    if (!(await admin.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) await admin.query(`create role ${role} nologin`);
  }
} finally { await admin.end(); }
const db = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
await db.connect();
try {
  await db.query('create table if not exists public.preview_migrations (name text primary key)');
  for (const name of readdirSync(path.join(root, 'database', 'init')).filter(name => name.endsWith('.sql')).sort()) {
    if ((await db.query('select 1 from public.preview_migrations where name=$1', [name])).rowCount) continue;
    console.log(`Preparando ${name}`);
    run(path.join(bin, 'psql.exe'), ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '55433', '-U', 'temo_preview', '-d', 'temo_preview', '-f', path.join(root, 'database', 'init', name)]);
    await db.query('insert into public.preview_migrations values ($1)', [name]);
  }
  await db.query('set search_path=temo,public');
  for (const [role, username, label] of [['JEFA', 'admin.pruebas', 'Administrador'], ['CAJERO', 'cajero.pruebas', 'Cajero']]) {
    await db.query(`insert into usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
      select id_rol,$1,'PRUEBAS',$2,crypt($3,gen_salt('bf',10)),false from roles where codigo=$4
      on conflict(usuario) do nothing`, [label, username, 'TemoPruebas2026!', role]);
  }
  await db.query(`insert into usuarios_sucursales(id_usuario,id_sucursal)
    select u.id_usuario,s.id_sucursal from usuarios u cross join sucursales s
    where u.usuario in ('admin.pruebas','cajero.pruebas') on conflict do nothing`);
} finally { await db.end(); }

const backend = launch(['backend/dist/main.js'], 'backend', {
  DATABASE_URL: databaseUrl, DATABASE_SSL: 'false', DATABASE_SSL_CA_PATH: '', DATABASE_SSL_CA_BASE64: '',
  PORT: '4187', BACKEND_PORT: '4187', AUTH_SECRET: randomBytes(48).toString('hex'),
  CORS_ORIGINS: 'http://localhost:3187,http://127.0.0.1:3187', APP_ENV: 'development',
});
let frontend;
try {
  await waitFor('http://127.0.0.1:4187/api/health');
  frontend = launch(['frontend/node_modules/vite/bin/vite.js', 'frontend', '--config', 'frontend/vite.config.ts', '--host', '127.0.0.1', '--port', '3187', '--strictPort'], 'frontend', {
    VITE_API_URL: 'http://127.0.0.1:4187/api', VITE_APP_ENV: 'preview',
  });
  await waitFor('http://127.0.0.1:3187');
  if (backend.exitCode !== null || frontend.exitCode !== null) throw new Error('Un servicio termino durante el inicio. Revise sus logs.');
  const html = await (await fetch('http://127.0.0.1:3187')).text();
  if (!html.includes('TEMO')) throw new Error('El puerto de pruebas no esta mostrando TEMO.');
  writeFileSync(path.join(runtime, 'services.json'), JSON.stringify({ backend: backend.pid, frontend: frontend.pid, url: 'http://127.0.0.1:3187' }));
  console.log('PRUEBAS: http://127.0.0.1:3187');
  console.log('Usuarios: admin.pruebas / cajero.pruebas. Clave inicial: TemoPruebas2026!');
  console.log('Base aislada con datos de ejemplo; no utiliza Render ni datos de produccion.');
} catch (error) {
  backend.kill();
  frontend?.kill();
  throw error;
}
}
