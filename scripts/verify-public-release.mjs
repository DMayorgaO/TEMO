import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Public, read-only smoke tests. Never authenticates or submits financial data.
const [revision, mode, ...extra] = process.argv.slice(2);
const api = 'https://api.miscelaneaolivera.com';
const web = 'https://temo.miscelaneaolivera.com';
async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(20000), cache: 'no-store' });
}
try {
  assert.match(revision ?? '', /^[a-f0-9]{7,40}$/);
  assert.equal(extra.length, 0); assert.ok(!mode || mode === '--api-only');
  const healthResponse = await request(`${api}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.status, 'ok'); assert.equal(health.database, 'ok');
  assert.ok(health.revision?.startsWith(revision));
  const protectedPaths = ['/auth/me', '/transactions', '/shifts', '/shifts/handovers',
    '/catalogs/auditoria', '/catalogs/auditoria/estado-captura', '/directory'];
  for (const endpoint of protectedPaths) {
    const response = await request(`${api}/api${endpoint}`);
    assert.equal(response.status, 401, endpoint);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/, endpoint);
  }
  const allowed = await request(`${api}/api/transactions`, { method: 'OPTIONS', headers: {
    Origin: web, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.ok(allowed.status >= 200 && allowed.status < 300);
  assert.equal(allowed.headers.get('access-control-allow-origin'), web);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  const denied = await request(`${api}/api/transactions`, { method: 'OPTIONS', headers: {
    Origin: 'https://untrusted.invalid', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  console.log(JSON.stringify({ api: true, revision: health.revision, database: health.database,
    anonymousRoutesRejected: protectedPaths.length, corsAllowedAndDenied: true }));
  if (!mode) {
    const response = await request(web + '/'); assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const csp = response.headers.get('content-security-policy') ?? '';
    assert.ok(csp.includes(api)); assert.ok(csp.includes("frame-ancestors 'none'"));
    const html = await response.text();
    const local = await readFile(new URL('../frontend/dist/index.html', import.meta.url), 'utf8');
    const assets = content => [...content.matchAll(/(?:src|href)="(\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css))"/g)].map(match => match[1]).sort();
    const paths = assets(local); assert.ok(paths.length >= 2); assert.deepEqual(assets(html), paths);
    const hashes = [];
    for (const asset of paths) {
      const remote = await request(web + asset); assert.equal(remote.status, 200);
      const digest = data => createHash('sha256').update(data).digest('hex');
      const actual = digest(Buffer.from(await remote.arrayBuffer()));
      assert.equal(actual, digest(await readFile(new URL('../frontend/dist' + asset, import.meta.url))));
      hashes.push({ asset, sha256: actual });
    }
    console.log(JSON.stringify({ web: true, assetsMatchBuild: true, headersVerified: true, hashes,
      scope: 'public-availability-not-authenticated-financial-QA' }));
  }
} catch (error) {
  console.error(`Smoke publico no aprobado: ${error.code || error.name}. Revise revision, respuestas, cabeceras o assets; sin credenciales.`);
  process.exitCode = 1;
}
