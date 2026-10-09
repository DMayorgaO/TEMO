const test = require('node:test');
const assert = require('node:assert/strict');
const { auditBrowser } = require('../dist/modules/catalogs/audit-browser');

test('identifies Edge before its Chrome/Safari compatibility identifiers', () => {
  assert.equal(auditBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0'), 'Microsoft Edge 154');
  assert.equal(auditBrowser('Chrome/150.0.0.0 Safari/537.36 OPR/120.0'), 'Opera 120');
  assert.equal(auditBrowser('Version/18.1 Safari/605.1'), 'Safari 18');
  assert.equal(auditBrowser('Firefox/140.0'), 'Firefox 140');
  assert.equal(auditBrowser('CriOS/140.1 Safari/604.1'), 'Chrome 140');
  assert.equal(auditBrowser(''), 'No registrado');
  assert.equal(auditBrowser('custom-client'), 'Otro / no identificado');
});
