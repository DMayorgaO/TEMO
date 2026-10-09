import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSafeExportTable, escapeExportHtml } from '../src/utils/export-html.ts';

test('Excel protects formula-like strings including leading whitespace and controls', () => {
  for (const value of ['=HYPERLINK("https://example.invalid")', '+SUM(1,2)', '-1+2', '@SUM(1)', '\t\r\n =1+1', '\u0000=1']) {
    const html = buildSafeExportTable('Reporte', [value], [[value]], true);
    assert.ok(html.includes(`>${escapeExportHtml(`'${value}`)}</td>`));
    assert.ok(html.includes(`>${escapeExportHtml(`'${value}`)}</th>`));
    assert.ok(html.includes('mso-number-format:'));
  }
});

test('Excel preserves actual numeric values and money labels; PDF keeps literal strings', () => {
  const html = buildSafeExportTable('Reporte', ['Monto'], [[-150, 0, 36.55, 'C$ -150.00', '$ 100.00']], true);
  assert.ok(html.includes('<td>-150</td><td>0</td><td>36.55</td>'));
  assert.ok(html.includes('>C$ -150.00</td>'));
  assert.ok(html.includes('>$ 100.00</td>'));
  assert.ok(buildSafeExportTable('Reporte', ['Monto'], [['=1+1']]).includes('<td>=1+1</td>'));
});

test('Excel formula neutralization does not bypass HTML escaping', () => {
  const html = buildSafeExportTable('<script>x</script>', ['Dato'], [['=1<img src=x onerror=alert(1)>']], true);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&#39;=1&lt;img'));
});

test('escapes all HTML delimiters without changing financial text', () => {
  assert.equal(escapeExportHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escapeExportHtml('C$ -150.00 / $ 100.00'), 'C$ -150.00 / $ 100.00');
  assert.equal(escapeExportHtml(null), '');
});

test('stored markup in titles, headers and cells cannot become HTML elements', () => {
  const result = buildSafeExportTable('</title><script>alert(1)</script>',
    ['<img src=x onerror=alert(1)>'], [['</td><svg onload=alert(1)>', 'Banco & Cliente']]);
  assert.ok(!result.includes('<script'));
  assert.ok(!result.includes('<img'));
  assert.ok(!result.includes('<svg'));
  assert.ok(result.includes('&lt;/title&gt;'));
  assert.ok(result.includes('Banco &amp; Cliente'));
  assert.equal((result.match(/<td>/g) ?? []).length, 2);
});
