require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{Client}=require('pg');
const {Module,UnauthorizedException}=require('@nestjs/common');
const {NestFactory,Reflector}=require('@nestjs/core');
const {AuthGuard}=require('../dist/modules/auth/auth.guard');
const {DatabaseService}=require('../dist/modules/database/database.service');
const {TransactionsController}=require('../dist/modules/transactions/transactions.controller');
const {TransactionsService}=require('../dist/modules/transactions/transactions.service');
const {ShiftsController}=require('../dist/modules/shifts/shifts.controller');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {HandoversService}=require('../dist/modules/shifts/handovers.service');
const {TransfersController}=require('../dist/modules/transfers/transfers.controller');
const {TransfersService}=require('../dist/modules/transfers/transfers.service');
const {DollarPurchasesController}=require('../dist/modules/dollar-purchases/dollar-purchases.controller');
const {DollarPurchasesService}=require('../dist/modules/dollar-purchases/dollar-purchases.service');
const {createTransactionBatchSchema}=require('../dist/modules/transactions/transaction-batch.schema');
const counts=n=>({NIO:n?[{denomination:10,piles25:0,loose:n/10}]:[],USD:[]});
const settlement=n=>({primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:counts(n),changeCounts:counts(0)});

test('HTTP and real SQL scope matrix: roles, branches, shift states, shared pending, totals and exports', {skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
 const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,extensions,public',statement_timeout:15000});
 await c.connect();await c.query('begin');let seq=0,app,checked=0;
 const db={query:(sql,args)=>c.query(sql,args),transaction:async work=>{
  const save='scope_'+(++seq);await c.query('savepoint '+save);
  try{const result=await work(c);await c.query('release savepoint '+save);return result;}
  catch(e){await c.query('rollback to savepoint '+save);await c.query('release savepoint '+save);throw e;}
 }};
 try{
  if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
  const prefix='SCOPE_'+randomUUID().replaceAll('-','').slice(0,16),actors={};
  for(const [name,role] of [['admin','JEFA'],['owner','CAJERO'],['peer','CAJERO'],['other','CAJERO'],['transfer','TRANSFERISTA']]){
   actors[name]=(await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
    select id_rol,$1,'QA',$2,'not-a-login-credential','ACTIVO',false from temo.roles where codigo=$3
    returning id_usuario as id,version_sesion as "sessionVersion",usuario as username,$3::text as "roleCode"`,[prefix,prefix+name,role])).rows[0];
  }
  const branches=[];
  for(let i=0;i<2;i++){
   const branch=(await c.query(`insert into temo.sucursales(codigo,nombre,estado) values($1,$1,'ACTIVO') returning id_sucursal as id,nombre`,[prefix+i])).rows[0];branches.push(branch);
   await c.query(`insert into temo.cuentas_sucursales(id_sucursal,id_cuenta) select $1,cb.id_cuenta from temo.cuentas_bancarias cb join temo.entidades_bancarias e using(id_entidad) where cb.estado='ACTIVO' and e.codigo='BAC'`,[branch.id]);
  }
  const shifts=new ShiftsService(db),transactions=new TransactionsService(db),transfers=new TransfersService(db),purchases=new DollarPurchasesService(db),records={};
  for(const [index,name] of ['owner','peer','other'].entries()){
   const actor=actors[name],branch=branches[index===2?1:0];
   await c.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[actor.id,branch.id]);
   const shift=await shifts.create({branchId:branch.id,branch:branch.nombre,register:'QA '+index,cashier:actor.username,counts:counts(1000),balances:[],notes:prefix,prepared:false},actors.admin);
   const group=async(currency,amount,cash,pending=false)=>transactions.createBatch(createTransactionBatchSchema.parse({requestId:randomUUID(),shiftId:shift.database_id,userId:actor.id,rates:{buy:36.4,sell:37},transactions:[{entityCode:'BAC',movementCode:'DC',currencyCode:currency,amount,description:prefix,...(pending?{pendingName:prefix+name}:{})}],settlement:{...settlement(cash),primaryRateKind:currency==='USD'?'VENTA':'COMPRA'}}),{actor});
   const normal=await group('NIO',10,10),dollar=await group('USD',10,370),pending=await group('NIO',10,0,true);
   const pendingId=(await c.query('select id_pendiente from temo.pagos_pendientes where id_transaccion=$1',[pending.transactions[0].id])).rows[0].id_pendiente;
   const transfer=await transfers.create({shiftId:shift.database_id,type:'EFECTIVO',direction:'EGRESO',currency:'NIO',amount:100,cashLines:counts(100).NIO,description:prefix},actor);
   records[name]={shift:shift.database_id,normal:normal.transactions[0].id,dollar:dollar.transactions[0].id,pending:pending.transactions[0].id,pendingId,transfer:transfer.database_id};
  }
  class Fixture{}Module({controllers:[TransactionsController,ShiftsController,TransfersController,DollarPurchasesController],providers:[{provide:DatabaseService,useValue:db},{provide:TransactionsService,useValue:transactions},{provide:ShiftsService,useValue:shifts},{provide:HandoversService,useValue:new HandoversService(db,shifts)},{provide:TransfersService,useValue:transfers},{provide:DollarPurchasesService,useValue:purchases}]})(Fixture);
  app=await NestFactory.create(Fixture,{logger:false});app.setGlobalPrefix('api');
  // Tokens identify synthetic fixture users only; AuthGuard and every route/service/SQL are real.
  app.useGlobalGuards(new AuthGuard(new Reflector(),{validateAccessToken:async token=>{if(!actors[token])throw new UnauthorizedException();return actors[token];}}));
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const invoke=async(path,actor,status=200,body)=>{
   const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+actor,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});checked++;
   assert.equal(response.status,status,`${actor} ${path} expected ${status}, got ${response.status}`);
   return response.json();
  };
  const ownIds=name=>['normal','dollar','pending'].map(key=>records[name][key]);
  const allIds=Object.values(records).flatMap(row=>['normal','dollar','pending'].map(key=>row[key]));
  const ownFiltered=(rows,ids=allIds)=>rows.filter(row=>ids.includes(row.database_id)).map(row=>row.database_id).sort();
  const auditCount=async()=>(await c.query("select count(*)::int n from temo.bitacora where accion='EXPORTAR' and id_usuario=any($1::uuid[])",[Object.values(actors).map(a=>a.id)])).rows[0].n;
  for(const state of ['ABIERTO','PENDIENTE_APROBACION','EN_REVISION','CERRADO'])await t.test('scope in source state '+state,async()=>{
   await c.query('savepoint phase');try{
    await c.query('update temo.turnos set estado=$2 where id_turno=$1',[records.owner.shift,state]);
    const active=state!=='CERRADO';
    for(const name of Object.keys(actors)){
     const boss=name==='admin',owner=name==='owner',cashier=['owner','peer','other'].includes(name);
     await invoke('/shifts/'+records.owner.shift,name,boss||owner?200:404);
     const transferAllowed=boss||name==='transfer'||owner&&active;
     await invoke('/transfers/'+records.owner.transfer,name,transferAllowed?200:403);
     await invoke('/transactions/'+records.owner.normal+'/detail',name,boss||owner&&active?200:403);
     // Peer sees a pending group of the same branch/day, never an unrelated group.
     const pendingAllowed=boss||owner&&active||name==='peer';
     await invoke('/transactions/'+records.owner.pending+'/group-detail',name,pendingAllowed?200:403);
     await invoke('/transactions/pending/'+records.owner.pendingId+'/payments',name,pendingAllowed?200:403);
     if(cashier||boss){
      const expected=boss?allIds:owner&&!active?[]:ownIds(name);
      const listed=await invoke('/transactions?limit=200',name);assert.deepEqual(ownFiltered(listed),[...expected].sort());
      const table=await invoke('/transactions/table?search='+prefix+'&limit=1',name);assert.equal(table.total,expected.length);assert.equal(table.rows.length,Math.min(1,expected.length));
      const exported=await invoke('/transactions/export-filtered',name,201,{format:'EXCEL',query:{search:prefix,limit:'1'}});assert.deepEqual(ownFiltered(exported),[...expected].sort());
      const pendingRows=await invoke('/transactions/pending',name);
      const expectedPending=boss?Object.values(records).map(r=>r.pendingId):name==='other'?[records.other.pendingId]:owner&&!active?[]:owner&&state==='EN_REVISION'?[records.owner.pendingId]:[records.owner.pendingId,records.peer.pendingId];
      const actualPending=pendingRows.filter(row=>Object.values(records).some(r=>r.pendingId===row.database_id)).map(row=>row.database_id);
      assert.deepEqual(actualPending.sort(),expectedPending.sort());
     }else{
      await invoke('/transactions/table?search='+prefix,name,403);await invoke('/dollar-purchases',name,403);
     }
     const transferRows=await invoke('/transfers',name);const expectedTransfers=boss||name==='transfer'?Object.values(records).map(r=>r.transfer):owner&&!active?[]:[records[name].transfer];
     assert.deepEqual(ownFiltered(transferRows,Object.values(records).map(r=>r.transfer)),expectedTransfers.sort());
    }
    const before=await auditCount();
    await invoke('/transactions/export','peer',403,{format:'PDF',ids:[records.peer.normal,records.owner.normal]});
    await invoke('/shifts/export','peer',403,{format:'EXCEL',ids:[records.peer.shift,records.owner.shift]});
    assert.equal(await auditCount(),before,'Denied mixed exports cannot be audited as successful');
    const exported=await invoke('/transactions/export','admin',201,{format:'PDF',ids:[records.peer.normal,records.owner.normal]});assert.equal(exported.length,2);
   }finally{await c.query('rollback to savepoint phase');await c.query('release savepoint phase');}
  });
  await t.test('another day removes shared pending access while own live shift stays visible',async()=>{
   await c.query('savepoint phase');try{
    await c.query("update temo.turnos set fecha_apertura=fecha_apertura-interval '1 day' where id_turno=$1",[records.owner.shift]);
    await invoke('/transactions/'+records.owner.pending+'/detail','peer',403);
    await invoke('/transactions/pending/'+records.owner.pendingId+'/payments','peer',403);
    await invoke('/transactions/'+records.owner.pending+'/detail','owner');
    const rows=await invoke('/transactions/pending','peer');assert.ok(!rows.some(row=>row.database_id===records.owner.pendingId));
   }finally{await c.query('rollback to savepoint phase');await c.query('release savepoint phase');}
  });
  for(const timezone of ['UTC','America/Managua','Asia/Tokyo'])for(const sameDay of [false,true])await t.test(`pending sharing uses Managua day in ${timezone}: shared=${sameDay}`,async()=>{
   await c.query('savepoint phase');try{
    await c.query("select set_config('TimeZone',$1,true)",[timezone]);
    const source=sameDay?'2026-11-20T23:30:00Z':'2026-11-21T00:30:00Z';
    const target=sameDay?'2026-11-21T01:30:00Z':'2026-11-21T15:00:00Z';
    await c.query('update temo.turnos set fecha_apertura=$2 where id_turno=$1',[records.owner.shift,source]);
    await c.query('update temo.turnos set fecha_apertura=$2 where id_turno=$1',[records.peer.shift,target]);
    await invoke('/transactions/'+records.owner.pending+'/detail','peer',sameDay?200:403);
    await invoke('/transactions/'+records.owner.pending+'/group-detail','peer',sameDay?200:403);
    await invoke('/transactions/pending/'+records.owner.pendingId+'/payments','peer',sameDay?200:403);
    const rows=await invoke('/transactions/pending','peer');assert.equal(rows.some(row=>row.database_id===records.owner.pendingId),sameDay);
    await c.query('update temo.pagos_pendientes set fecha_creacion=$2 where id_pendiente=$1',[records.owner.pendingId,source]);
    const rates={buy:36.4,sell:37};
    const writes=[
     ['/transactions/pending/'+records.owner.pendingId+'/pay',{requestId:randomUUID(),rates,settlement:settlement(10)}],
     ['/transactions/pending/pay-batch',{requestId:randomUUID(),pendingIds:[records.owner.pendingId],method:'EFECTIVO',rates,settlement:settlement(10)}],
     ['/transactions/batch',{requestId:randomUUID(),shiftId:records.peer.shift,userId:actors.peer.id,rates,pendingSettlementIds:[records.owner.pendingId],transactions:[{entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount:10,description:prefix}],settlement:settlement(20)}],
    ];
    for(const [path,payload] of writes){
     await c.query('savepoint payment');try{
      const before=(await c.query('select estado,saldo_pendiente from temo.pagos_pendientes where id_pendiente=$1',[records.owner.pendingId])).rows[0];
      const auditBefore=(await c.query('select count(*)::int n from temo.bitacora')).rows[0].n;
      await invoke(path,'peer',sameDay?201:409,payload);
      const after=(await c.query('select estado,saldo_pendiente from temo.pagos_pendientes where id_pendiente=$1',[records.owner.pendingId])).rows[0];
      if(sameDay){assert.equal(after.estado,'PAGADO');assert.equal(Number(after.saldo_pendiente),0);}
      else{assert.deepEqual(after,before);assert.equal((await c.query('select count(*)::int n from temo.bitacora')).rows[0].n,auditBefore);}
     }finally{await c.query('rollback to savepoint payment');await c.query('release savepoint payment');}
    }

   }finally{await c.query('rollback to savepoint phase');await c.query('release savepoint phase');}
  });
  console.log(`Real SQL HTTP scope matrix: ${checked} requests; no fixture records committed.`);
 }finally{if(app)await app.close();await c.query('rollback');await c.end();}
});
