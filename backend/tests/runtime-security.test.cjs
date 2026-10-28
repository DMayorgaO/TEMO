const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const yaml=require('js-yaml');
const root=path.resolve(__dirname,'../..');
const policy=()=>import(pathToFileURL(path.join(root,'scripts/check-runtime-security.mjs')).href);

test('runtime security floors cover each patched branch without approving old, unknown or prerelease builds',async()=>{
  const {isPatchedForOctoberAdvisory:safe}=await policy();
  for(const version of ['22.23.4','v22.23.5','22.24.0','24.22.1','24.23.0','26.12.1','26.13.0'])assert.equal(safe(version),true,version);
  for(const version of ['22.14.0','22.23.3','24.11.1','24.22.0','26.12.0','20.99.0','25.12.1','27.1.0','22.23.4-rc.1','',null,{},'22.23.4\n--bad'])assert.equal(safe(version),false,String(version));
});

test('both Render services and repository fallback pin the patched Node 22 runtime',async()=>{
  const {isPatchedForOctoberAdvisory:safe}=await policy();
  const target=readFileSync(path.join(root,'.node-version'),'utf8').trim();assert.equal(target,'22.23.4');assert.ok(safe(target));
  const config=yaml.load(readFileSync(path.join(root,'render.yaml'),'utf8'));
  for(const name of ['temo-api','temo-web']){
    const service=config.services.find(item=>item.name===name);assert.ok(service);
    assert.equal(String(service.envVars.find(item=>item.key==='NODE_VERSION').value),target);
  }
});

test('runtime inspection reports trust overrides as flags without exposing paths, secrets or environment values',async()=>{
  const {assessRuntime}=await policy();
  const result=assessRuntime('24.11.1',{NODE_TLS_REJECT_UNAUTHORIZED:'0',NODE_EXTRA_CA_CERTS:'private-ca-path',
    NODE_OPTIONS:'--use-system-ca --require private-file',RESEND_API_KEY:'private-key'});
  assert.equal(result.patchedForOctoberAdvisory,false);assert.equal(result.tlsVerificationDisabled,true);
  assert.equal(result.extraCaConfigured,true);assert.equal(result.alternativeTrustStoreConfigured,true);
  assert.ok(!JSON.stringify(result).includes('private-'));
});

test('release builds and API startup refuse an unpatched runtime instead of relying only on Render configuration',()=>{
  for(const workspace of ['backend','frontend']){
    const manifest=JSON.parse(readFileSync(path.join(root,workspace,'package.json'),'utf8'));
    assert.ok(manifest.scripts.build.startsWith('node ../scripts/check-runtime-security.mjs && '));
    if(workspace==='backend')assert.ok(manifest.scripts.start.startsWith('node ../scripts/check-runtime-security.mjs && '));
  }
});
