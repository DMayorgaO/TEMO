import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nioCentCoins, withNioCentCoins } from '../src/utils/nio-cent-coins.ts';

const app=readFileSync(new URL('../src/pages/App.tsx',import.meta.url),'utf8');
test('shared NIO denomination list includes both cent coins after one cordoba; USD unchanged',()=>{
  const section=app.slice(app.indexOf('const cashDenominations:'),app.indexOf('const defaultExchangeRate:'));
  const nio=section.slice(0,section.indexOf('USD:'));
  assert.match(nio,/value: 1,.*\s*\.\.\.nioCentCoins/);
  assert.deepEqual(nioCentCoins.map(coin=>coin.value),[.5,.25]);
  assert.doesNotMatch(section.slice(section.indexOf('USD:')),/value: 0\./);
});
test('legacy handover cash summaries show cent coins with zero quantities without mutating stored data',()=>{
  const lines=[{denomination:1,piles25:0,loose:3}];
  const expanded=withNioCentCoins('NIO',lines);
  assert.deepEqual(expanded.map(line=>line.denomination),[1,.5,.25]);
  assert.deepEqual(lines,[{denomination:1,piles25:0,loose:3}]);
  assert.equal(withNioCentCoins('NIO',expanded).length,3);
  assert.equal(withNioCentCoins('USD',lines),lines);
});
test('minor rounding popup removed without removing unrelated pending validation',()=>{
  assert.ok(!app.includes('Diferencia minima permitida'));
  assert.ok(!app.includes('Existe una diferencia de redondeo de'));
  assert.ok(app.includes('Pendiente sin efectivo'));
});
test('Teledolar turn forms use same labels and field mapping as balance table',()=>{
  assert.ok(app.includes('<span>Pagos acumulados<strong>{formatCashCountMoney(parseMoneyValue(balances[`${account.id}:income`])'));
  assert.ok(app.includes('<span>Envíos acumulados<strong>{formatCashCountMoney(parseMoneyValue(balances[`${account.id}:expense`])'));
  assert.ok(!app.includes('Ingresos acumulados'));
  assert.ok(!app.includes('Egresos acumulados'));
  assert.match(app,/<label>Pagos<span[^\n]*\n\s*value=\{formatConsolidationInput\(balances\[`\$\{account.id\}:income`\]\)\}/);
  assert.match(app,/<label>Envíos<span[^\n]*\n\s*value=\{formatConsolidationInput\(balances\[`\$\{account.id\}:expense`\]\)\}/);
});
