import type { PoolClient } from 'pg';

export async function inspectDatabasePrivileges(client: Pick<PoolClient, 'query'>) {
  // Only aggregates and capability flags; never read application records or credential hashes.
  const result = await client.query(`select
    exists(select 1 from pg_roles where oid = current_user::regrole and rolsuper) as superuser,
    exists(select 1 from pg_roles where oid = current_user::regrole and rolbypassrls) as bypass_rls,
    exists(select 1 from pg_roles where oid = current_user::regrole and (rolcreaterole or rolcreatedb or rolreplication)) as administrative,
    exists(select 1 from pg_roles r where (r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication)
      and pg_has_role(current_user,r.oid,'MEMBER')) as privileged_membership,
    has_database_privilege(current_user,current_database(),'CREATE') as database_create,
    exists(select 1 from pg_namespace n where n.nspname in ('temo','public','extensions')
      and has_schema_privilege(current_user,n.oid,'CREATE')) as schema_create,
    (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='temo' and c.relkind in ('r','p','S','v','m')
        and pg_has_role(current_user,c.relowner,'USAGE')) as owned_objects,
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='temo' and c.relkind in ('r','p')
        and has_table_privilege(current_user,c.oid,'TRUNCATE')) as truncate_tables,
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='temo' and c.relkind in ('r','p')
        and has_table_privilege(current_user,c.oid,'TRIGGER')) as create_triggers,
    (has_table_privilege(current_user,'temo.bitacora','UPDATE')
      or has_table_privilege(current_user,'temo.bitacora','DELETE')
      or has_table_privilege(current_user,'temo.bitacora','TRUNCATE')) as audit_mutation,
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('temo','public','extensions') and p.prosecdef
        and has_function_privilege(current_user,p.oid,'EXECUTE')) as callable_definer,
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('temo_migrations_cloud','preview_migrations')
        and (has_table_privilege(current_user,c.oid,'INSERT')
          or has_table_privilege(current_user,c.oid,'UPDATE')
          or has_table_privilege(current_user,c.oid,'DELETE')
          or has_table_privilege(current_user,c.oid,'TRUNCATE'))) as migration_mutation,
    exists(select 1 from pg_roles r cross join pg_namespace n
      where r.rolname in ('anon','authenticated') and n.nspname='temo'
        and has_schema_privilege(r.oid,n.oid,'USAGE')) as data_api_schema_access`);
  const row = result.rows[0];
  const blockers = ['superuser', 'bypass_rls', 'administrative', 'privileged_membership',
    'database_create', 'schema_create', 'data_api_schema_access', 'truncate_tables',
    'create_triggers', 'audit_mutation', 'callable_definer', 'migration_mutation'].filter(key => row[key] === true);
  if (Number(row.owned_objects) > 0) blockers.push('owned_objects');
  return { suitableForRestrictedApi: blockers.length === 0, blockers,
    ownedObjects: Number(row.owned_objects), scope: 'capability-screening-not-complete-authorization-audit' };
}
