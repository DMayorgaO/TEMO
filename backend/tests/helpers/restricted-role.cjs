const { randomUUID } = require('node:crypto');

// Caller must own an outer transaction and roll it back, including role/grant creation.
async function useRestrictedPreviewRole(client) {
  const role = `temo_api_test_${randomUUID().replaceAll('-', '')}`;
  await client.query(`create role ${role} nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls`);
  const schemas = (await client.query("select nspname from pg_namespace where nspname in ('temo','public','extensions')")).rows;
  for (const { nspname } of schemas) await client.query(`grant usage on schema ${nspname} to ${role}`);
  await client.query(`grant select,insert,update,delete on all tables in schema temo to ${role}`);
  await client.query(`grant usage,select on all sequences in schema temo to ${role}`);
  await client.query(`revoke update,delete,truncate on temo.bitacora from ${role}`);
  await client.query(`set local role ${role}`);
  return role;
}

module.exports = { useRestrictedPreviewRole };
