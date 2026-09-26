import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Executes the real summary SQL against CTE fixtures inside a read-only transaction.
const source = readFileSync(new URL('../backend/src/modules/shifts/shifts.service.ts', import.meta.url), 'utf8');
const summary = source.slice(source.indexOf('private async loadCashSummary'));
const sql = summary.match(/`(select[\s\S]*?)`/)[1].replace(/temo\./g, '');
const tables = {
  turnos: 'id_turno text, efectivo_inicial_nio numeric, efectivo_inicial_usd numeric',
  monedas: 'id_moneda text, codigo text',
  transacciones: 'id_transaccion text, id_turno text, estado text',
  transacciones_montos: 'id_transaccion text, id_moneda text, direccion text, medio text, monto numeric',
  abonos_pendientes: 'id_pendiente text, id_turno_aplicacion text, id_moneda text, monto numeric, observaciones text',
  pagos_pendientes: 'id_pendiente text, id_transaccion text, id_moneda text, tipo text, estado text, saldo_pendiente numeric',
  movimientos_efectivo: 'id_turno text, id_moneda text, id_abono_pendiente text, direccion text, monto numeric, es_reverso boolean',
  transferencias: 'id_turno text, id_moneda text, direccion text, monto numeric, tipo text, estado text',
};
const ctes = Object.entries(tables).map(([name, columns]) =>
  `${name} as (select * from jsonb_to_recordset($2::jsonb->'${name}') as fixture(${columns}))`,
).join(',');
function base() {
  return {
    ...Object.fromEntries(Object.keys(tables).map((key) => [key, []])),
    turnos: [{ id_turno: 'shift', efectivo_inicial_nio: 0, efectivo_inicial_usd: 0 }],
    monedas: [{ id_moneda: 'nio', codigo: 'NIO' }, { id_moneda: 'usd', codigo: 'USD' }],
  };
}
function cash(amount, direction = 'ENTRA', currency = 'nio') {
  return { id_turno: 'shift', id_moneda: currency, id_abono_pendiente: 'payment', monto: amount, direccion: direction, es_reverso: false };
}
const compensation = base();
compensation.transacciones = [1, 2].map((n) => ({ id_transaccion: String(n), id_turno: 'shift', estado: 'REGISTRADA' }));
compensation.transacciones_montos = [
  { id_transaccion: '1', id_moneda: 'nio', direccion: 'SALE', medio: 'EFECTIVO', monto: 380 },
  { id_transaccion: '2', id_moneda: 'nio', direccion: 'ENTRA', medio: 'EFECTIVO', monto: 200 },
];
compensation.pagos_pendientes = [{ id_pendiente: 'pending', tipo: 'POR_COBRAR', estado: 'PAGADO', saldo_pendiente: 0 }];
compensation.abonos_pendientes = [{
  id_pendiente: 'pending', id_turno_aplicacion: 'shift', id_moneda: 'nio', monto: 180,
  observaciones: 'Compensación con saldo a favor de una transacción en curso',
}];
const received = base();
received.movimientos_efectivo = [cash(200), cash(20, 'SALE')];
const paid = base();
paid.movimientos_efectivo = [cash(180, 'SALE')];
const dollars = base();
dollars.movimientos_efectivo = [cash(10, 'ENTRA', 'usd'), cash(5, 'SALE')];
const digital = base();
digital.abonos_pendientes = [{ id_pendiente: 'pending', id_turno_aplicacion: 'shift', id_moneda: 'nio', monto: 180, observaciones: 'Liquidacion digital' }];
digital.pagos_pendientes = compensation.pagos_pendientes;

assert.ok(process.env.TEMO_TEST_DATABASE_URL, 'Set TEMO_TEST_DATABASE_URL to a PostgreSQL connection');
const client = new pg.Client({ connectionString: process.env.TEMO_TEST_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin read only');
  for (const [name, fixture, nio, usd] of [
    ['380 withdrawal + 180 compensation + 200 deposit', compensation, 0, 0],
    ['cash receipt with change counted once', received, 180, 0],
    ['cash payout', paid, -180, 0],
    ['USD cash with NIO change', dollars, -5, 10],
    ['digital settlement without physical cash', digital, 0, 0],
  ]) {
    const result = await client.query(`with ${ctes} ${sql}`, ['shift', JSON.stringify(fixture)]);
    const amounts = Object.fromEntries(result.rows.map((row) => [row.currency, Number(row.expected_amount)]));
    assert.deepEqual(amounts, { NIO: nio, USD: usd }, name);
    console.log(`PASS: ${name}`);
  }
} finally {
  await client.query('rollback');
  await client.end();
}
