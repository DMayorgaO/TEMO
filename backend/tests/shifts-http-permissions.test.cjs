require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {Module,RequestMethod,UnauthorizedException}=require('@nestjs/common');
const {PATH_METADATA,METHOD_METADATA}=require('@nestjs/common/constants');
const {NestFactory,Reflector}=require('@nestjs/core');
const {AuthGuard}=require('../dist/modules/auth/auth.guard');
const {ShiftsController}=require('../dist/modules/shifts/shifts.controller');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {HandoversService}=require('../dist/modules/shifts/handovers.service');
const {ShiftsRouteGuard}=require('../dist/modules/shifts/shifts-route.guard');
const id='11111111-1111-4111-8111-111111111111',counts={NIO:[],USD:[]};
const opening={branch:'QA',register:'QA',cashier:'QA',counts,balances:[]};
const cashier=['CAJERO'],boss=['JEFA'],both=['JEFA','CAJERO'],readers=['JEFA','CAJERO','TRANSFERISTA'];
// Independent expectation table: adding a controller route requires an explicit test case.
const policy={handoverList:both,handoverCandidates:cashier,handoverPreview:cashier,handoverPropose:cashier,handoverDifference:cashier,cancelClose:cashier,handoverResolve:cashier,exportRows:both,exportDashboard:boss,list:readers,open:readers,dashboard:boss,current:readers,access:cashier,notifications:readers,acknowledge:readers,detail:readers,create:boss,openPrepared:cashier,update:boss,updateClosed:boss,saveCashCount:both,saveBalances:both,requestClose:cashier,close:boss,rejectClose:boss};
const bodies={handoverPropose:{requestId:id,receiverId:id,expectedVersion:'a'.repeat(64)},handoverDifference:{expectedVersion:'a'.repeat(64)},exportRows:{format:'EXCEL',ids:[]},exportDashboard:{},create:opening,update:opening,updateClosed:{opening,closing:{counts,balances:[],changeNio:0}},saveCashCount:{counts,changeNio:0},saveBalances:{balances:[]},requestClose:{observations:'QA'},close:{counts,balances:[],changeNio:0}};
bodies.updateClosed.opening={counts,balances:[],notes:''};
test('HTTP shift matrix covers all 26 handlers, each handover action, roles, sessions, strict query and empty-body contracts',async()=>{
 let calls=0;const service=new Proxy({}, {get:(_,name)=>name==='then'?undefined:()=>{calls++;return {ok:true};}});
 class Fixture{}Module({controllers:[ShiftsController],providers:[{provide:ShiftsService,useValue:service},{provide:HandoversService,useValue:service}]})(Fixture);
 const app=await NestFactory.create(Fixture,{logger:false});app.setGlobalPrefix('api');
 app.useGlobalGuards(new AuthGuard(new Reflector(),{validateAccessToken:async token=>{
  if(token==='REVOKED')throw new UnauthorizedException();
  return {id,roleCode:token.split('-')[0],sessionVersion:token.endsWith('-missing')?undefined:token.endsWith('-string')?'1':1,mustChangePassword:token.endsWith('-password')};
 }}));
 let checks=0;
 try{await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const invoke=(method,path,role,body)=>fetch(base+'/api/shifts'+path,{method,headers:{...(role?{authorization:'Bearer '+role}:{}),'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body??{})})});
  const handlers=Object.getOwnPropertyNames(ShiftsController.prototype).filter(name=>Reflect.hasMetadata(METHOD_METADATA,ShiftsController.prototype[name]));
  assert.deepEqual([...handlers].sort(),Object.keys(policy).sort());assert.equal(handlers.length,26);
  for(const name of handlers){
   const fn=ShiftsController.prototype[name],method=RequestMethod[Reflect.getMetadata(METHOD_METADATA,fn)];
   const raw=Reflect.getMetadata(PATH_METADATA,fn);const path=(raw==='/'?'':'/'+raw).replace(':id',id);
   for(const action of (name==='handoverResolve'?['accept','reject','cancel']:[''])){
    const url=path.replace(':action',action),body=bodies[name]??{};
    for(const role of [null,'REVOKED','UNKNOWN','JEFA-password','CAJERO-password','JEFA-missing','CAJERO-string','JEFA','CAJERO','TRANSFERISTA']){
     const before=calls,response=await invoke(method,url,role,body);checks++;
     const allowed=policy[name].includes(role);
     assert.equal(response.status,allowed?(method==='POST'?201:200):(!role||role==='REVOKED'?401:403),`${role} ${method} ${url}: ${await response.text()}`);
     assert.equal(calls-before,allowed?1:0);
    }
    for(const query of ['userId='+id,'branchId='+id,'roleCode=JEFA','day=2026-11-06&day=2026-11-07']){
     const before=calls;assert.equal((await invoke(method,url+'?'+query,policy[name][0],body)).status,400,`${name} query`);checks++;assert.equal(calls,before);
    }
    if(url.includes(id)){
     const before=calls;assert.equal((await invoke(method,url.replace(id,'bad-private-marker'),policy[name][0],body)).status,400);checks++;assert.equal(calls,before);
    }
    if(['cancelClose','handoverResolve','acknowledge','openPrepared','rejectClose'].includes(name)){
     for(const extra of [{userId:id},{expectedVersion:'1'},[],{status:'ACEPTADO'}]){
      const before=calls;assert.equal((await invoke(method,url,policy[name][0],extra)).status,400);checks++;assert.equal(calls,before);
     }
    }
   }
  }
  const before=calls;assert.equal((await invoke('POST','/handovers/'+id+'/force','CAJERO',{})).status,400);assert.equal(calls,before);
  assert.equal((await invoke('GET','/dashboard?from=2026-11-01&to=2026-11-06','JEFA')).status,200);
  for(const [path,body] of [['/'+id+'/cash-count',{counts:{...counts,USD:[{denomination:1,piles25:0,loose:1,ownerId:id}]},changeNio:0}],['/'+id+'/account-balances',{balances:[{account:'QA',amount:1,branchId:id}]}]]){
   const before=calls;assert.equal((await invoke('PUT',path,'CAJERO',body)).status,400);assert.equal(calls,before);
  }
  console.log(`Shift HTTP matrix: 26 handlers, ${checks} role/contract cases; action, date and nested-field checks also passed.`);
 }finally{await app.close();}
});
test('new shift handlers are denied until a policy is explicitly assigned',()=>{
 const context={getHandler:()=>function unreviewedHandler(){},switchToHttp:()=>({getRequest:()=>({user:{id,roleCode:'JEFA',sessionVersion:1}})})};
 assert.throws(()=>new ShiftsRouteGuard().canActivate(context),e=>e.getStatus()===403);
});
