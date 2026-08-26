import pg from 'pg';
import { readFileSync } from 'node:fs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL no esta configurada.');
}
const sslCaPath = process.env.DATABASE_SSL_CA_PATH;
const sslCaBase64 = process.env.DATABASE_SSL_CA_BASE64;
const sslCa = sslCaBase64
  ? Buffer.from(sslCaBase64, 'base64').toString('utf8')
  : sslCaPath
    ? readFileSync(sslCaPath, 'utf8')
    : undefined;
if (!sslCa) {
  throw new Error('Debe configurar el certificado CA de Supabase.');
}

const client = new pg.Client({
  connectionString,
  application_name: 'temo-cloud-connection-test',
  ssl: { ca: sslCa, rejectUnauthorized: true },
});

try {
  await client.connect();
  const result = await client.query(`
    select current_database() as database,
           current_user as username,
           inet_server_addr()::text as server_address,
           version() as version
  `);
  const row = result.rows[0];
  console.log(`Conexion segura correcta: ${row.database} / ${row.username}`);
  console.log(`Servidor: ${row.server_address ?? 'administrado por el pooler'}`);
  console.log(String(row.version).split(',')[0]);
} finally {
  await client.end().catch(() => undefined);
}
