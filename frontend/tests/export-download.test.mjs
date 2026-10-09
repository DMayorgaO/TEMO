import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadExport, exportFilename } from '../src/utils/export-download.ts';

test('download names cannot contain paths, markup, controls or arbitrary extensions', () => {
  for (const title of ['../../usuarios<script>', 'C:\\secret\r\n.exe', 'Auditoría', '', 'a'.repeat(1000)]) {
    const name = exportFilename(title, 'xls');
    assert.match(name, /^temo-[a-z0-9_-]+\.xls$/);
    assert.ok(name.length <= 109);
  }
  assert.equal(exportFilename('Auditoría', 'png'), 'temo-auditoria.png');
});

test('download attaches then removes anchor, defers object URL cleanup even on click errors', () => {
  const original = { window: globalThis.window, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  try {
    let timer; let attached = false; let removed = false; let revoked = false;
    const anchor = { remove: () => { removed = true; }, click: () => { assert.ok(attached); throw new Error('blocked'); } };
    globalThis.document = { createElement: () => anchor, body: { append: () => { attached = true; } } };
    globalThis.window = { setTimeout: callback => { timer = callback; } };
    URL.createObjectURL = () => 'blob:test'; URL.revokeObjectURL = () => { revoked = true; };
    assert.throws(() => downloadExport(new Blob(['test']), 'temo-test.xls'), /blocked/);
    assert.ok(removed); assert.ok(!revoked); timer(); assert.ok(revoked);
  } finally {
    globalThis.window = original.window; globalThis.document = original.document;
    URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke;
  }
});
