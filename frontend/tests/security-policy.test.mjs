import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { frontendSecurityPolicy } from '../src/utils/security-policy.ts';

test('production restricts scripts and API connections and rejects framing', () => {
  const policy = frontendSecurityPolicy('https://temo-api.onrender.com/api');
  assert.ok(policy.includes("script-src 'self';"));
  assert.ok(!policy.includes('unsafe-eval'));
  assert.ok(!policy.includes('ws://'));
  assert.ok(policy.includes("connect-src 'self' https://temo-api.onrender.com;"));
  assert.ok(policy.includes("frame-ancestors 'none'"));
  assert.ok(readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8').includes(`value: "${policy}"`));
});
test('development allows Vite inline runtime and only local HMR', () => {
  const policy = frontendSecurityPolicy('http://127.0.0.1:4187/api', true);
  assert.ok(policy.includes("script-src 'self' 'unsafe-inline'"));
  assert.ok(policy.includes('http://127.0.0.1:4187'));
  assert.ok(policy.includes('ws://127.0.0.1:*'));
  assert.ok(!policy.includes('unsafe-eval'));
});
test('meta policy omits unsupported framing directive; API sources cannot inject directives', () => {
  assert.ok(!frontendSecurityPolicy('https://api.example.com/api', false, true).includes('frame-ancestors'));
  assert.throws(() => frontendSecurityPolicy('javascript:alert(1)'));
  assert.throws(() => frontendSecurityPolicy('https://user:pass@api.example.com'));
  assert.ok(frontendSecurityPolicy('https://api.example.com/path; script-src *').includes("connect-src 'self' https://api.example.com;"));
});
