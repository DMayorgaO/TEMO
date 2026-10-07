import assert from 'node:assert/strict';
import test from 'node:test';
import { removeLegacyOperationalCache, SessionCache } from '../src/utils/session-cache.ts';

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

test('cache survives reload in same session but not a different identity', () => {
  const storage = new MemoryStorage();
  let token = 'session-a';
  const cache = new SessionCache(storage, () => token);
  cache.setItem('transactions', 'private-data');
  assert.equal(new SessionCache(storage, () => token).getItem('transactions'), 'private-data');
  token = 'session-b';
  assert.equal(cache.getItem('transactions'), null);
  assert.equal(storage.length, 0);
});

test('logout and delayed responses cannot restore private data', () => {
  const storage = new MemoryStorage();
  let token = 'old-session';
  const cache = new SessionCache(storage, () => token);
  cache.setItem('accounts', 'secret');
  token = null;
  cache.clear();
  cache.setItem('accounts', 'late-response', 'old-session');
  assert.equal(storage.length, 0);
  token = 'new-session';
  cache.setItem('accounts', 'late-response', 'old-session');
  assert.equal(cache.getItem('accounts'), null);
});

test('legacy cleanup preserves username and public preferences, not financial records', () => {
  const storage = new MemoryStorage();
  for (const key of ['temo:transactions', 'temo:accounts', 'temo:users', 'temo:shifts', 'temo:remembered-username', 'temo:exchange-rate', 'another-app']) storage.setItem(key, key);
  removeLegacyOperationalCache(storage);
  assert.equal(storage.getItem('temo:transactions'), null);
  assert.equal(storage.getItem('temo:accounts'), null);
  assert.equal(storage.getItem('temo:users'), null);
  assert.equal(storage.getItem('temo:shifts'), null);
  assert.ok(storage.getItem('temo:remembered-username'));
  assert.ok(storage.getItem('temo:exchange-rate'));
  assert.ok(storage.getItem('another-app'));
});
