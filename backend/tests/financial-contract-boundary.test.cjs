const test=require('node:test');
const assert=require('node:assert/strict');
require('reflect-metadata');
const {Module,UnauthorizedException}=require('@nestjs/common');
const {NestFactory,Reflector}=require('@nestjs/core');
const {AuthGuard}=require('../dist/modules/auth/auth.guard');
const {ShiftsController}=require('../dist/modules/shifts/shifts.controller');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {HandoversService}=require('../dist/modules/shifts/handovers.service');
const {TransfersController}=require('../dist/modules/transfers/transfers.controller');
const {TransfersService}=require('../dist/modules/transfers/transfers.service');
const shifts=require('../dist/modules/shifts/shifts.schema');
const {transferSchema,voidTransferSchema}=require('../dist/modules/transfers/transfers.schema');
const id='11111111-1111-4111-8111-111111111111';
const counts={NIO:[{denomination:.5,piles25:0,loose:1},{denomination:.25,piles25:0,loose:2}],USD:[{denomination:100,piles25:0,loose:1}]};
const balances=[{account:'BAC NIO',amount:-10,income:20,expense:30}];
const opening={branch:'QA',register:'Caja QA',cashier:'Cajera QA',counts,balances,prepared:true};
const closing={counts,balances,changeNio:-.25,observations:'QA'};
const transfer={type:'EFECTIVO',direction:'EGRESO',currency:'NIO',amount:1,cashLines:counts.NIO};
const inputs=[
  [shifts.openShiftSchema,opening],
  [shifts.updateShiftSchema,opening],
  [shifts.saveCashCountSchema,{counts,changeNio:-.25}],
  [shifts.saveBalancesSchema,{balances}],
  [shifts.closeShiftSchema,closing],
  [shifts.updateClosedShiftSchema,{opening:{counts,balances},closing:{counts,balances,changeNio:.25}}],
  [transferSchema,transfer],
  [voidTransferSchema,{reason:'Correccion QA',requestId:id,expectedVersion:'1'}],
];

test('financial contracts preserve coins, negative balances/differences and supported options',()=>{
  for(const [schema,input]of inputs)assert.equal(schema.safeParse(input).success,true,JSON.stringify(input));
  assert.deepEqual(shifts.cashCountsSchema.parse(counts),counts);
  assert.equal(transferSchema.parse(transfer).description,'');
  assert.equal(shifts.closeShiftSchema.parse({counts,balances,changeNio:0}).observations,'');
});

test('financial contracts reject unexpected top-level identity, status and server fields',()=>{
  for(const [schema,input]of inputs)for(const key of ['userId','id_usuario_creacion','roleCode','estado','database_id','__proto__']){
    const candidate=JSON.parse(JSON.stringify({...input,[key]:'private-value-not-to-echo'}));
    assert.equal(schema.safeParse(candidate).success,false,key);
  }
});

test('nested financial contracts reject extra fields and unsupported currency blocks',()=>{
  for(const key of ['NIO','USD']){
    const candidate={...counts,[key]:[{...counts[key][0],id_arqueo:id}]};
    assert.equal(shifts.cashCountsSchema.safeParse(candidate).success,false);
  }
  assert.equal(shifts.cashCountsSchema.safeParse({...counts,EUR:[]}).success,false);
  assert.equal(shifts.saveBalancesSchema.safeParse({balances:[{...balances[0],calculated:0}]}).success,false);
  assert.equal(transferSchema.safeParse({...transfer,cashLines:[{...counts.NIO[0],id_turno:id}]}).success,false);
  assert.equal(shifts.updateClosedShiftSchema.safeParse({opening:{counts,balances,estado:'ABIERTO'},closing:{counts,balances,changeNio:0}}).success,false);
  assert.equal(shifts.updateClosedShiftSchema.safeParse({opening:{counts,balances},closing:{counts,balances,changeNio:0,id_cajero:id}}).success,false);
});

test('numeric and array limits remain enforced without coercing monetary strings',()=>{
  for(const amount of [NaN,Infinity,-Infinity,'1',0,-1])assert.equal(transferSchema.safeParse({...transfer,amount}).success,false);
  for(const loose of [-1,.5,1000001,'1'])assert.equal(shifts.cashCountsSchema.safeParse({NIO:[{denomination:1,piles25:0,loose}],USD:[]}).success,false);
  assert.equal(shifts.cashCountsSchema.safeParse({NIO:Array(31).fill(counts.NIO[0]),USD:[]}).success,false);
  assert.equal(shifts.saveBalancesSchema.safeParse({balances:Array(101).fill(balances[0])}).success,false);
});

test('HTTP financial boundary rejects invalid contracts/auth before invoking services across 12 write routes',async()=>{
  const calls=[];
  const stub=Object.fromEntries(['create','update','updateClosed','saveCashCount','saveBalances','close','requestClose','propose','registerDifference','void'].map(method=>[method,async(...args)=>{calls.push({method,args});return {ok:true};}]));
  class BoundaryModule{}
  Module({controllers:[ShiftsController,TransfersController],providers:[ShiftsService,HandoversService,TransfersService].map(provide=>({provide,useValue:stub}))})(BoundaryModule);
  const app=await NestFactory.create(BoundaryModule,{logger:false});app.setGlobalPrefix('api');
  app.useGlobalGuards(new AuthGuard(new Reflector(),{validateAccessToken:async token=>{
    if(token==='revoked')throw new UnauthorizedException();
    return {id,roleCode:token==='unknown'?'OTHER':'JEFA',mustChangePassword:token==='change',sessionVersion:1};
  }}));
  const routes=[
    ['POST','shifts',opening,'create'],
    ['PUT',`shifts/${id}`,opening,'update'],
    ['PUT',`shifts/${id}/closed`,{opening:{counts,balances},closing:{counts,balances,changeNio:0}},'updateClosed'],
    ['PUT',`shifts/${id}/cash-count`,{counts,changeNio:0},'saveCashCount'],
    ['PUT',`shifts/${id}/account-balances`,{balances},'saveBalances'],
    ['POST',`shifts/${id}/close`,closing,'close'],
    ['POST',`shifts/${id}/close-request`,{observations:'QA'},'requestClose'],
    ['POST',`shifts/${id}/handovers`,{requestId:id,receiverId:id,expectedVersion:'a'.repeat(64),mode:'EN_REVISION'},'propose'],
    ['POST',`shifts/${id}/handover-difference`,{expectedVersion:'a'.repeat(64)},'registerDifference'],
    ['POST','transfers',transfer,'create'],
    ['PUT',`transfers/${id}`,transfer,'update'],
    ['POST',`transfers/${id}/void`,{reason:'Correccion QA'},'void'],
  ];
  try{
    await app.listen(0,'127.0.0.1');const base=await app.getUrl();
    for(const [method,path,body,service]of routes){
      const send=(payload,token='valid')=>fetch(`${base}/api/${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(5000)});
      const before=calls.length;
      const invalid=await send({...body,id_usuario_creacion:'private-value-not-to-echo'});
      assert.equal(invalid.status,400,path);
      assert.ok(!(await invalid.text()).includes('private-value-not-to-echo'));
      for(const [token,status]of [[null,401],['revoked',401],['unknown',403],['change',403]])assert.equal((await send(body,token)).status,status,path);
      assert.equal(calls.length,before,'Rejected requests never reach a service');
      const accepted=await send(body);assert.ok([200,201].includes(accepted.status),`${path}: ${await accepted.text()}`);
      assert.equal(calls.length,before+1);assert.equal(calls.at(-1).method,service);
      assert.ok(calls.at(-1).args.some(value=>value?.id===id&&value?.roleCode==='JEFA'),'Only the authenticated actor is forwarded');
    }
  }finally{await app.close();}
});
