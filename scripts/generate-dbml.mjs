import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const root = path.resolve(import.meta.dirname, '..');
const envText = await fs.readFile(path.join(root, '.env'), 'utf8').catch(() => '');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;
if (!connectionString) throw new Error('No se encontro DATABASE_URL en el entorno ni en .env.');

const client = new Client({ connectionString });
await client.connect();

const tablesResult = await client.query(`
    select table_name, obj_description((quote_ident(table_schema) || '.' || quote_ident(table_name))::regclass) as comment
    from information_schema.tables
    where table_schema = 'temo' and table_type = 'BASE TABLE'
    order by table_name
  `);
const columnsResult = await client.query(`
    select table_name, column_name, ordinal_position, data_type, udt_name, is_nullable,
           column_default, character_maximum_length, numeric_precision, numeric_scale
    from information_schema.columns
    where table_schema = 'temo'
    order by table_name, ordinal_position
  `);
const constraintsResult = await client.query(`
    select tc.table_name, tc.constraint_name, tc.constraint_type,
           json_agg(kcu.column_name order by kcu.ordinal_position) as columns
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_schema = tc.constraint_schema
     and kcu.constraint_name = tc.constraint_name
     and kcu.table_name = tc.table_name
    where tc.table_schema = 'temo'
      and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE')
    group by tc.table_name, tc.constraint_name, tc.constraint_type
    order by tc.table_name, tc.constraint_type, tc.constraint_name
  `);
const foreignKeysResult = await client.query(`
    select
      source.relname as source_table,
      con.conname as constraint_name,
      json_agg(source_att.attname order by source_key.ordinality) as source_columns,
      target.relname as target_table,
      json_agg(target_att.attname order by source_key.ordinality) as target_columns,
      con.confdeltype as delete_action,
      con.confupdtype as update_action
    from pg_constraint con
    join pg_class source on source.oid = con.conrelid
    join pg_namespace source_ns on source_ns.oid = source.relnamespace
    join pg_class target on target.oid = con.confrelid
    cross join lateral unnest(con.conkey) with ordinality as source_key(attnum, ordinality)
    join lateral unnest(con.confkey) with ordinality as target_key(attnum, ordinality)
      on target_key.ordinality = source_key.ordinality
    join pg_attribute source_att on source_att.attrelid = source.oid and source_att.attnum = source_key.attnum
    join pg_attribute target_att on target_att.attrelid = target.oid and target_att.attnum = target_key.attnum
    where con.contype = 'f' and source_ns.nspname = 'temo'
    group by source.relname, con.conname, target.relname, con.confdeltype, con.confupdtype
    order by source.relname, con.conname
  `);
const enumsResult = await client.query(`
    select typ.typname as enum_name, enum.enumlabel,
           enum.enumsortorder
    from pg_type typ
    join pg_namespace ns on ns.oid = typ.typnamespace
    join pg_enum enum on enum.enumtypid = typ.oid
    where ns.nspname = 'temo'
    order by typ.typname, enum.enumsortorder
  `);

await client.end();

const groups = [
  {
    name: '01 - Seguridad y acceso',
    color: '#17324D',
    tables: ['roles', 'permisos', 'roles_permisos', 'usuarios', 'usuarios_sucursales', 'dispositivos'],
  },
  {
    name: '02 - Catalogos maestros',
    color: '#176B5B',
    tables: [
      'entidades_bancarias', 'monedas', 'sucursales', 'cajas', 'cuentas_bancarias',
      'cuentas_sucursales', 'movimientos', 'cuentas_movimientos', 'efectos_movimientos',
      'denominaciones', 'metodos_pago', 'tipos_cambio', 'reglas_comisiones', 'contrapartes',
    ],
  },
  {
    name: '03 - Jornadas, turnos y saldos',
    color: '#1D4ED8',
    tables: [
      'jornadas', 'turnos', 'arqueos', 'arqueos_denominaciones', 'saldos_jornada_cuentas',
      'saldos_turno_cuentas', 'solicitudes_cierre_turno', 'cierres_diarios', 'cierres_diarios_detalles',
    ],
  },
  {
    name: '04 - Transacciones y pendientes',
    color: '#8A5A00',
    tables: [
      'grupos_transacciones', 'transacciones', 'transacciones_montos', 'movimientos_efectivo',
      'movimientos_cuentas', 'transacciones_comisiones', 'pagos_pendientes', 'abonos_pendientes',
      'historial_pendientes', 'anulaciones_transacciones', 'correcciones_transacciones',
    ],
  },
  {
    name: '05 - Transferencias internas',
    color: '#6D28D9',
    tables: ['transferencias', 'transferencias_denominaciones'],
  },
  {
    name: '06 - Control, auditoria e importacion',
    color: '#9F1239',
    tables: [
      'bitacora', 'aprobaciones', 'notificaciones_usuarios', 'importaciones_excel',
      'importaciones_excel_filas', 'importaciones_excel_errores', 'migraciones_sistema',
    ],
  },
];

const groupByTable = new Map(groups.flatMap((group) => group.tables.map((table) => [table, group])));
const columnsByTable = Map.groupBy(columnsResult.rows, (column) => column.table_name);
const constraintsByTable = Map.groupBy(constraintsResult.rows, (constraint) => constraint.table_name);
const enums = Map.groupBy(enumsResult.rows, (item) => item.enum_name);

function quoteName(value) {
  return /^[a-z_][a-z0-9_]*$/i.test(value) ? value : `"${String(value).replaceAll('"', '\\"')}"`;
}

function columnType(column) {
  if (column.data_type === 'USER-DEFINED') return `temo.${column.udt_name}`;
  if (column.data_type === 'ARRAY') return `${column.udt_name.replace(/^_/, '')}[]`;
  if (column.data_type === 'character varying') {
    return column.character_maximum_length ? `varchar(${column.character_maximum_length})` : 'varchar';
  }
  if (column.data_type === 'timestamp with time zone') return 'timestamptz';
  if (column.data_type === 'timestamp without time zone') return 'timestamp';
  if (column.data_type === 'double precision') return 'double';
  if (column.data_type === 'numeric') {
    return column.numeric_precision
      ? `decimal(${column.numeric_precision},${column.numeric_scale ?? 0})`
      : 'decimal';
  }
  return {
    'integer': 'int',
    'boolean': 'boolean',
    'character': 'char',
  }[column.data_type] || column.data_type;
}

function defaultOption(value) {
  if (!value || value.startsWith('nextval(')) return null;
  const enumLiteral = value.match(/^'([^']*)'::/);
  if (enumLiteral) return `default: '${enumLiteral[1].replaceAll("'", "\\'")}'`;
  if (/^(true|false|[-+]?\d+(\.\d+)?)$/.test(value)) return `default: ${value}`;
  return `default: \`${value.replaceAll('`', '')}\``;
}

const output = [];
output.push(`Project TEMO {\n  database_type: 'PostgreSQL'\n  Note: 'Modelo fisico de datos del Sistema de Transacciones Economicas de Miscelanea Olivera.'\n}`);

for (const [enumName, values] of enums) {
  output.push(`\nEnum temo.${quoteName(enumName)} {`);
  for (const value of values) output.push(`  ${quoteName(value.enumlabel)}`);
  output.push('}');
}

for (const table of tablesResult.rows) {
  const group = groupByTable.get(table.table_name);
  const options = group ? ` [headercolor: ${group.color}]` : '';
  output.push(`\nTable temo.${quoteName(table.table_name)}${options} {`);
  const constraints = constraintsByTable.get(table.table_name) || [];
  const singlePrimary = constraints.find((item) => item.constraint_type === 'PRIMARY KEY' && item.columns.length === 1);
  const singleUnique = new Set(
    constraints
      .filter((item) => item.constraint_type === 'UNIQUE' && item.columns.length === 1)
      .map((item) => item.columns[0]),
  );
  for (const column of columnsByTable.get(table.table_name) || []) {
    const options = [];
    if (singlePrimary?.columns[0] === column.column_name) options.push('pk');
    if (singleUnique.has(column.column_name)) options.push('unique');
    if (column.is_nullable === 'NO' && singlePrimary?.columns[0] !== column.column_name) options.push('not null');
    const defaultValue = defaultOption(column.column_default);
    if (defaultValue) options.push(defaultValue);
    output.push(`  ${quoteName(column.column_name)} ${columnType(column)}${options.length ? ` [${options.join(', ')}]` : ''}`);
  }
  const compoundConstraints = constraints.filter((item) => item.columns.length > 1);
  if (compoundConstraints.length) {
    output.push('');
    output.push('  indexes {');
    for (const constraint of compoundConstraints) {
      const kind = constraint.constraint_type === 'PRIMARY KEY' ? 'pk' : 'unique';
      output.push(`    (${constraint.columns.map(quoteName).join(', ')}) [${kind}, name: '${constraint.constraint_name}']`);
    }
    output.push('  }');
  }
  if (table.comment) output.push(`  Note: '${table.comment.replaceAll("'", "\\'")}'`);
  output.push('}');
}

const actionNames = { a: 'No action', r: 'Restrict', c: 'Cascade', n: 'Set null', d: 'Set default' };
for (const foreignKey of foreignKeysResult.rows) {
  const source = foreignKey.source_columns.length === 1
    ? quoteName(foreignKey.source_columns[0])
    : `(${foreignKey.source_columns.map(quoteName).join(', ')})`;
  const target = foreignKey.target_columns.length === 1
    ? quoteName(foreignKey.target_columns[0])
    : `(${foreignKey.target_columns.map(quoteName).join(', ')})`;
  const options = [
    `delete: ${actionNames[foreignKey.delete_action]}`,
    `update: ${actionNames[foreignKey.update_action]}`,
  ];
  output.push(
    `Ref ${quoteName(foreignKey.constraint_name)}: temo.${quoteName(foreignKey.source_table)}.${source} > ` +
    `temo.${quoteName(foreignKey.target_table)}.${target} [${options.join(', ')}]`,
  );
}

for (const group of groups) {
  const existingTables = group.tables.filter((table) => tablesResult.rows.some((item) => item.table_name === table));
  if (!existingTables.length) continue;
  output.push(`\nTableGroup "${group.name}" {`);
  for (const table of existingTables) output.push(`  temo.${quoteName(table)}`);
  output.push('}');
}

const ungrouped = tablesResult.rows
  .map((table) => table.table_name)
  .filter((table) => !groupByTable.has(table));
if (ungrouped.length) {
  output.push('\nTableGroup "07 - Sin clasificar" {');
  for (const table of ungrouped) output.push(`  temo.${quoteName(table)}`);
  output.push('}');
}

const destination = path.join(root, 'docs', '03-modelo-datos-temo.dbml');
await fs.writeFile(destination, `${output.join('\n')}\n`, 'utf8');
console.log(`DBML generado: ${destination}`);
console.log(`${tablesResult.rowCount} tablas, ${columnsResult.rowCount} columnas y ${foreignKeysResult.rowCount} relaciones.`);
