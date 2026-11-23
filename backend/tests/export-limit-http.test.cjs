require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {Controller,Post,Module}=require('@nestjs/common');
const {NestFactory}=require('@nestjs/core');
const {ExportLimitInterceptor}=require('../dist/common/export-limit.interceptor');
const {ReadWorkloadInterceptor}=require('../dist/common/read-workload.interceptor');

test('HTTP filtered and selected exports share slots and preserve response payloads',async()=>{
 let hold=true,calls=0;const waiters=[],payload=[{id:'synthetic-row',amount:123.45}];
 class FixtureController{
  async filtered(){calls++;if(hold)await new Promise(resolve=>waiters.push(resolve));return payload;}
  selected(){return this.filtered();}
  batch(){return {accepted:true};}
 }
 Controller('transactions')(FixtureController);
 for(const [name,path] of [['filtered','export-filtered'],['selected','export'],['batch','batch']])Post(path)(FixtureController.prototype,name,Object.getOwnPropertyDescriptor(FixtureController.prototype,name));
 class Fixture{}Module({controllers:[FixtureController]})(Fixture);
 const app=await NestFactory.create(Fixture,{logger:false});app.setGlobalPrefix('api');
 app.use((req,res,next)=>{req.user={id:req.headers['x-fixture-actor']??'actor'};next();});
 app.useGlobalInterceptors(new ReadWorkloadInterceptor(),new ExportLimitInterceptor());
 const pending=[];
 try{
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const post=(path,actor='actor')=>fetch(base+'/api/transactions/'+path,{method:'POST',headers:{'x-fixture-actor':actor},signal:AbortSignal.timeout(5000)});
  pending.push(post('export-filtered'),post('export'));
  const deadline=Date.now()+3000;while(waiters.length<2&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(waiters.length,2);
  for(const path of ['export','export-filtered'])assert.equal((await post(path)).status,429);
  assert.equal(calls,2,'rejected exports must never reach the handler');
  assert.equal((await post('batch')).status,201);
  hold=false;
  assert.deepEqual(await (await post('export-filtered','other')).json(),payload);
  waiters.splice(0).forEach(resolve=>resolve());
  for(const response of await Promise.all(pending)){assert.equal(response.status,201);assert.deepEqual(await response.json(),payload);}
  assert.deepEqual(await (await post('export-filtered')).json(),payload);
 }finally{hold=false;waiters.splice(0).forEach(resolve=>resolve());await Promise.allSettled(pending);await app.close();}
});
