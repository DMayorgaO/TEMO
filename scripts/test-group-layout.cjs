const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const icons = require('lucide-react');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const source = fs.readFileSync('frontend/src/pages/App.tsx', 'utf8');
  const component = source.slice(source.indexOf('function TransactionGroupView('), source.indexOf('\nfunction TransactionModal('));
  const js = ts.transpileModule(component, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const names = ['React', 'useRef', 'useEffect', 'X', 'Edit3', 'ArrowUpRight', 'ArrowDownLeft', 'formatCashCountMoney', 'mapApiTransactionDetail'];
  const values = [React, () => ({ current: null }), () => {}, icons.X, icons.Edit3, icons.ArrowUpRight, icons.ArrowDownLeft, (n, c) => (c === 'NIO' ? 'C$ ' : '$ ') + Number(n).toFixed(2), x => x];
  const View = Function(...names, js + ';return TransactionGroupView;')(...values);
  const details = Array.from({ length: 4 }, (_, i) => ({
    transaction: { database_id: '' + i, id: 'TRA-001262-0' + (i + 1), entidad: 'BANPRO', estado: i === 2 ? 'ANULADA' : 'REGISTRADA', movimiento: i ? 'Deposito a cuenta' : 'Retiro de efectivo', direccion: i ? 'ENTRA' : 'SALE', monto: i ? 18275 : 1138.5, moneda: i ? 'NIO' : 'USD' },
    rates: { buy: 36.55, sell: 37 },
    settlement: { expectedChange: { NIO: 500, USD: 13.68 }, primaryCounts: { NIO: [{ denomination: 200, piles25: 1, loose: 2 }], USD: [] }, changeCounts: { NIO: [], USD: [] } },
  }));
  const html = renderToStaticMarkup(React.createElement(View, { detail: { details, compensations: [] }, onClose: () => {}, onEdit: () => {} }));
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent('<style>' + fs.readFileSync('frontend/src/styles/global.css', 'utf8') + '</style>' + html);
      await page.locator('summary').first().click();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('horizontal overflow ' + width);
      if (await page.locator('.group-cash-summary').evaluateAll(elements => elements.some(el => el.scrollWidth > el.clientWidth + 1))) throw Error('cash content overflow ' + width);
      await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'temo-group-' + width + '.png') });
      console.log('PASS: group layout and expandable denominations at width', width);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
