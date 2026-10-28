import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { frontendSecurityPolicy, isPrivateDevelopmentAddress } from '../src/utils/security-policy.ts';

test('production restricts scripts and API connections and rejects framing', () => {
  const policy = frontendSecurityPolicy('https://api.miscelaneaolivera.com/api');
  assert.ok(policy.includes("script-src 'self';"));
  assert.ok(!policy.includes('unsafe-eval'));
  assert.ok(!policy.includes('ws://'));
  assert.ok(policy.includes("connect-src 'self' https://api.miscelaneaolivera.com;"));
  assert.ok(policy.includes("frame-ancestors 'none'"));
  const renderConfig = readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8');
  // Keep the previous API available to older bundles during the domain transition.
  const transitionPolicy = policy.replace(
    "connect-src 'self' https://api.miscelaneaolivera.com;",
    "connect-src 'self' https://api.miscelaneaolivera.com https://temo-api.onrender.com;",
  );
  assert.ok(renderConfig.includes(`value: "${transitionPolicy}"`));
  assert.ok(renderConfig.includes('value: https://api.miscelaneaolivera.com/api'));
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

test('LAN development uses same-origin API and exact private HMR origins, not production or public hosts',()=>{
  const policy=frontendSecurityPolicy('/api',true,false,['ws://192.168.0.15:3188']);
  assert.ok(policy.includes("connect-src 'self' ws://127.0.0.1:* ws://localhost:* ws://192.168.0.15:3188;"));
  assert.ok(!policy.includes('http://localhost'));
  assert.throws(()=>frontendSecurityPolicy('/api',false));
  for(const origin of ['ws://8.8.8.8:3188','ws://*.example.com','wss://192.168.0.15:3188','ws://user:secret@192.168.0.15:3188','ws://192.168.0.15:3188/evil']){
    assert.throws(()=>frontendSecurityPolicy('/api',true,false,[origin]));
  }
  assert.throws(()=>frontendSecurityPolicy('https://api.example.com/api',false,false,['ws://192.168.0.15:3188']));
});

test('development network guard excludes public, malformed and arbitrary hostnames',()=>{
  for(const host of ['127.0.0.1','localhost','::1','::ffff:192.168.0.15','10.1.2.3','172.16.0.1','172.31.255.254'])assert.equal(isPrivateDevelopmentAddress(host),true,host);
  for(const host of ['8.8.8.8','172.15.0.1','172.32.0.1','192.168.999.1','192.168.0.15.evil.com','','example.com','169.254.0.1'])assert.equal(isPrivateDevelopmentAddress(host),false,host);
});
