import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSafeExportTable, escapeExportHtml } from '../src/utils/export-html.ts';

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
