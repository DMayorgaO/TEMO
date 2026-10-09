import assert from 'node:assert/strict';
import test from 'node:test';
import { createTemporaryPassword } from '../src/utils/temporary-password.ts';

test('temporary passwords use 16 random base32 characters in readable groups', () => {
  const passwords = new Set(Array.from({ length: 512 }, () => createTemporaryPassword()));
  assert.equal(passwords.size, 512);
  for (const password of passwords) {
    assert.match(password, /^Temo1-(?:[A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/);
    assert.ok(password.length >= 10 && password.length <= 128);
  }
});
