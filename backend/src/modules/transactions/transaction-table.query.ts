import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { AuthenticatedUser } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { requireTransactionReader } from '../../common/read-query';

const integer = z.string().regex(/^(0|[1-9][0-9]*)$/).transform(Number);
const date = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).refine(v =>
  v.slice(0, 4) !== '0000' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const text = z.string().max(200);
const columns = ['id', 'registeredAt', 'entity', 'movement', 'amount', 'pendingName', 'operatorBranch'] as const;
export const transactionTableSchema = z.object({
  limit: integer.pipe(z.number().int().min(1).max(200)).optional().default(10),
  offset: integer.pipe(z.number().int().min(0).max(2147483647)).optional().default(0),
  search: text.optional(), currency: z.enum(['NIO', 'USD']).optional(),
  inactive: z.enum(['true', 'false']).optional().default('false'),
  startDate: date.optional(), endDate: date.optional(), startTime: time.optional(), endTime: time.optional(),
  sort: z.enum(columns).optional().default('id'), direction: z.enum(['asc', 'desc']).optional().default('desc'),
  id: text.optional(), registeredAt: text.optional(), entity: text.optional(), movement: text.optional(),
  amount: text.optional(), pendingName: text.optional(), operatorBranch: text.optional(),
}).strict();

export function parseTransactionTable(value: unknown) {
  const parsed = transactionTableSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Los filtros de transacciones no son validos.');
  return parsed.data;
}

// Display corrections are applied BEFORE filters, ordering and totals. Ledger rows are never changed.
const source = `select t.id_transaccion as database_id,
  concat('TRA-', lpad(g.codigo_operacion::text,6,'0'),'-',lpad(t.orden_grupo::text,2,'0')) as id,
  g.id_grupo_transacciones, g.codigo_operacion, g.version_edicion::text as edit_version,
  t.orden_grupo, t.fecha_transaccion,
  coalesce(h.proyeccion->>'monto', coalesce(tm.monto,t.monto_original)::text)::numeric as monto,
  coalesce(h.proyeccion->>'moneda',mm.codigo,m.codigo) as moneda,
  coalesce(h.proyeccion->>'direccion',tm.direccion::text,ef.direccion_efectivo::text,'ENTRA') as direccion,
  case when h.anulada then 'ANULADA' else t.estado::text end as estado,
  coalesce(h.proyeccion->>'entidad',e.codigo) as entidad,
  coalesce(h.proyeccion->>'codigo_movimiento',cm.codigo_operativo) as codigo_movimiento,
  coalesce(h.proyeccion->>'movimiento',cm.nombre_operativo) as movimiento,
  u.nombre_completo as cajero, s.nombre as sucursal,
  coalesce(h.proyeccion->>'pendiente',cp.nombre) as pendiente,
  pp.id_pendiente as pending_database_id, pp.tipo as pending_type, pp.estado as pending_status,
  pp.saldo_pendiente as pending_balance, coalesce(h.proyeccion->>'descripcion',t.descripcion,'') as descripcion
from temo.transacciones t
join temo.grupos_transacciones g on g.id_grupo_transacciones=t.id_grupo_transacciones
join temo.monedas m on m.id_moneda=t.id_moneda_original
join temo.cuentas_movimientos cm on cm.id_cuenta_movimiento=t.id_cuenta_movimiento
join temo.efectos_movimientos ef on ef.id_cuenta_movimiento=cm.id_cuenta_movimiento
join temo.cuentas_bancarias cb on cb.id_cuenta=cm.id_cuenta
join temo.entidades_bancarias e on e.id_entidad=cb.id_entidad
join temo.usuarios u on u.id_usuario=t.id_cajero
join temo.turnos tu on tu.id_turno=t.id_turno
join temo.sucursales s on s.id_sucursal=t.id_sucursal
left join lateral (
  select direccion,monto,id_moneda from temo.transacciones_montos
  where id_transaccion=t.id_transaccion and medio='EFECTIVO' order by fecha_creacion desc limit 1
) tm on true
left join temo.monedas mm on mm.id_moneda=tm.id_moneda
left join temo.pagos_pendientes pp on pp.id_transaccion=t.id_transaccion and pp.estado<>'CANCELADO'
left join temo.contrapartes cp on cp.id_contraparte=pp.id_contraparte
left join temo.correcciones_transacciones_cerradas h on h.id_transaccion=t.id_transaccion
where ($1='JEFA' or (t.id_cajero=$2::uuid and tu.estado in ('ABIERTO','PENDIENTE_APROBACION','EN_REVISION')))`;

const localDate = `(fecha_transaccion at time zone 'America/Managua')`;
const display: Record<typeof columns[number], string> = {
  id: 'id', registeredAt: `to_char(${localDate},'DD/MM/YYYY HH24:MI')`, entity: 'entidad',
  movement: `concat_ws(' ',movimiento,codigo_movimiento)`,
  amount: `concat(case when moneda='USD' then '$ ' else 'C$ ' end,to_char(monto,'FM999,999,999,999,990.00'))`,
  pendingName: `coalesce(pendiente,'')`, operatorBranch: `concat(cajero,E'\n',sucursal)`,
};
const order: Record<typeof columns[number], string> = {
  id: 'codigo_operacion', registeredAt: 'fecha_transaccion', entity: 'entidad', movement: 'movimiento',
  amount: 'monto', pendingName: 'pendiente', operatorBranch: 'cajero',
};

export function buildTransactionTableQuery(input: ReturnType<typeof parseTransactionTable>, user: AuthenticatedUser, exportAll = false) {
  requireTransactionReader(user);
  const params: unknown[] = [user.roleCode, user.id];
  const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
  const conditions: string[] = [];
  if (input.inactive !== 'true') conditions.push(`estado<>'ANULADA'`);
  if (input.currency) conditions.push(`moneda=${bind(input.currency)}`);
  for (const key of columns) if (input[key]) conditions.push(`strpos(lower(${display[key]}),lower(${bind(input[key])}::text))>0`);
  if (input.search?.trim()) conditions.push(`strpos(lower(concat_ws(' ',${Object.values(display).join(',')},
    descripcion,moneda,case when direccion='SALE' then 'Salida' else 'Ingreso' end,
    case when estado='ANULADA' then 'Anulada' else 'Registrada' end,monto::text)),lower(${bind(input.search.trim())}::text))>0`);
  if (input.startDate) conditions.push(`${localDate}::date>=${bind(input.startDate)}::date`);
  if (input.endDate) conditions.push(`${localDate}::date<=${bind(input.endDate)}::date`);
  if (input.startTime) conditions.push(`to_char(${localDate},'HH24:MI')>=${bind(input.startTime)}`);
  if (input.endTime) conditions.push(`to_char(${localDate},'HH24:MI')<=${bind(input.endTime)}`);
  const sorting = `${order[input.sort]} ${input.direction}, orden_grupo ${input.direction}, database_id ${input.direction}`;
  const sql = `with source as (${source}), filtered as materialized (
    select * from source ${conditions.length ? `where ${conditions.join(' and ')}` : ''}
  ), page as (select * from filtered order by ${sorting} limit ${bind(exportAll ? 5001 : input.limit)} offset ${bind(exportAll ? 0 : input.offset)})
  select (select count(*)::int from filtered) as total,
    (select coalesce(jsonb_object_agg(moneda,amounts),'{}'::jsonb) from (
      select moneda,jsonb_build_object('income',coalesce(sum(monto) filter(where direccion<>'SALE' and estado<>'ANULADA'),0)::text,
        'expense',coalesce(sum(monto) filter(where direccion='SALE' and estado<>'ANULADA'),0)::text) as amounts from filtered group by moneda
    ) totals) as totals,
    coalesce((select jsonb_agg(to_jsonb(page) || jsonb_build_object('monto',monto::text,
      'pending_balance',pending_balance::text) order by ${sorting}) from page),'[]'::jsonb) as rows`;
  return { sql, params };
}

export async function readTransactionTable(db: DatabaseService, user: AuthenticatedUser, query: unknown, exportAll = false) {
  requireTransactionReader(user);
  const input = parseTransactionTable(query);
  const { sql, params } = buildTransactionTableQuery(input, user, exportAll);
  const result = await db.query(sql, params);
  return result.rows[0] as { total: number; totals: Record<string, { income: string; expense: string }>; rows: Record<string, unknown>[] };
}
