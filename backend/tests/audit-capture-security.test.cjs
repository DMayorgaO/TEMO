const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {DeniedAccessAudit}=require('../dist/common/errors/denied-access-audit');
const {auditCaptureStatus}=require('../dist/common/errors/audit-capture-status');
const {CatalogsController}=require('../dist/modules/catalogs/catalogs.controller');
const actor='00000000-0000-4000-8000-000000000001';
const metrics=()=>auditCaptureStatus().categories.ACCESO_DENEGADO;

test('a persistence failure releases the key for retry and warns without database details',async()=>{
  let calls=0;const logs=[];
  const audit=new DeniedAccessAudit({query:async()=>{if(++calls===1)throw new Error('secret-database-value');return {rowCount:1};}});
  audit.logger={warn:message=>logs.push(message)};
  const before=metrics();
  assert.equal(await audit.record(actor,'GET','/api/catalogs/usuarios',''),'failed');
  assert.equal(await audit.record(actor,'GET','/api/catalogs/usuarios',''),'recorded');
  assert.equal(await audit.record(actor,'GET','/api/catalogs/usuarios',''),'grouped');
  assert.equal(calls,2);assert.equal(metrics().failed-before.failed,1);assert.equal(metrics().recorded-before.recorded,1);
  assert.equal(audit.pending,0);assert.equal(audit.inFlight.size,0);assert.equal(logs.length,1);
  assert.ok(!JSON.stringify(logs).includes('secret-database-value'));
});

test('in-flight duplicates coalesce and a failed first write never becomes a successful dedup entry',async()=>{
  let reject,queries=0;
  const audit=new DeniedAccessAudit({query:()=>{queries++;return new Promise((_resolve,fail)=>{reject=fail;});}});
  audit.logger={warn:()=>{}};
  const first=audit.record(actor,'GET','/api/transactions','');
  assert.equal(await audit.record(actor.toUpperCase(),'GET','/api/transactions',''),'grouped');
  assert.equal(queries,1);reject(new Error('private-value'));
  assert.equal(await first,'failed');assert.equal(audit.seen.size,0);assert.equal(audit.inFlight.size,0);
  audit.db={query:async()=>{queries++;return {rowCount:1};}};
  assert.equal(await audit.record(actor,'GET','/api/transactions',''),'recorded');
});

test('cache eviction keeps memory bounded without dropping new unique events',async()=>{
  let queries=0;const audit=new DeniedAccessAudit({query:async()=>{queries++;return {rowCount:1};}});
  const before=metrics();
  for(let n=0;n<1001;n++)assert.equal(await audit.record(actor,'GET','/api/transactions/:id/detail','',randomUUID()),'recorded');
  assert.equal(queries,1001);assert.equal(audit.seen.size,1000);assert.equal(metrics().cacheEvictions-before.cacheEvictions,1);
});

test('overflow is measured and throttled, then later requests can be recorded',async()=>{
  const releases=[],logs=[];
  const audit=new DeniedAccessAudit({query:()=>new Promise(resolve=>releases.push(resolve))});
  audit.logger={warn:message=>logs.push(message)};
  const before=metrics(),writes=[];
  for(let n=0;n<10;n++)writes.push(audit.record(actor,'GET',`/api/test-${n}`,''));
  for(let n=0;n<20;n++)assert.equal(await audit.record(actor,'GET','/api/overflow',''),'busy');
  assert.equal(logs.length,1);assert.equal(audit.pending,10);assert.equal(metrics().overloaded-before.overloaded,20);
  releases.splice(0).forEach(resolve=>resolve({rowCount:1}));await Promise.all(writes);
  audit.db={query:async()=>({rowCount:1})};
  assert.equal(await audit.record(actor,'GET','/api/overflow',''),'recorded');
  assert.equal(audit.pending,0);assert.equal(audit.inFlight.size,0);
});

test('raw URLs, queries, controls and malformed identities never reach SQL',async()=>{
  const calls=[];const audit=new DeniedAccessAudit({query:async(...args)=>{calls.push(args);return {rowCount:1};}});
  for(const route of ['/api/transactions?token=private-value','/api/path#private-value','/api/%70rivate','/api/path\nvalue',`/api/transactions/${actor}`,'/api/transactions/a1111111-1111-4111-8111-111111111111','/outside-api']){
    assert.equal(await audit.record(actor,'GET',route,''),'invalid');
  }
  assert.equal(await audit.record([actor],'GET','/api/transactions',''),'invalid');
  assert.equal(await audit.record(actor,['GET'],'/api/transactions',''),'invalid');
  assert.equal(calls.length,0);
  assert.equal(await audit.record(actor,'GET','/api/transactions/:id/detail','invalid-ip','bad-record'),'recorded');
  assert.equal(calls[0][1][3],null);assert.equal(calls[0][1][5],null);
  assert.ok(!JSON.stringify(calls).includes('private-value'));
});

test('diagnostics expose only aggregate copies and remain administrator-only',()=>{
  const controller=new CatalogsController({query:()=>{throw new Error('Unexpected SQL');}},{});
  for(const user of [{roleCode:'CAJERO'},{roleCode:'TRANSFERISTA'},{roleCode:'JEFA',mustChangePassword:true}]){
    assert.throws(()=>controller.auditCapture({user}),error=>error.getStatus()===403);
  }
  const status=controller.auditCapture({user:{roleCode:'JEFA'}});
  assert.equal(status.scope,'current-process');assert.equal(typeof status.hasObservedGaps,'boolean');
  assert.ok(!JSON.stringify(status).includes(actor));
  status.categories.ACCESO_DENEGADO.failed=99999999;
  assert.notEqual(metrics().failed,99999999);
});

test('an unconfirmed insert never counts as recorded or suppresses the next attempt',async()=>{
  const audit=new DeniedAccessAudit({query:async()=>({rowCount:0})});audit.logger={warn:()=>{}};
  assert.equal(await audit.record(actor,'GET','/api/transactions',''),'failed');assert.equal(audit.seen.size,0);
  audit.db={query:async()=>({rowCount:1})};
  assert.equal(await audit.record(actor,'GET','/api/transactions',''),'recorded');
});

test('HTTP diagnostic route precedes UUID detail and enforces session/role boundaries',async()=>{
  require('reflect-metadata');
  const {Module,UnauthorizedException}=require('@nestjs/common');
  const {NestFactory,Reflector}=require('@nestjs/core');
  const {AuthGuard}=require('../dist/modules/auth/auth.guard');
  const {DatabaseService}=require('../dist/modules/database/database.service');
  const {CatalogsService}=require('../dist/modules/catalogs/catalogs.service');
  class BoundaryModule{}
  Module({controllers:[CatalogsController],providers:[{provide:DatabaseService,useValue:{}},{provide:CatalogsService,useValue:{}}]})(BoundaryModule);
  const app=await NestFactory.create(BoundaryModule,{logger:false});app.setGlobalPrefix('api');
  app.useGlobalGuards(new AuthGuard(new Reflector(),{validateAccessToken:async token=>{
    if(token==='revoked')throw new UnauthorizedException();
    return {id:actor,roleCode:token==='admin'||token==='change'?'JEFA':'CAJERO',mustChangePassword:token==='change'};
  }}));
  try{
    await app.listen(0,'127.0.0.1');const base=await app.getUrl();
    for(const [token,status]of [[null,401],['revoked',401],['cashier',403],['change',403],['admin',200]]){
      const response=await fetch(base+'/api/catalogs/auditoria/estado-captura',{headers:token?{Authorization:`Bearer ${token}`}:{}});
      assert.equal(response.status,status);
      if(status===200)assert.equal((await response.json()).scope,'current-process');
    }
  }finally{await app.close();}
});
