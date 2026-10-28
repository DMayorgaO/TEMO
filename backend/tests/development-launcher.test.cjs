const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');

test('development child environment cannot inherit cloud database, email, tokens or Node injection',async()=>{
  const {developmentEnvironment}=await import('../../scripts/start-development.mjs');
  const environment=developmentEnvironment({PATH:'test-path',SystemRoot:'windows',DATABASE_URL:'postgresql://cloud.invalid/production',
    RESEND_API_KEY:'private-key',AUTH_SECRET:'production-secret',MFA_ENCRYPTION_KEY:'production-mfa',NODE_OPTIONS:'--require unsafe.js',PGPASSWORD:'private'});
  assert.equal(environment.PATH,'test-path');
  assert.equal(environment.DATABASE_URL,'postgresql://temo_preview@127.0.0.1:55433/temo_preview');
  assert.equal(environment.DATABASE_SSL,'false');assert.equal(environment.RESEND_API_KEY,'');
  assert.equal(environment.VITE_API_URL,'/api');assert.equal(environment.TEMO_DEVELOPMENT_LOOPBACK,'1');
  assert.equal(environment.APP_ENV,'development');assert.equal(environment.TEMO_ISOLATED_DEVELOPMENT,'1');
  for(const key of ['AUTH_SECRET','MFA_ENCRYPTION_KEY','NODE_OPTIONS','PGPASSWORD'])assert.equal(environment[key],undefined);
  assert.ok(!JSON.stringify(environment).includes('production-secret'));
});

test('legacy testing shortcut delegates to the non-reseeding development launcher',()=>{
  const shortcut=readFileSync(path.resolve(__dirname,'../../Iniciar pruebas TEMO.cmd'),'utf8');
  assert.ok(shortcut.includes('Iniciar TEMO Desarrollo.cmd'));
  assert.ok(!/seed-preview|start-preview/.test(shortcut));
});
