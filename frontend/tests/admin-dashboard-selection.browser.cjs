// Synthetic dashboard only: every API request is intercepted; no business records change.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const days = Array.from({ length: 31 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`);
const user = { id: '11111111-1111-4111-8111-111111111111', fullName: 'ADMIN QA', roleCode: 'JEFA', roleName: 'Administrador', permissions: ['VER_DASHBOARD'] };
const counts = days.flatMap((day, index) => ['BAC', 'BANPRO'].map(entity => ({ day, branch_id: 'branch', branch: 'SUCURSAL QA', cashier_id: 'cashier', cashier: 'CAJERA QA', entity, nio: index + 1, usd: index + 1, total: 2 * (index + 1) })));
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, timezoneId: 'America/Managua' });
    await context.addInitScript(user => { sessionStorage.setItem('temo:auth-token', 'synthetic-dashboard-session'); sessionStorage.setItem('temo:auth-user', JSON.stringify(user)); }, user);
    await context.addInitScript(()=>{
      const fillRect=CanvasRenderingContext2D.prototype.fillRect,fillText=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillRect=function(...args){if(this.canvas.classList.contains('report-selectable-chart')&&args[0]===0&&args[1]===0)window.__monthCounts=[];return fillRect.apply(this,args);};
      CanvasRenderingContext2D.prototype.fillText=function(...args){if(this.canvas.classList.contains('report-selectable-chart')&&args[1]===0&&args[2]===0&&this.getTransform().b<0)(window.__monthCounts??=[]).push(String(args[0]));return fillText.apply(this,args);};
    });
    let requests = 0, extraCashiers = 0, sparse = false;
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url()), p = url.pathname.replace(/^.*\/api/, '');
      let body = [];
      if (p === '/auth/me') body = { user };
      else if (p === '/shifts/access') body = { active: null, prepared: null };
      else if (p === '/shifts/dashboard') {
        requests++;
        const roster = Array.from({ length: extraCashiers }, (_, index) => ({ ...counts[0], day: '2026-10-27', branch_id: `branch-${index % 3}`, branch: `SUCURSAL QA ${index % 3}`, cashier_id: `cashier-${index}`, cashier: `CAJERA QA ${String(index).padStart(2, '0')}`, nio: 0, usd: 0, total: 0 }));
        const activity = sparse ? [4, 7, 4].map((total, index) => ({ ...counts[0], day: days[24 + index], nio: total, usd: 0, total })) : counts;
        body = { today: '2026-10-27', tableDay: url.searchParams.get('day') || '2026-10-27', from: url.searchParams.get('from') || days[0], to: url.searchParams.get('to') || days[30], counts: [...activity, ...roster], banks: ['BAC', 'BANPRO'], accounts: [], balances: [], lafise: [], reconciliation: [] };
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3188/#/dashboard');
    const chart = page.locator('.report-selectable-chart');
    await chart.waitFor().catch(async error=>{
      await page.screenshot({path:path.resolve(__dirname,'../../tmp/dashboard-load-failure.png'),fullPage:true});
      console.error(JSON.stringify({url:page.url(),errors,body:(await page.locator('body').innerText()).slice(0,1200)}));
      throw error;
    });
    const table = page.locator('.report-top > section').first();
    const total = table.locator('h2 span');
    await assert.equal(await total.textContent(), '108');
    const bounds = await chart.boundingBox();
    const x = index => bounds.x + 38 + (bounds.width - 50) / 31 * (index + .5);
    const y = bounds.y + 85;
    const before = requests;
    await page.mouse.move(x(1), y); await page.mouse.down();
    await page.mouse.move(x(4), y, { steps: 8 }); await page.mouse.up();
    await page.getByRole('heading', { name: 'Transacciones de 4 d\u00edas 56' }).waitFor();
    assert.equal(await total.textContent(), '56');
    assert.equal(requests, before, 'Dragging sums existing data without network requests');
    await page.mouse.move(x(4), y);
    assert.match(await page.getByRole('tooltip').textContent(), /lun.*05\/10\/2026/);
    assert.match(await chart.getAttribute('aria-label'), /lun 2026-10-05: 20, seleccionado/);
    await page.screenshot({ path: path.resolve(__dirname, '../../tmp/dashboard-selected-range-1366.png'), fullPage: true });
    assert.ok(await page.locator('.report-chart-scroll').evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'A month fits the desktop chart without horizontal scrolling');
    await page.mouse.move(x(4), y); await page.mouse.down(); await page.mouse.move(x(1), y, { steps: 8 }); await page.mouse.up();
    assert.equal(await total.textContent(), '56');
    await page.getByRole('button', { name: 'Seleccionar todos los d\u00edas mostrados', exact: true }).click();
    assert.equal(await total.textContent(), '1984');
    await page.getByRole('button', { name: 'BAC', exact: true }).click();
    assert.equal(await total.textContent(), '992');
    await page.mouse.move(x(0), y); await page.mouse.down(); await page.mouse.up();
    assert.equal(await total.textContent(), '2');
    await chart.press('ArrowRight');
    assert.equal(await total.textContent(), '4');
    await chart.press('Shift+ArrowRight');
    assert.equal(await total.textContent(), '10');
    await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.report-top h2 span')?.textContent === '54');
    assert.equal(await page.getByRole('button', { name: 'Hoy', exact: true }).getAttribute('aria-pressed'), 'true');
    for (const [width, height] of [[1366, 768], [1920, 1080], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: path.resolve(__dirname, `../../tmp/dashboard-selection-${width}.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Chart scroll remains contained on narrow screens');
    }
    for (const [width, height] of [[1366, 768], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      for (const count of [3, 12, 24]) {
        extraCashiers = count - 1;
        await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
        await page.waitForFunction(count => document.querySelectorAll('.report-top tbody tr').length === count, count);
        await page.waitForTimeout(100);
        const tableScroll = table.locator('.report-table-scroll');
        assert.ok(await tableScroll.evaluate(e => e.scrollHeight <= e.clientHeight + 1), `All ${count} cashier/branch rows visible at ${width}`);
        const left = await table.boundingBox(), right = await page.locator('.report-chart').boundingBox(), drawing = await chart.boundingBox();
        assert.ok(Math.abs(left.height - right.height) < 2, 'Table and graph sections stay aligned');
        assert.ok(drawing.height >= 250, 'Graph grows above its previous fixed height');
        assert.ok(Math.abs((right.y + right.height) - (drawing.y + drawing.height) - 8) < 2, 'Chart fills the taller section without clipping');
        assert.ok(await chart.evaluate(e => e.height === Math.max(250, e.clientHeight) * 2), 'Canvas resolution follows its displayed height');
        assert.ok(await table.locator('tbody tr').last().evaluate(e => { const r = e.getBoundingClientRect(), parent = e.closest('.report-table-scroll').getBoundingClientRect(); return r.bottom <= parent.bottom + 1; }), 'Last row is not clipped');
        await page.screenshot({ path: path.resolve(__dirname, `../../tmp/dashboard-height-${width}-${count}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({width:1366,height:768});
    await page.getByLabel('Gráfica desde',{exact:true}).fill('2026-10-15');
    await page.waitForFunction(()=>!document.querySelector('.report-selectable-chart')?.getAttribute('aria-label').includes('2026-10-01'));
    await page.getByRole('button',{name:'Mes completo',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.report-selectable-chart')?.getAttribute('aria-label').includes('2026-10-01'));
    assert.equal(await page.getByLabel('Gráfica desde',{exact:true}).inputValue(),'2026-10-01');
    assert.equal(await page.getByLabel('Gráfica hasta',{exact:true}).inputValue(),'2026-10-31');
    assert.deepEqual(await page.evaluate(()=>window.__monthCounts),Array.from({length:31},(_,index)=>String(2*(index+1))),'Every day has a drawn count, including future days in the fixture');
    await page.screenshot({path:path.resolve(__dirname,'../../tmp/dashboard-month-counts.png'),fullPage:true});
    sparse = true; extraCashiers = 0;
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.report-top h2 span')?.textContent === '4');
    await page.waitForTimeout(100);
    const hasBar = index => chart.evaluate((element, index) => {
      const scale = 2, width = element.width / scale, bottom = element.height / scale - 30;
      const center = 38 + (width - 50) / 31 * (index + .5);
      const pixels = element.getContext('2d').getImageData(Math.floor(center * scale), 45 * scale, 1, Math.floor((bottom - 45 + 3) * scale)).data;
      for (let i = 0; i < pixels.length; i += 4) {
        if ((pixels[i] === 19 && pixels[i + 1] === 132 && pixels[i + 2] === 119) || (pixels[i] === 24 && pixels[i + 1] === 117 && pixels[i + 2] === 161)) return true;
      }
      return false;
    }, index);
    assert.equal(await hasBar(23), false, 'Past zero-count day has no artificial bar');
    assert.equal(await hasBar(27), false, 'Future zero-count day has no artificial bar');
    assert.equal(await hasBar(25), true, 'Real activity still draws a bar');
    const sparseBounds = await chart.boundingBox();
    await page.mouse.click(sparseBounds.x + 38 + (sparseBounds.width - 50) / 31 * 27.5, sparseBounds.y + 85);
    assert.equal(await total.textContent(), '0', 'Zero day remains selectable without a bar');
    await page.mouse.move(sparseBounds.x + 38 + (sparseBounds.width - 50) / 31 * 27.5, sparseBounds.y + 85);
    assert.match(await page.getByRole('tooltip').textContent(), /28\/10\/2026.*0 transacciones/);
    assert.equal(await hasBar(27), false, 'Selection highlights the date but never invents activity');
    const selectionPixels = await chart.evaluate(element => {
      const scale = 2, width = element.width / scale, bottom = element.height / scale - 30;
      const x = Math.floor((38 + (width - 50) / 31 * 27.5) * scale);
      const ctx = element.getContext('2d');
      return {
        plot: [...ctx.getImageData(x, 60 * scale, 1, 1).data].slice(0, 3),
        marker: [...ctx.getImageData(x, (bottom + 27) * scale, 1, 1).data].slice(0, 3),
      };
    });
    assert.deepEqual(selectionPixels.plot, [255, 255, 255], 'Selection must not draw a second taller bar behind the data');
    assert.deepEqual(selectionPixels.marker, [24, 117, 161], 'Selected zero-count date retains a visible marker below the axis');
    await page.screenshot({ path: path.resolve(__dirname, '../../tmp/dashboard-zero-bars.png'), fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('Dashboard: drag, reverse range, sums, all days, filters, tooltip, keyboard and responsive layouts passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
