const test=require('node:test');
const assert=require('node:assert/strict');
require('reflect-metadata');
const {Module,ForbiddenException,UnauthorizedException}=require('@nestjs/common');
const {NestFactory,Reflector}=require('@nestjs/core');
const {parseTransactionQuery,parseDashboardQuery}=require('../dist/common/read-query');
const {TransactionsController}=require('../dist/modules/transactions/transactions.controller');
const {TransactionsService}=require('../dist/modules/transactions/transactions.service');
const {ShiftsController}=require('../dist/modules/shifts/shifts.controller');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {HandoversService}=require('../dist/modules/shifts/handovers.service');
const {DatabaseService}=require('../dist/modules/database/database.service');
const {AuthGuard}=require('../dist/modules/auth/auth.guard');
const {ReadWorkloadInterceptor}=require('../dist/common/read-workload.interceptor');
const id='11111111-1111-4111-8111-111111111111';

test('pagination accepts only bounded decimal integers and preserves defaults',()=>{
  assert.deepEqual(parseTransactionQuery({}),{limit:50,offset:0});
  assert.deepEqual(parseTransactionQuery({limit:'200',offset:'2147483647'}),{limit:200,offset:2147483647});
  for(const limit of ['','0','201','-1','1.5','1e2','20junk',' 20','01',20,['20'],{value:'20'}])assert.throws(()=>parseTransactionQuery({limit}),error=>error.getStatus()===400);
  for(const offset of ['-1','2147483648','9007199254740993','1;select secret','1.5',['0','1']])assert.throws(()=>parseTransactionQuery({offset}),error=>error.getStatus()===400);
  assert.throws(()=>parseTransactionQuery({userId:id}),error=>error.getStatus()===400);
});

test('dashboard reads and PNG accept exact dates, leap years and the existing range limit',()=>{
  for(const value of [{},{day:'2026-10-29'},{from:'2028-02-29',to:'2028-03-01'},
    {from:'2026-01-01',to:'2027-01-02'},{from:'2026-10-01',to:'2026-10-31',day:'2026-09-30'}])assert.deepEqual(parseDashboardQuery(value),value);
  for(const value of [{from:'2026-02-29',to:'2026-03-01'},{day:'0000-01-01'},
    {day:'2026-10-29T00:00:00Z'},{day:['2026-10-29']},{day:''},{from:'2026-01-01'},
    {to:'2026-01-01'},{from:'2026-10-02',to:'2026-10-01'},{from:'2026-01-01',to:'2027-01-03'},
    {from:'2026-01-01',to:'2026-01-02',role:'JEFA'},{day:'private-query-marker'}]){
    assert.throws(()=>parseDashboardQuery(value),error=>error.getStatus()===400&&!error.message.includes('private-query-marker'));
  }
});

test('all five transaction read entry points deny unsupported profiles before SQL or services',async()=>{
  let calls=0;
  const handler=async()=>{calls++;return [];};
  const controller=new TransactionsController({query:handler},{detail:handler,groupDetail:handler,listPending:handler,pendingPaymentDetail:handler,applyHistoricalRows:handler});
  const reads=user=>[
    ()=>controller.list('50','0',{user}),()=>controller.detail(id,{user}),()=>controller.groupDetail(id,{user}),
    ()=>controller.pending({user}),()=>controller.pendingPayments(id,{user}),
  ];
  for(const user of [{id,roleCode:'TRANSFERISTA'},{id,roleCode:'OTHER'},{id,roleCode:'JEFA',mustChangePassword:true}]){
    for(const read of reads(user))await assert.rejects(async()=>read(),error=>error.getStatus()===403);
  }
  assert.equal(calls,0);
  for(const roleCode of ['JEFA','CAJERO'])for(const read of reads({id,roleCode}))await read();
  assert.ok(calls>0);
});

test('HTTP query pollution, repeated parameters and forged scope fail before SQL',async()=>{
  const calls=[];
  let holdReads=false;const waiters=[];
  const db={query:async(sql,args)=>{calls.push({sql,args});if(holdReads)await new Promise(resolve=>waiters.push(resolve));return {rows:[]};}};
  const transactions={applyHistoricalRows:async rows=>rows};
  const shifts={dashboard:async(user,...args)=>{
    if(user.roleCode!=='JEFA')throw new ForbiddenException();
    calls.push({dashboard:args});return {ok:true};
  },exportDashboard:async()=>{calls.push({export:true});return {ok:true};}};
  class BoundaryModule{}
  Module({controllers:[TransactionsController,ShiftsController],providers:[
    {provide:DatabaseService,useValue:db},{provide:TransactionsService,useValue:transactions},
    {provide:ShiftsService,useValue:shifts},{provide:HandoversService,useValue:{}},
  ]})(BoundaryModule);
  const app=await NestFactory.create(BoundaryModule,{logger:false});app.setGlobalPrefix('api');
  app.useGlobalInterceptors(new ReadWorkloadInterceptor());
  app.useGlobalGuards(new AuthGuard(new Reflector(),{validateAccessToken:async token=>{
    if(token==='revoked')throw new UnauthorizedException();
    return {id,roleCode:token==='cashier'?'CAJERO':token==='transfer'?'TRANSFERISTA':'JEFA',mustChangePassword:token==='change'};
  }}));
  try{
    await app.listen(0,'127.0.0.1');const base=await app.getUrl();
    const get=(path,token='admin')=>fetch(base+'/api/'+path,{headers:token?{Authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(5000)});
    for(const path of ['transactions?limit=10&limit=20','transactions?offset=1&offset=2',
      'transactions?limit%5Bvalue%5D=20','transactions?offset=1e3','transactions?userId='+id,
      'transactions?limit=10private-query-marker','transactions?limit=201',
      'shifts/dashboard?from=2026-10-01&to=2026-10-31&from=2026-09-01',
      'shifts/dashboard?day=0000-01-01','shifts/dashboard?from=2026-01-01',
      'shifts/dashboard?day=2026-10-29&roleCode=JEFA']){
      const response=await get(path);assert.equal(response.status,400,path);
      assert.ok(!(await response.text()).includes('private-query-marker'));
    }
    for(const [token,status]of [[null,401],['revoked',401],['change',403],['transfer',403]])assert.equal((await get('transactions',token)).status,status);
    assert.equal(calls.length,0,'No rejected request queries the database');
    for(const token of ['admin','cashier']){
      assert.equal((await get('transactions?limit=200&offset=0',token)).status,200);
      assert.deepEqual(calls.at(-1).args,[200,0,token==='admin'?'JEFA':'CAJERO',id,null]);
    }
    assert.equal((await get('shifts/dashboard?from=2026-10-01&to=2026-10-31&day=2026-10-29')).status,200);
    assert.deepEqual(calls.at(-1).dashboard,['2026-10-01','2026-10-31','2026-10-29']);
    const before=calls.length;
    const invalidExport=await fetch(base+'/api/shifts/dashboard/export',{method:'POST',headers:{Authorization:'Bearer admin','Content-Type':'application/json'},body:JSON.stringify({day:['2026-10-29']})});
    assert.equal(invalidExport.status,400);assert.equal(calls.length,before);
    holdReads=true;
    const active=Array.from({length:4},()=>get('transactions?limit=1'));
    try{
      const deadline=Date.now()+3000;
      while(waiters.length<4&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
      assert.equal(waiters.length,4);
      const busy=await get('transactions?limit=1');assert.equal(busy.status,429);assert.equal(busy.headers.get('retry-after'),'1');
      const write=await fetch(base+'/api/transactions/batch',{method:'POST',headers:{Authorization:'Bearer admin','Content-Type':'application/json'},body:'{}'});
      assert.equal(write.status,400,'Writes are validated normally, not blocked by report concurrency');
    }finally{holdReads=false;waiters.splice(0).forEach(resolve=>resolve());await Promise.allSettled(active);}
    assert.equal((await get('transactions?limit=1')).status,200,'Slots are reusable after HTTP responses finish');
  }finally{await app.close();}
});
