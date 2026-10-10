import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const { buildDatabaseOptions } = require('../backend/dist/config/database.config');
const { inspectDatabasePrivileges } = require('../backend/dist/modules/database/database-security');

const mode = process.argv.slice(2);
if (mode.length !== 1 || !['--preview', '--configured-readonly'].includes(mode[0])) {
  console.error('Uso: node scripts/check-database-privileges.mjs --preview | --configured-readonly');
  process.exitCode = 2;
} else {
  const settings = mode[0] === '--preview' ? {
    APP_ENV: 'development', DATABASE_URL: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview',
    DATABASE_SSL: 'false', DATABASE_SSL_CA_PATH: '', DATABASE_SSL_CA_BASE64: '',
  } : { ...process.env };
  let client;
  try {
    const options = buildDatabaseOptions({ get: (key, fallback) => settings[key] ?? fallback });
    client = new Client(options);
    await client.connect();
    await client.query('begin read only');
    const report = await inspectDatabasePrivileges(client);
    await client.query('rollback');
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.suitableForRestrictedApi ? 0 : 1;
  } catch {
    console.error('No fue posible completar la comprobacion de privilegios. Revise configuracion y conectividad en privado.');
    process.exitCode = 2;
  } finally { if (client) await client.end().catch(() => {}); }
}
