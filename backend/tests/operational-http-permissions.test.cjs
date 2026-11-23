require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {Module,RequestMethod,UnauthorizedException}=require('@nestjs/common');
const {PATH_METADATA,METHOD_METADATA}=require('@nestjs/common/constants');
const {NestFactory,Reflector}=require('@nestjs/core');
const {AuthGuard}=require('../dist/modules/auth/auth.guard');
const {DatabaseService}=require('../dist/modules/database/database.service');
const {TransactionsController}=require('../dist/modules/transactions/transactions.controller');
const {TransactionsService}=require('../dist/modules/transactions/transactions.service');
const {TransfersController}=require('../dist/modules/transfers/transfers.controller');
const {TransfersService}=require('../dist/modules/transfers/transfers.service');
const {DollarPurchasesController}=require('../dist/modules/dollar-purchases/dollar-purchases.controller');
const {DollarPurchasesService}=require('../dist/modules/dollar-purchases/dollar-purchases.service');
const id='11111111-1111-4111-8111-111111111111';
const rates={buy:36.4,sell:37},counts={NIO:[],USD:[]};
const settlement={primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:counts,changeCounts:counts};
const item={entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount:10};
const edit={...item,rates,settlement,requestId:id,expectedVersion:'1'};
const transfer={requestId:id,expectedVersion:'1',shiftId:id,type:'EFECTIVO',direction:'EGRESO',currency:'NIO',amount:10,cashLines:[{denomination:10,piles25:0,loose:1}]};
const inputs={exportFiltered:{format:'EXCEL',query:{}},exportRows:{format:'EXCEL',ids:[]},createBatch:{rates,settlement,transactions:[item],requestId:id},update:edit,voidTransaction:{requestId:id,expectedVersion:'1'},updateGroup:{requestId:id,expectedVersion:'1',updates:[{id,data:edit}],voidIds:[],preferential:false},reopenPayments:{paymentIds:[id]},payPending:{rates,settlement,requestId:id},reopenPendingPayment:{},payPendingBatch:{pendingIds:[id],method:'EFECTIVO',rates,settlement,requestId:id}};

test('HTTP operational matrix: every financial route rejects unauthorized identities before service/SQL and preserves allowed roles',async()=>{
 let calls=0;const events=[];
 const service=()=>new Proxy({}, {get:(_,name)=>name==='then'?undefined:(...args)=>{calls++;events.push({name,args});return [];}});
 const db={query:async(sql)=>{calls++;return {rowCount:1,rows:sql.includes('as totals')?[{total:0,totals:{},rows:[]}]:[]};},transaction:async work=>work({query:async()=>{calls++;return {rowCount:1,rows:[{}]};}})};
 const controllers=[TransactionsController,TransfersController,DollarPurchasesController];
 class Fixture{}Module({controllers,providers:[{provide:DatabaseService,useValue:db},...[TransactionsService,TransfersService,DollarPurchasesService].map(provide=>({provide,useValue:service()}))]})(Fixture);
 const app=await NestFactory.create(Fixture,{logger:false});app.setGlobalPrefix('api');
 app.useGlobalGuards(new AuthGuard(new Reflector(),{validateAccessToken:async token=>{
   if(token==='REVOKED')throw new UnauthorizedException('Expired');
   return {id,roleCode:token.split('-')[0],sessionVersion:token.endsWith('-missing')?undefined:token.endsWith('-string')?'1':1,mustChangePassword:token.endsWith('-password')};
 }}));
 let checked=0;
 try{await app.listen(0,'127.0.0.1');const url=await app.getUrl();
  const invoke=(method,path,role,body)=>fetch(url+'/api/'+path,{method,headers:{...(role?{authorization:'Bearer '+role}:{}),'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body??{})})});
  const routes=controllers.flatMap(C=>Object.getOwnPropertyNames(C.prototype).filter(name=>Reflect.hasMetadata(METHOD_METADATA,C.prototype[name])).map(name=>({name,controller:C,method:RequestMethod[Reflect.getMetadata(METHOD_METADATA,C.prototype[name])],path:[Reflect.getMetadata(PATH_METADATA,C),Reflect.getMetadata(PATH_METADATA,C.prototype[name])].filter(p=>p&&p!=='/').join('/').replace(':id',id)})));
  assert.equal(routes.length,23,'Update the explicit matrix when adding a route');
  for(const route of routes){
   const {method,path,name,controller}=route;
   const body=controller===TransfersController?(name==='void'?{reason:'QA reason',requestId:id,expectedVersion:'1'}:transfer):inputs[name];
   const allowed=controller===TransfersController?['JEFA','CAJERO','TRANSFERISTA']:['JEFA','CAJERO'];
   for(const role of [null,'REVOKED','UNKNOWN','JEFA-password','CAJERO-password','JEFA-missing','JEFA-string',...['JEFA','CAJERO','TRANSFERISTA']]){
    const before=calls,r=await invoke(method,path,role,body);checked++;
    const ok=allowed.includes(role);
    assert.equal(r.status,ok?(method==='POST'?201:200):(!role||role==='REVOKED'?401:403),`${role} ${method} ${path}: ${await r.text()}`);
    if(!ok)assert.equal(calls,before,'Denied HTTP request must not reach service or database');
    else assert.ok(calls>before,'Allowed request reaches its handler');
   }
   for(const query of ['roleCode=JEFA','shiftId='+id,'limit=1&limit=2','ids%5B%5D='+id]){
    const before=calls,r=await invoke(method,path+'?'+query,'JEFA',body);checked++;
    assert.equal(r.status,400,`${method} ${path}?${query}`);assert.equal(calls,before);
   }
   if(path.includes(id)){
    const before=calls;assert.equal((await invoke(method,path.replace(id,'not-a-uuid'),'JEFA',body)).status,400);checked++;assert.equal(calls,before);
   }
  }
  // Keep supported pagination/filtering; unknown, duplicated or forged fields fail above.
  assert.equal((await invoke('GET','transactions?limit=20&offset=0','CAJERO')).status,200);
  assert.equal((await invoke('GET','transactions/table?currency=USD&sort=amount&direction=asc','CAJERO')).status,200);
  for(const [path,body] of [['transactions/pending/'+id+'/reopen',{userId:id}],['transfers',{...transfer,id_usuario_creacion:id}],['transactions/batch',{...inputs.createBatch,roleCode:'JEFA'}]]){
   const before=calls;assert.equal((await invoke('POST',path,'CAJERO',body)).status,400);assert.equal(calls,before);checked++;
  }
  // A supplied userId is supported for legacy clients, but never controls attribution.
  await invoke('POST','transactions/batch','CAJERO',{...inputs.createBatch,userId:'22222222-2222-4222-8222-222222222222'});
  const applied=events.filter(e=>e.name==='createBatch').at(-1);assert.equal(applied.args[0].userId,id);assert.equal(applied.args[1].actor.id,id);
  console.log(`Operational HTTP matrix: ${routes.length} routes, ${checked} negative/role checks plus supported-query and attribution checks.`);
 }finally{await app.close();}
});

test('transfer and dollar read services reject unsupported roles or forced password changes without SQL',async()=>{
 let calls=0;const db={query:async()=>{calls++;return {rows:[],rowCount:0};}};
 const transfers=new TransfersService(db),dollars=new DollarPurchasesService(db);
 for(const user of [{id,roleCode:'UNKNOWN'},{id,roleCode:'JEFA',mustChangePassword:true}]){
  for(const run of [()=>transfers.list(user),()=>transfers.context(user),()=>transfers.detail(id,user),()=>dollars.list(user)])await assert.rejects(run,e=>e.getStatus()===403);
 }
 await assert.rejects(()=>dollars.list({id,roleCode:'TRANSFERISTA'}),e=>e.getStatus()===403);assert.equal(calls,0);
});


test('unreviewed financial endpoints fail closed over HTTP with each controller guard', async () => {
 const {Controller,Get,Post,UseGuards}=require('@nestjs/common');
 const {GUARDS_METADATA}=require('@nestjs/common/constants');
 let calls=0;
 const controllers=[TransactionsController,TransfersController,DollarPurchasesController].map((source,index)=>{
  class Unreviewed { unreviewedRead(){calls++;return {};} unreviewedWrite(){calls++;return {};} }
  Controller('unreviewed-'+index)(Unreviewed);
  UseGuards(...Reflect.getMetadata(GUARDS_METADATA,source))(Unreviewed);
  Get()(Unreviewed.prototype,'unreviewedRead',Object.getOwnPropertyDescriptor(Unreviewed.prototype,'unreviewedRead'));
  Post()(Unreviewed.prototype,'unreviewedWrite',Object.getOwnPropertyDescriptor(Unreviewed.prototype,'unreviewedWrite'));
  return Unreviewed;
 });
 class Fixture{} Module({controllers})(Fixture);
 const app=await NestFactory.create(Fixture,{logger:false});
 app.useGlobalGuards(new AuthGuard(new Reflector(),{validateAccessToken:async roleCode=>({id,roleCode,sessionVersion:1})}));
 try{
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  for(let index=0;index<controllers.length;index++)for(const method of ['GET','HEAD','POST'])for(const role of ['JEFA','CAJERO','TRANSFERISTA']){
   const response=await fetch(base+'/unreviewed-'+index,{method,headers:{authorization:'Bearer '+role}});
   assert.equal(response.status,403,`${index} ${method} ${role}`);
  }
  assert.equal(calls,0);
 }finally{await app.close();}
});

test('financial policy rejects unknown modules, inherited names and cross-module handlers',()=>{
 const {FinancialRouteGuard}=require('../dist/common/financial-route.guard');
 for(const [module,names] of [['transactions',['constructor','toString','create','context']],['transfers',['exportRows','payPending','constructor']],['dollar-purchases',['detail','createBatch','void']],['constructor',['list']],['unknown',['list']]]){
  for(const name of names){
   const handler=Object.defineProperty(()=>{},'name',{value:name});
   const context={getHandler:()=>handler,switchToHttp:()=>({getRequest:()=>({user:{id,roleCode:'JEFA',sessionVersion:1}})})};
   assert.throws(()=>new FinancialRouteGuard(module).canActivate(context),error=>error.getStatus()===403);
  }
 }
});
