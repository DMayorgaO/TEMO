import { readFileSync } from 'node:fs';
import pg from 'pg';

const api = process.env.TEST_API_URL || 'http://localhost:4012/api';
const ca = readFileSync(process.env.DATABASE_SSL_CA_PATH, 'utf8');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { ca, rejectUnauthorized: true }, max: 1 });
const username = `TEST_SEGURIDAD_${Date.now()}`;
const currentPassword = 'Temporal2026A';
const newPassword = 'NuevaClave2026B';
let userId;

async function request(path, init = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const created = await pool.query(
    `insert into temo.usuarios
       (id_rol, nombres, apellidos, usuario, contrasena_hash, debe_cambiar_contrasena)
     select id_rol, 'Prueba', 'Seguridad', $1, crypt($2, gen_salt('bf', 12)), true
     from temo.roles where codigo = 'CAJERO'
     returning id_usuario`,
    [username, currentPassword],
  );
  userId = created.rows[0].id_usuario;
  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password: currentPassword }) });
  assert(login.response.ok && login.body.user.mustChangePassword, 'El primer ingreso no exigio cambio de contrasena.');
  const blocked = await request('/transactions', { headers: { Authorization: `Bearer ${login.body.token}` } });
  assert(blocked.response.status === 403, 'El usuario temporal pudo entrar a funciones operativas.');
  const changed = await request('/auth/change-password', {
    method: 'POST', headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  assert(changed.response.ok && !changed.body.user.mustChangePassword, 'No se completo el cambio obligatorio.');
  const oldLogin = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password: currentPassword }) });
  assert(oldLogin.response.status === 401, 'La contrasena anterior continuo siendo valida.');
  const newLogin = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password: newPassword }) });
  assert(newLogin.response.ok, 'La nueva contrasena no permitio ingresar.');
  const logout = await request('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${newLogin.body.token}` } });
  assert(logout.response.ok, 'No se completo el cierre de sesion.');
  const invalidated = await request('/auth/me', { headers: { Authorization: `Bearer ${newLogin.body.token}` } });
  assert(invalidated.response.status === 401, 'El token siguio activo despues de cerrar sesion.');
  console.log('Autenticacion segura verificada: cambio obligatorio, bloqueo operativo e invalidacion de sesion.');
} finally {
  if (userId) {
    await pool.query('delete from temo.bitacora where id_usuario = $1', [userId]);
    await pool.query('delete from temo.intentos_inicio_sesion where usuario_normalizado = lower($1)', [username]);
    await pool.query('delete from temo.usuarios where id_usuario = $1', [userId]);
  }
  await pool.end();
}
