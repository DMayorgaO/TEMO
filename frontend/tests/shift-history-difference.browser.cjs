const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { transactionTableFixture } = require('./transaction-table-fixture.cjs');
const id = '11111111-1111-4111-8111-111111111111';
const user = { id, fullName: 'ADMIN QA', roleCode: 'JEFA', roleName: 'Administrador', permissions: ['VER_SHIFTS', 'VER_CASH_COUNT'] };
const cash = { NIO: { total: 1000, lines: [{ denomination: 100, piles25: 0, loose: 10 }] }, USD: { total: 10, lines: [{ denomination: 10, piles25: 0, loose: 1 }] } };
const shift = { database_id: id, id: 'TUR-000001', estado: 'CERRADO', id_sucursal: id, sucursal: 'SUCURSAL QA', caja: 'Caja QA', cajero: 'CAJERA QA', fecha_apertura: '2026-11-19T14:00:00Z', fecha_cierre: '2026-11-19T23:00:00Z', cambio_nio: '0', efectivo_inicial_nio: '1000', efectivo_inicial_usd: '10', efectivo_final_nio: '1000', efectivo_final_usd: '10', cashCounts: { APERTURA: cash, CIERRE_CONTADO: cash, ACTUAL: cash }, expectedCash: { NIO: 1000, USD: 0 }, expectedGeneralRate: 36.4, pendingCash: { NIO: 0, USD: 0 }, availableAccounts: [], availableMovements: [], balances: [], dollarPurchases: { differenceNio: 60 } };
(async () => {
 const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
 try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, timezoneId: 'America/Managua' });
  await context.addInitScript(user => { sessionStorage.setItem('temo:auth-token', 'synthetic-history'); sessionStorage.setItem('temo:auth-user', JSON.stringify(user)); }, user);
  const errors = [], writes = [];
  await context.route('**/api/**', async route => {
   const request = route.request(), p = new URL(request.url()).pathname.replace(/^.*\/api/, ''); let body = [];
   if (request.method() !== 'GET') writes.push(p);
   if (p === '/auth/me') body = { user };
   else if (p === '/shifts') body = [shift];
   else if (p === '/shifts/current' || p === `/shifts/${id}`) body = shift;
   else if (p === '/catalogs/sucursales') body = [{ id_sucursal: id, nombre: shift.sucursal, estado: 'ACTIVO' }];
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(transactionTableFixture(request.url(), body)) });
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  for (const [expected, registered, tone, nio, usd] of [[1000, 0, 'surplus', '364.00', '10.00'], [1728, 0, 'shortage', '364.00', '10.00'], [1000, 364, 'ok', '---', '---'], [1000, 182, 'surplus', '182.00', '5.00'], [1728, -364, 'ok', '---', '---']]) {
   shift.expectedCash.NIO = expected; shift.cambio_nio = String(registered);
   await page.goto('http://127.0.0.1:3188/#/turnos');
   const row = page.locator('tbody tr').filter({ hasText: shift.id });
   if (!await row.count()) await page.getByText('Mostrar inactivos', { exact: true }).click();
   await row.dblclick();
   await page.getByRole('button', { name: 'Cierre', exact: true }).click();
   const difference = page.getByLabel('Diferencia final de efectivo');
   await difference.waitFor({ state: 'visible' });
   assert.equal(await difference.locator('.difference-badge--' + tone).count(), 2);
   assert.ok((await difference.locator('[data-money-currency="NIO"]').innerText()).includes(nio));
   assert.ok((await difference.locator('[data-money-currency="USD"]').innerText()).includes(usd));
   assert.equal(await difference.locator('input').count(), 0);
   if (registered === 0 && expected === 1000) {
    for (const width of [1366, 1920]) {
     await page.setViewportSize({ width, height: width === 1366 ? 768 : 1080 });
     await difference.scrollIntoViewIfNeeded();
     const bounds = await difference.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
     await page.screenshot({ path: `tmp/shift-history-difference-${width}.png` });
    }
   }
   const historyValues = await difference.innerText();
   await page.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
   await page.goto('http://127.0.0.1:3188/#/arqueo');
   await page.locator('.cash-history summary').click();
   await page.getByLabel('Arqueo histórico', { exact: true }).selectOption(id);
   await page.locator('.cash-count-live-grid').waitFor();
   const cashDifference = page.locator('.cash-count-live-grid .cash-count-adjustments');
   await cashDifference.locator('div[data-money-currency]').first().waitFor({ state: 'visible' });
   const cashValues = (await cashDifference.locator('div[data-money-currency]').allInnerTexts()).join('\n');
   assert.equal(historyValues.replace(/\s+/g, ' '), cashValues.replace(/\s+/g, ' '), 'History matches Arqueo');
  }
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  console.log('Historical shift difference: surplus, shortage, recognized +/- and partial change; two viewports; no writes.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
