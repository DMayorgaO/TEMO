import assert from 'node:assert/strict';
import test from 'node:test';
import { InFlightReads } from '../src/utils/in-flight-reads.ts';
import { startVisiblePolling } from '../src/utils/visible-polling.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('identical in-flight reads share transport but not mutable data; completed reads are never cached', async () => {
  const reads = new InFlightReads();
  const job = deferred();
  let calls = 0;
  const load = () => { calls++; return job.promise; };
  const first = reads.run('sessionA:/shifts/current', load);
  const second = reads.run('sessionA:/shifts/current', load);
  assert.equal(calls, 1);
  job.resolve({ balances: [{ amount: 100 }] });
  const [a, b] = await Promise.all([first, second]);
  a.balances[0].amount = 0;
  assert.equal(b.balances[0].amount, 100);
  await reads.run('sessionA:/shifts/current', load);
  assert.equal(calls, 2);
});

test('identity/path boundaries, writes invalidating pending reads and failed requests cannot reuse stale data', async () => {
  const reads = new InFlightReads();
  const job = deferred();
  const old = reads.run('sessionA:/shifts/current', () => job.promise);
  assert.equal(await reads.run('sessionB:/shifts/current', async () => 'B'), 'B');
  assert.equal(await reads.run('sessionA:/transactions', async () => 'other'), 'other');
  reads.clear();
  const next = deferred();
  const fresh = reads.run('sessionA:/shifts/current', () => next.promise);
  job.resolve('old');
  assert.equal(await old, 'old');
  const shared = reads.run('sessionA:/shifts/current', async () => assert.fail('old cleanup must not delete new request'));
  next.resolve('fresh');
  assert.deepEqual(await Promise.all([fresh, shared]), ['fresh', 'fresh']);
  await assert.rejects(reads.run('error', async () => { throw new Error('network'); }), /network/);
  assert.equal(await reads.run('error', async () => 'recovered'), 'recovered');
});

test('visibility polling pauses hidden tabs, resumes immediately, avoids overlap and cleans up', async () => {
  const priorWindow = globalThis.window, priorDocument = globalThis.document;
  const win = new EventTarget(), doc = new EventTarget();
  let tick, cleared = false, calls = 0;
  doc.visibilityState = 'hidden';
  win.setInterval = callback => { tick = callback; return 1; };
  win.clearInterval = () => { cleared = true; };
  globalThis.window = win;
  globalThis.document = doc;
  const job = deferred();
  try {
    const stop = startVisiblePolling(async () => { calls++; await job.promise; }, 5000, 'changed');
    tick();
    assert.equal(calls, 0);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('focus'));
    tick();
    assert.equal(calls, 1);
    job.resolve();
    await flush();
    win.dispatchEvent(new Event('changed'));
    assert.equal(calls, 2);
    await flush();
    doc.visibilityState = 'hidden';
    tick();
    assert.equal(calls, 2);
    stop();
    assert.equal(cleared, true);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('changed'));
    tick();
    assert.equal(calls, 2);
  } finally { globalThis.window = priorWindow; globalThis.document = priorDocument; }
});

test('failed polling resumes on the next tick without clearing confirmed data', async () => {
  const priorWindow = globalThis.window, priorDocument = globalThis.document;
  const win = new EventTarget(), doc = new EventTarget();
  doc.visibilityState = 'visible';
  let tick, calls = 0;
  win.setInterval = callback => { tick = callback; return 1; };
  win.clearInterval = () => {};
  globalThis.window = win; globalThis.document = doc;
  try {
    const stop = startVisiblePolling(async () => { calls++; throw new Error('network'); }, 5000, 'changed');
    await flush(); tick(); await flush();
    assert.equal(calls, 2);
    stop();
  } finally { globalThis.window = priorWindow; globalThis.document = priorDocument; }
});
