import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { preferentialCashAdjustment, preferentialGroupMarker } = require('../backend/dist/common/preferential-cash.js');
const row = (currency, direction, amount, extra = {}) => ({
  group_id: 'D', currency, direction, amount: String(amount), buy_rate: '36.55', sell_rate: '37',
  primary_nio: '0', primary_usd: '0', change_nio: '0', change_usd: '0', ...extra,
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);
const audit = [row('USD', 'SALE', 1138.5), row('NIO', 'ENTRA', 18275), row('NIO', 'ENTRA', 18275), row('USD', 'ENTRA', 188, { primary_nio: '1832' })];
close(preferentialCashAdjustment(audit, 36.4), -150);
close(preferentialCashAdjustment([row('USD', 'SALE', 100, { primary_usd: '100' })], 36.4), 0);
close(preferentialCashAdjustment([row('USD', 'ENTRA', 100, { primary_nio: '3700' })], 36.4), 0);
close(preferentialCashAdjustment([row('NIO', 'ENTRA', 3655, { primary_usd: '100' })], 36.4), -15);
close(preferentialCashAdjustment([row('USD', 'SALE', 100, { primary_nio: '3655' })], 36.4), -15);
close(preferentialCashAdjustment([row('USD', 'SALE', 100, { change_nio: '3655' })], 36.4), -15);
close(preferentialCashAdjustment([row('NIO', 'ENTRA', 3655, { primary_nio: '3655' })], 36.4), 0);
close(preferentialCashAdjustment([...audit, ...audit.map(r => ({ ...r, group_id: 'D2' }))], 36.4), -300);
close(preferentialCashAdjustment([], 36.4), 0);
console.log('PASS: preferential conversions, ordinary cash, USD sale, change and independent groups');
if (process.env.AUDIT_DB) {
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.AUDIT_DB, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query('BEGIN READ ONLY');
    const source = readFileSync(new URL('../backend/src/modules/shifts/shifts.service.ts', import.meta.url), 'utf8');
    const sql = source.slice(source.indexOf('const preferentialRows =')).match(/`([\s\S]*?)`/)[1];
    const rows = (await c.query(sql, ['d2231efd-9075-48c5-b879-6eb008712edd', preferentialGroupMarker])).rows;
    const group = rows.filter(r => r.group_id === '69fb7080-1f32-4d89-9005-90621d9846e0');
    assert.equal(group.length, 4);
    close(preferentialCashAdjustment(group, 36.4), -150);
    console.log('PASS: actual persisted TRA-001262 SQL gives correction -150 NIO (read only)');
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}
