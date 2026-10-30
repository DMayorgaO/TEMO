import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonth, cashierCounts, filterCounts, selectDayRange, weekdayLabel } from '../src/components/admin-dashboard-data.ts';

const rows = [
  { day: '2026-10-25', branch_id: 'a', branch: 'Sucursal A', cashier_id: 'one', cashier: 'Uno', entity: 'BAC', nio: 2, usd: 3, total: 5 },
  { day: '2026-10-26', branch_id: 'a', branch: 'Sucursal A', cashier_id: 'one', cashier: 'Uno', entity: 'BAC', nio: 7, usd: 11, total: 18 },
  { day: '2026-10-27', branch_id: 'a', branch: 'Sucursal A', cashier_id: 'one', cashier: 'Uno', entity: 'BANPRO', nio: 13, usd: 17, total: 30 },
  { day: '2026-10-26', branch_id: 'b', branch: 'Sucursal B', cashier_id: 'one', cashier: 'Uno', entity: 'BAC', nio: 19, usd: 23, total: 42 },
];
const data = { counts: rows, balances: [] };

test('selected days sum both currencies by cashier and branch without counting duplicates', () => {
  const result = cashierCounts(data, rows, ['2026-10-25', '2026-10-26', '2026-10-25']);
  assert.deepEqual(result.map(row => [row.branch_id, row.nio, row.usd, row.total]), [['a', 9, 14, 23], ['b', 19, 23, 42]]);
  assert.equal(cashierCounts(data, rows, '2026-10-27')[0].total, 30);
  assert.ok(cashierCounts(data, rows, []).every(row => row.total === 0));
});

test('multi-day sums preserve bank and currency filters', () => {
  const result = cashierCounts(data, filterCounts(rows, ['BAC'], ['USD']), rows.map(row => row.day));
  assert.deepEqual(result.map(row => [row.nio, row.usd, row.total]), [[0, 14, 14], [0, 23, 23]]);
});

test('drag selection includes intermediate days in either direction including zero-count days', () => {
  const days = ['2026-10-25', '2026-10-26', '2026-10-27'];
  assert.deepEqual(selectDayRange(days, 0, 2), days);
  assert.deepEqual(selectDayRange(days, 2, 0), days);
  assert.deepEqual(selectDayRange(days, 1, 1), [days[1]]);
  assert.deepEqual(selectDayRange([], 0, 0), []);
});

test('weekday labels use calendar date without local timezone shifts', () => {
  assert.deepEqual(['25', '26', '27', '28', '29', '30', '31'].map(day => weekdayLabel(`2026-10-${day}`)), ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']);
});

test('full-month range respects leap years, year boundaries and UTC calendar dates',()=>{
  for(const [day,from,to]of [['2026-10-29','2026-10-01','2026-10-31'],['2028-02-29','2028-02-01','2028-02-29'],['2026-02-12','2026-02-01','2026-02-28'],['2026-12-31','2026-12-01','2026-12-31'],['0099-01-30','0099-01-01','0099-01-31']])assert.deepEqual(calendarMonth(day),{from,to});
});
