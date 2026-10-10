import { createHash } from 'node:crypto';

export function quoteRecoveryIdentifier(name) {
  if (typeof name !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error('Identificador de recuperacion invalido.');
  return `"${name}"`;
}

export function normalizeRecoveryDefinition(entry) {
  // PostgreSQL 18 reparses these two known CHECKs with element casts instead of an array cast.
  // Accept only the exact equivalent forms; never rewrite arbitrary SQL or ignore CHECKs.
  const checks = {
    'notificaciones_usuarios.ck_notificaciones_tipo': ['tipo', ['PENDIENTE_PAGADO', 'TRANSFERENCIA_REGISTRADA']],
    'solicitudes_cierre_turno.solicitudes_cierre_turno_estado_check': ['estado', ['PENDIENTE', 'ATENDIDA', 'CANCELADA']],
  };
  const check = entry.kind === 'constraint' && Object.hasOwn(checks, entry.name) ? checks[entry.name] : undefined;
  if (!check) return entry;
  const [column, values] = check;
  const array = values.map(value => `'${value}'::character varying`).join(', ');
  const elements = values.map(value => `('${value}'::character varying)::text`).join(', ');
  const canonical = `CHECK (((${column})::text = ANY ((ARRAY[${array}])::text[])))`;
  const reparsed = `CHECK (((${column})::text = ANY (ARRAY[${elements}])))`;
  return entry.definition === reparsed ? { ...entry, definition: canonical } : entry;
}

export async function captureRecoveryManifest(client) {
  await client.query("set local time zone 'UTC'");
  await client.query("set local datestyle='ISO, YMD'");
  const relations = (await client.query(`select c.relname as name from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='temo' and c.relkind in ('r','p')
    order by c.relname`)).rows;
  const tables = [];
  for (const { name } of relations) {
    const table = quoteRecoveryIdentifier(name);
    const result = (await client.query(`select count(*)::text as rows,
      md5(coalesce(string_agg(digest,'' order by digest),'')) as digest
      from (select md5(to_jsonb(t)::text) as digest from temo.${table} t) content`)).rows[0];
    tables.push({ name, ...result });
  }
  // Definitions only, no ownership/ACL: custom dumps are restored with --no-owner --no-acl.
  const structure = (await client.query(`select kind,name,definition from (
    select 'column' as kind,c.relname||'.'||a.attname as name,
      format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||
      coalesce(pg_get_expr(d.adbin,d.adrelid),'') as definition
      from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
      left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where n.nspname='temo' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
    union all select 'constraint',c.relname||'.'||k.conname,pg_get_constraintdef(k.oid)
      from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='temo'
    union all select 'index',c.relname,pg_get_indexdef(c.oid)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='temo' and c.relkind='i'
    union all select 'trigger',c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid)
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='temo' and not t.tgisinternal
    union all select 'function',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='temo' and p.prokind in ('f','p')
    union all select 'enum',t.typname,string_agg(e.enumlabel,',' order by e.enumsortorder)
      from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid
      where n.nspname='temo' group by t.typname
    union all select 'view',c.relname,pg_get_viewdef(c.oid)||':'||coalesce(c.reloptions::text,'')
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='temo' and c.relkind in ('v','m')
    union all select 'sequence',c.relname,jsonb_build_object(
      'type',format_type(s.seqtypid,null),'start',s.seqstart,'increment',s.seqincrement,
      'min',s.seqmin,'max',s.seqmax,'cache',s.seqcache,'cycle',s.seqcycle,
      'ownerSchema',tn.nspname,'ownerTable',t.relname,'ownerColumn',a.attname)::text
      from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace
      left join pg_depend d on d.classid='pg_class'::regclass and d.objid=c.oid
        and d.refclassid='pg_class'::regclass and d.deptype in ('a','i')
      left join pg_class t on t.oid=d.refobjid left join pg_namespace tn on tn.oid=t.relnamespace
      left join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
      where n.nspname='temo'
  ) definitions order by kind,name`)).rows.map(normalizeRecoveryDefinition);
  const version = (await client.query('show server_version_num')).rows[0].server_version_num;
  return { format: 2, environment: 'preview-only', serverMajor: Math.floor(Number(version) / 10000),
    sequences: await captureRecoverySequences(client),
    tables, structureDigest: createHash('sha256').update(JSON.stringify(structure)).digest('hex'),
    structureEntries: structure.map(({ kind, name, definition }) => ({ kind, name,
      digest: createHash('sha256').update(definition).digest('hex') })),
    structuralItems: structure.length };
}

export async function captureRecoverySequences(client) {
  const names = (await client.query(`select c.relname as name from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='temo' and c.relkind='S'
    order by c.relname`)).rows;
  const sequences = [];
  for (const { name } of names) {
    // Reading sequence state does not allocate a number; nextval/setval are never used here.
    const state = (await client.query(`select last_value::text as "lastValue",is_called as called
      from temo.${quoteRecoveryIdentifier(name)}`)).rows[0];
    sequences.push({ name, ...state });
  }
  return sequences;
}

export function assertRecoverySequences(expected, actual) {
  if (!Array.isArray(expected) || !Array.isArray(actual)
    || JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('RECOVERY_SEQUENCE_MISMATCH');
}

export function assertRecoveryManifest(expected, actual) {
  if (!expected || !actual || expected.format !== 2 || actual.format !== 2
    || expected.environment !== 'preview-only' || actual.environment !== 'preview-only'
    || expected.serverMajor !== actual.serverMajor) {
    throw new Error('RECOVERY_FORMAT_MISMATCH');
  }
  if (expected.structureDigest !== actual.structureDigest || expected.structuralItems !== actual.structuralItems) {
    const error = new Error('RECOVERY_STRUCTURE_MISMATCH');
    error.differences = actual.structureEntries.filter(entry => !expected.structureEntries?.some(old =>
      old.kind === entry.kind && old.name === entry.name && old.digest === entry.digest)).map(entry => `${entry.kind}:${entry.name}`).slice(0, 10);
    throw error;
  }
  if (JSON.stringify(expected.tables) !== JSON.stringify(actual.tables)) throw new Error('RECOVERY_DATA_MISMATCH');
  assertRecoverySequences(expected.sequences, actual.sequences);
}
