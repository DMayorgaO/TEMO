import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import { instance } from '@viz-js/viz';

const { Client } = pg;
const root = path.resolve(import.meta.dirname, '..');
const envText = await fs.readFile(path.join(root, '.env'), 'utf8');
const env = Object.fromEntries(
  envText.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);
const client = new Client({ connectionString: process.env.DATABASE_URL || env.DATABASE_URL });
await client.connect();

const tables = (await client.query(`
  select table_name
  from information_schema.tables
  where table_schema = 'temo' and table_type = 'BASE TABLE'
  order by table_name
`)).rows;
const columns = (await client.query(`
  select c.table_name, c.column_name, c.ordinal_position,
         case
           when c.data_type = 'USER-DEFINED' then c.udt_name
           when c.data_type = 'character varying' then 'varchar(' || c.character_maximum_length || ')'
           when c.data_type = 'timestamp with time zone' then 'timestamptz'
           when c.data_type = 'numeric' then 'decimal(' || c.numeric_precision || ',' || c.numeric_scale || ')'
           else c.data_type
         end as data_type,
         c.is_nullable,
         exists (
           select 1
           from information_schema.table_constraints tc
           join information_schema.key_column_usage kcu
             on kcu.constraint_schema = tc.constraint_schema
            and kcu.constraint_name = tc.constraint_name
           where tc.table_schema = c.table_schema
             and tc.table_name = c.table_name
             and tc.constraint_type = 'PRIMARY KEY'
             and kcu.column_name = c.column_name
         ) as is_primary,
         exists (
           select 1
           from information_schema.table_constraints tc
           join information_schema.key_column_usage kcu
             on kcu.constraint_schema = tc.constraint_schema
            and kcu.constraint_name = tc.constraint_name
           where tc.table_schema = c.table_schema
             and tc.table_name = c.table_name
             and tc.constraint_type = 'FOREIGN KEY'
             and kcu.column_name = c.column_name
         ) as is_foreign
  from information_schema.columns c
  where c.table_schema = 'temo'
  order by c.table_name, c.ordinal_position
`)).rows;
const foreignKeys = (await client.query(`
  select source.relname as source_table,
         source_att.attname as source_column,
         target.relname as target_table,
         target_att.attname as target_column
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
  order by source.relname, con.conname, source_key.ordinality
`)).rows;
await client.end();

const groups = [
  ['Seguridad y acceso', '#17324D', ['roles', 'permisos', 'roles_permisos', 'usuarios', 'usuarios_sucursales', 'dispositivos']],
  ['Catalogos maestros', '#176B5B', ['entidades_bancarias', 'monedas', 'sucursales', 'cajas', 'cuentas_bancarias', 'cuentas_sucursales', 'movimientos', 'cuentas_movimientos', 'efectos_movimientos', 'denominaciones', 'metodos_pago', 'tipos_cambio', 'reglas_comisiones', 'contrapartes']],
  ['Jornadas, turnos y saldos', '#1D4ED8', ['jornadas', 'turnos', 'arqueos', 'arqueos_denominaciones', 'saldos_jornada_cuentas', 'saldos_turno_cuentas', 'solicitudes_cierre_turno', 'cierres_diarios', 'cierres_diarios_detalles']],
  ['Transacciones y pendientes', '#8A5A00', ['grupos_transacciones', 'transacciones', 'transacciones_montos', 'movimientos_efectivo', 'movimientos_cuentas', 'transacciones_comisiones', 'pagos_pendientes', 'abonos_pendientes', 'historial_pendientes', 'anulaciones_transacciones', 'correcciones_transacciones']],
  ['Transferencias internas', '#6D28D9', ['transferencias', 'transferencias_denominaciones']],
  ['Control, auditoria e importacion', '#9F1239', ['bitacora', 'aprobaciones', 'notificaciones_usuarios', 'importaciones_excel', 'importaciones_excel_filas', 'importaciones_excel_errores', 'migraciones_sistema']],
];
const tableGroup = new Map(groups.flatMap((group) => group[2].map((table) => [table, group])));
const columnsByTable = Map.groupBy(columns, (column) => column.table_name);

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function nodeId(table) {
  return `table_${table.replaceAll(/[^a-zA-Z0-9_]/g, '_')}`;
}
function tableLabel(table) {
  const group = tableGroup.get(table);
  const color = group?.[1] || '#334155';
  const rows = (columnsByTable.get(table) || []).map((column) => {
    const key = `${column.is_primary ? 'PK' : ''}${column.is_primary && column.is_foreign ? ' / ' : ''}${column.is_foreign ? 'FK' : ''}`;
    const keyColor = column.is_primary ? '#FDE68A' : column.is_foreign ? '#BFDBFE' : '#F8FAFC';
    return `<TR><TD ALIGN="LEFT" BGCOLOR="${keyColor}"><FONT POINT-SIZE="8"><B>${key || ' '}</B></FONT></TD>` +
      `<TD PORT="${escapeHtml(column.column_name)}" ALIGN="LEFT"><B>${escapeHtml(column.column_name)}</B></TD>` +
      `<TD ALIGN="LEFT"><FONT COLOR="#475569">${escapeHtml(column.data_type)}${column.is_nullable === 'YES' ? '?' : ''}</FONT></TD></TR>`;
  }).join('');
  return `<<TABLE BORDER="1" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4" COLOR="#94A3B8" BGCOLOR="white">` +
    `<TR><TD COLSPAN="3" BGCOLOR="${color}"><FONT COLOR="white" POINT-SIZE="12"><B>${escapeHtml(table)}</B></FONT></TD></TR>${rows}</TABLE>>`;
}

const dot = [];
dot.push('digraph TEMO {');
dot.push('  graph [rankdir=LR, bgcolor="#F8FAFC", pad="0.4", nodesep="0.35", ranksep="1.2", splines=polyline, outputorder=edgesfirst];');
dot.push('  node [shape=plain, fontname="Arial"];');
dot.push('  edge [color="#94A3B8", arrowsize=0.65, penwidth=1.0];');
for (const [index, group] of groups.entries()) {
  const existing = group[2].filter((name) => tables.some((table) => table.table_name === name));
  if (!existing.length) continue;
  dot.push(`  subgraph cluster_${index} {`);
  dot.push(`    label="${group[0]}"; color="${group[1]}"; fontcolor="${group[1]}"; penwidth=2; style="rounded";`);
  for (const table of existing) dot.push(`    ${nodeId(table)} [label=${tableLabel(table)}];`);
  dot.push('  }');
}
for (const table of tables.map((item) => item.table_name).filter((name) => !tableGroup.has(name))) {
  dot.push(`  ${nodeId(table)} [label=${tableLabel(table)}];`);
}
for (const foreignKey of foreignKeys) {
  dot.push(`  ${nodeId(foreignKey.source_table)}:"${foreignKey.source_column}":e -> ${nodeId(foreignKey.target_table)}:"${foreignKey.target_column}":w;`);
}
dot.push('}');

const docs = path.join(root, 'docs');
await fs.mkdir(docs, { recursive: true });
await fs.writeFile(path.join(docs, '03-modelo-datos-temo.dot'), `${dot.join('\n')}\n`, 'utf8');
const viz = await instance();
const svg = viz.renderString(dot.join('\n'), { format: 'svg', engine: 'dot' });
await fs.writeFile(path.join(docs, '03-modelo-datos-temo.svg'), svg, 'utf8');

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Modelo de Datos TEMO</title><style>
html,body{height:100%;margin:0;background:#0f172a;font-family:Arial,sans-serif;overflow:hidden}.toolbar{position:fixed;z-index:2;top:12px;left:12px;display:flex;gap:8px;align-items:center;background:#fff;padding:8px 10px;border-radius:6px;box-shadow:0 4px 18px #0004}.toolbar strong{margin-right:8px;color:#17324d}.toolbar button{height:32px;min-width:34px;border:1px solid #cbd5e1;background:#fff;border-radius:5px;font-size:16px;cursor:pointer}.viewport{width:100%;height:100%;overflow:auto}.canvas{padding:70px 30px 30px}.canvas svg{display:block;max-width:none}
</style></head><body><div class="toolbar"><strong>Modelo de Datos TEMO</strong><button onclick="zoom(.8)" title="Alejar">−</button><button onclick="zoom(1.25)" title="Acercar">+</button><button onclick="fitWidth()" title="Ajustar al ancho">Ancho</button><button onclick="fitAll()" title="Mostrar el modelo completo">Todo</button><span id="level"></span></div><div class="viewport" id="viewport"><div class="canvas" id="canvas">${svg}</div></div><script>
let scale=1;const canvas=document.getElementById('canvas'),viewport=document.getElementById('viewport'),svg=canvas.querySelector('svg'),level=document.getElementById('level'),viewBox=svg.viewBox.baseVal,baseWidth=viewBox.width,baseHeight=viewBox.height;function apply(){svg.style.width=(baseWidth*scale)+'px';svg.style.height=(baseHeight*scale)+'px';level.textContent=Math.round(scale*100)+'%'}function zoom(f){scale=Math.max(.03,Math.min(3,scale*f));apply()}function fitWidth(){scale=(viewport.clientWidth-60)/baseWidth;apply();viewport.scrollTo(0,0)}function fitAll(){scale=Math.min((viewport.clientWidth-60)/baseWidth,(viewport.clientHeight-100)/baseHeight);apply();viewport.scrollTo(0,0)}window.addEventListener('load',fitWidth);
</script></body></html>`;
await fs.writeFile(path.join(docs, '03-modelo-datos-temo.html'), html, 'utf8');
console.log(`ERD generado con ${tables.length} tablas, ${columns.length} columnas y ${foreignKeys.length} relaciones.`);
