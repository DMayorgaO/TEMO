const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const semver=require('semver');

test('security dependency floors and workspace adapter anchor remain in the reproducible lock',()=>{
  const root=path.resolve(__dirname,'../..');
  const manifest=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
  const lock=JSON.parse(readFileSync(path.join(root,'package-lock.json'),'utf8'));
  const override=manifest.overrides['@nestjs/platform-express'];
  assert.equal(manifest.devDependencies['@nestjs/platform-express'],override['.'],'Root adapter anchor must agree with its override');
  assert.equal(override.multer,'2.5.0');
  for(const [name,floor]of Object.entries({'body-parser':'2.4.0','multer':'2.5.0','fast-uri':'3.1.9','ip-address':'10.7.5','zod':'4.6.6','vite':'8.2.4'})){
    const copies=Object.entries(lock.packages).filter(([key])=>key.endsWith('/node_modules/'+name)||key==='node_modules/'+name);
    assert.ok(copies.length,`${name} must be installed`);
    for(const [location,entry]of copies)assert.ok(semver.gte(entry.version,floor),`${location} is below the security floor`);
  }
});
