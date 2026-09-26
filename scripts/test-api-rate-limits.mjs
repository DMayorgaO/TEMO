import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const express = require('express');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const ts = require('typescript');
const server = express();
let ready;
const initialized = new Promise((resolve) => { ready = resolve; });
const limits = [];
const app = {
  get: () => ({ get: (key, fallback) => key === 'CORS_ORIGINS' ? 'https://example.test' : fallback }),
  getHttpAdapter: () => ({ getInstance: () => server }),
  use: (...args) => server.use(...args),
  enableCors: (options) => server.use(cors(options)),
  setGlobalPrefix: () => {},
  useGlobalFilters: () => {},
  listen: async () => { ready(); },
};
const source = readFileSync(new URL('../backend/src/main.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, {
  exports: {},
  require: (id) => {
    if (id === '@nestjs/core') return { NestFactory: { create: async () => app } };
    if (id === './app.module') return { AppModule: class {} };
    if (id === './common/errors/app-exception.filter') return { AppExceptionFilter: class {} };
    if (id === 'express-rate-limit') return { rateLimit: (options) => {
      limits.push(options.limit);
      return rateLimit({ ...options, limit: 2 });
    } };
    return require(id);
  },
});
await initialized;
assert.deepEqual(limits, [20, 10, 1200, 12000]);
server.use('/api', (_req, res) => res.json({ ok: true }));
const listener = server.listen(0, '127.0.0.1');
await new Promise((resolve) => listener.once('listening', resolve));
const url = `http://127.0.0.1:${listener.address().port}/api/test`;
const headers = { Origin: 'https://example.test' };
try {
  assert.equal((await fetch(url, { headers, method: 'OPTIONS' })).status, 204);
  assert.equal((await fetch(url, { headers })).status, 200);
  assert.equal((await fetch(url, { headers })).status, 200);
  const blockedRead = await fetch(url, { headers });
  assert.equal(blockedRead.status, 429);
  assert.equal(blockedRead.headers.get('access-control-allow-origin'), headers.Origin);
  assert.ok((await blockedRead.json()).message.includes('consultas'));
  assert.equal((await fetch(url, { headers, method: 'POST' })).status, 200);
  assert.equal((await fetch(url, { headers, method: 'POST' })).status, 200);
  const blockedWrite = await fetch(url, { headers, method: 'POST' });
  assert.equal(blockedWrite.status, 429);
  assert.equal(blockedWrite.headers.get('access-control-allow-origin'), headers.Origin);
  assert.ok((await blockedWrite.json()).message.includes('operaciones'));
  console.log('PASS: CORS on throttled responses, preflight, separate read/write budgets');
} finally {
  listener.closeAllConnections();
  await new Promise((resolve) => listener.close(resolve));
}
