const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCorsOrigins } = require('../dist/config/cors-origins');
const { validateEnvironment } = require('../dist/config/environment.validation');
const { sanitizeBodyParserError } = require('../dist/common/errors/body-parser-error');

test('CORS accepts only explicit canonical origins, HTTPS for remote environments', () => {
  assert.deepEqual(parseCorsOrigins('', false), []);
  assert.deepEqual(parseCorsOrigins('http://127.0.0.1:3187', false), ['http://127.0.0.1:3187']);
  assert.deepEqual(parseCorsOrigins(' https://temo.miscelaneaolivera.com,https://temo.miscelaneaolivera.com ', true),
    ['https://temo.miscelaneaolivera.com']);
  for (const origin of ['', '*', 'https://*.example.com', 'null', 'http://example.com', 'https://example.com/',
    'https://example.com/path', 'https://example.com?secret=value', 'https://user:secret@example.com',
    'https://example.com#fragment', 'https://example.com,', 'https://EXAMPLE.com', 'file:///tmp/test']) {
    assert.throws(() => parseCorsOrigins(origin, true), e => !e.message.includes('secret'));
  }
});

test('invalid production CORS configuration fails during environment validation', () => {
  const config = { APP_ENV: 'production', DATABASE_SSL: 'true', AUTH_SECRET: 'x'.repeat(32),
    DATABASE_URL: 'postgresql://db.example.com/temo', CORS_ORIGINS: 'https://temo.miscelaneaolivera.com' };
  assert.equal(validateEnvironment(config).CORS_ORIGINS, config.CORS_ORIGINS);
  for (const value of ['*', 'http://temo.miscelaneaolivera.com', 'https://temo.miscelaneaolivera.com/login']) {
    assert.throws(() => validateEnvironment({ ...config, CORS_ORIGINS: value }));
  }
});

test('known parser failures are sanitized by type and status, never by raw message', () => {
  for (const [type, status] of [['entity.parse.failed', 400], ['entity.too.large', 413],
    ['parameters.too.many', 413], ['encoding.unsupported', 415], ['charset.unsupported', 415],
    ['request.aborted', 400], ['request.size.invalid', 400]]) {
    let forwarded;
    sanitizeBodyParserError({ type, status, message: 'secret-body', body: 'secret-body' }, {}, {}, e => { forwarded = e; });
    assert.equal(forwarded.getStatus(), status);
    assert.ok(!JSON.stringify(forwarded.getResponse()).includes('secret-body'));
  }
  for (const error of [null, new Error('internal'), { type: 'entity.parse.failed', status: 500 },
    { type: '__proto__', status: 400 }, { status: 400 }]) {
    sanitizeBodyParserError(error, {}, {}, e => assert.equal(e, error));
  }
});

test('HTTP ingress rejects malformed and oversized bodies safely before controllers and throttles before parsing',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
    const { spawn } = require('node:child_process');
    const { once } = require('node:events');
    const { createServer } = require('node:net');
    const { gzipSync } = require('node:zlib');
    const socket = createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    let logs = '';
    const child = spawn(process.execPath, [require.resolve('../dist/main.js')], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
        APP_ENV: 'development', PORT: String(port), BACKEND_PORT: String(port),
        DATABASE_URL: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview', DATABASE_SSL: 'false',
        DATABASE_SSL_CA_PATH: '', DATABASE_SSL_CA_BASE64: '', AUTH_SECRET: 'isolated-http-boundary-test-secret-2026',
        MFA_ENCRYPTION_KEY: Buffer.alloc(32, 41).toString('base64'), CORS_ORIGINS: 'http://127.0.0.1:3187',
      },
    });
    child.stdout.on('data', data => { logs += data; });
    child.stderr.on('data', data => { logs += data; });
    const exited = once(child, 'exit');
    const base = `http://127.0.0.1:${port}/api`;
    const marker = 'private-payload-marker';
    const request = (path, body, extra = {}) => fetch(`${base}${path}`, { method: 'POST',
      headers: { Origin: 'http://127.0.0.1:3187', 'Content-Type': 'application/json', ...extra }, body,
      signal: AbortSignal.timeout(5000) });
    try {
      let ready = false;
      for (let n = 0; n < 40; n++) {
        try { ready = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
        if (ready || child.exitCode !== null) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      assert.ok(ready, 'isolated API starts');
      const large = JSON.stringify({ photoDataUrl: marker + 'x'.repeat(270000) });
      for (const [path, body, headers, status] of [
        ['/auth/login', `{"password":"${marker}",`, {}, 400],
        ['/auth/profile-photo', large, {}, 413],
        ['/auth/profile-photo', gzipSync(large), { 'Content-Encoding': 'gzip' }, 413],
        ['/auth/login', '{}', { 'Content-Encoding': 'not-supported' }, 415],
        ['/auth/login', '{}', { 'Content-Type': 'application/json; charset=not-supported' }, 415],
        ['/auth/profile-photo', `value=${'x'.repeat(66000)}`, { 'Content-Type': 'application/x-www-form-urlencoded' }, 413],
        ['/auth/profile-photo', Array.from({ length: 1001 }, (_, n) => `p${n}=x`).join('&'),
          { 'Content-Type': 'application/x-www-form-urlencoded' }, 413],
      ]) {
        const response = await request(path, body, headers);
        assert.equal(response.status, status, path);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3187');
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        const error = await response.json();
        assert.ok(error.requestId);
        assert.equal(error.statusCode, status);
        assert.ok(!JSON.stringify(error).includes(marker));
        assert.ok(!JSON.stringify(error).includes('stack'));
      }
      // Within the existing body limit, parsing succeeds and authorization still denies anonymous access.
      assert.equal((await request('/auth/profile-photo', JSON.stringify({ photoDataUrl: 'x'.repeat(200000) }))).status, 401);
      assert.equal((await request('/transactions/batch', '{}')).status, 401);
      const foreign = await request('/auth/profile-photo', '{', { Origin: 'https://untrusted.invalid' });
      assert.equal(foreign.status, 400);
      assert.equal(foreign.headers.get('access-control-allow-origin'), null);
      const preflight = await fetch(`${base}/auth/login`, { method: 'OPTIONS', headers: {
        Origin: 'http://127.0.0.1:3187', 'Access-Control-Request-Method': 'POST' } });
      assert.equal(preflight.status, 204);
      // Three login attempts above; the remaining seventeen consume the unchanged twenty-request quota.
      for (let n = 0; n < 17; n++) assert.equal((await request('/auth/login', '{}')).status, 400);
      const throttled = await request('/auth/login', `{"password":"${marker}",`);
      assert.equal(throttled.status, 429, 'rate limit must run before JSON parser');
      assert.ok(Number(throttled.headers.get('retry-after')) > 0);
      assert.equal(throttled.headers.get('cache-control'), 'no-store');
      assert.equal(throttled.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3187');
      assert.equal((await fetch(`${base}/health`)).status, 200);
      assert.equal((await request('/auth/password-recovery/request', '{}')).status, 400);
      assert.ok(!logs.includes(marker), 'technical logs must not include raw parser body/message');
    } finally {
      if (child.exitCode === null) child.kill();
      await exited;
    }
  });
