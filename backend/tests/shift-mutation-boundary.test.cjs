const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const counts=n=>({NIO:[{denomination:100,piles25:0,loose:n}],USD:[]});
const conflict=e=>e?.getStatus?.()===409;
const denied=e=>[403,404].includes(e.getStatus?.());
const closeInput={counts:counts(2),balances:[],changeNio:10,observations:'QA close'};
const correction={opening:{counts:counts(3),balances:[],notes:'QA opening'},closing:{counts:counts(2),balances:[],changeNio:10,notes:'QA closing'}};

test('shift mutation scope and stale snapshots: real SQL with rollback', {skip:!process.env.TEMO_TEST_PREVIEW}, async t=>{
 const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,extensions,public',statement_timeout:15000});
 await c.connect();await c.query('begin');let sequence=0,beforeWrite=null,failAudit=false;
 const query=(sql,args)=>{if(failAudit&&/insert into temo.bitacora/i.test(sql))throw new Error('QA audit unavailable');return c.query(sql,args);};
 const db={query,transaction:async work=>{
  if(beforeWrite){const hook=beforeWrite;beforeWrite=null;await hook();}
  const save='mutation_'+(++sequence);await c.query('savepoint '+save);
  try{const result=await work({query});await c.query('release savepoint '+save);return result;}
  catch(e){await c.query('rollback to savepoint '+save);await c.query('release savepoint '+save);throw e;}
 }};
 const service=new ShiftsService(db);
 try{
  if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
  const prefix='MUTATION_'+randomUUID().replaceAll('-','').slice(0,16);
  async function actor(role,index){return (await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
   select id_rol,'Mutation','QA',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo=$2
   returning id_usuario as id,usuario as username,version_sesion as "sessionVersion",$2::text as "roleCode"`,[prefix+index,role])).rows[0];}
  const admin=await actor('JEFA',0),owner=await actor('CAJERO',1),peer=await actor('CAJERO',2),other=await actor('CAJERO',3),transfer=await actor('TRANSFERISTA',4);
  const branches=[];
  for(let i=0;i<2;i++)branches.push((await c.query(`insert into temo.sucursales(codigo,nombre,estado) values($1,$1,'ACTIVO') returning id_sucursal as id,nombre`,[prefix+i])).rows[0]);
  const inputs=[],shifts=[];
  for(const [index,user] of [owner,peer,other].entries()){
   const branch=branches[index===2?1:0];
   await c.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[user.id,branch.id]);
   const input={branchId:branch.id,branch:branch.nombre,register:'QA '+index,cashier:user.username,counts:counts(1),balances:[],notes:'QA fixture',prepared:false};inputs.push(input);
   shifts.push(await service.create(input,admin));
  }
  const id=shifts[0].database_id;
  const snapshot=async()=>({
   totals:(await c.query('select efectivo_inicial_nio,efectivo_inicial_usd,efectivo_final_nio,efectivo_final_usd,cambio_nio,observaciones_apertura,observaciones_cierre from temo.turnos where id_turno=$1',[id])).rows,
   cash:(await c.query('select id_arqueo,id_caja,tipo,monto_total from temo.arqueos where id_turno=$1 order by id_arqueo',[id])).rows,
   lines:(await c.query('select ad.* from temo.arqueos_denominaciones ad join temo.arqueos a using(id_arqueo) where a.id_turno=$1 order by ad.id_arqueo,ad.id_denominacion',[id])).rows,
   balances:(await c.query('select * from temo.saldos_turno_cuentas where id_turno=$1 order by id_cuenta',[id])).rows,
   audit:(await c.query("select count(*)::int n from temo.bitacora where tabla='turnos' and id_registro=$1",[id])).rows[0].n,
  });
  async function scenario(name,work){await t.test(name,async()=>{await c.query('savepoint scenario');try{await work();}finally{beforeWrite=null;failAudit=false;await c.query('rollback to savepoint scenario');await c.query('release savepoint scenario');}});}
  await scenario('own shift reads and writes; peers in same/other branch cannot access or mutate it',async()=>{
   assert.equal((await service.detail(id,owner)).database_id,id);
   for(const user of [peer,other,transfer]){
    assert.ok(!(await service.list(user)).some(row=>row.database_id===id));
    await assert.rejects(service.detail(id,user),denied);
    await assert.rejects(service.saveCashCount(id,{counts:counts(2),changeNio:0},user),denied);
   }
   for(const user of [owner,peer,other,transfer])for(const run of [()=>service.update(id,inputs[0],user),()=>service.close(id,closeInput,user),()=>service.updateClosed(id,correction,user)])await assert.rejects(run(),denied);
   await service.saveCashCount(id,{counts:counts(2),changeNio:0},owner);
   assert.equal(Number((await service.detail(id,owner)).cashCounts.ACTUAL.NIO.total),200);
  });
  for(const state of ['CERRADO','EN_REVISION','ANULADO'])await scenario('opening edit rejects intervening state '+state,async()=>{
   const before=await snapshot();beforeWrite=()=>c.query('update temo.turnos set estado=$2 where id_turno=$1',[id,state]);
   await assert.rejects(service.update(id,{...inputs[0],counts:counts(9)},admin),conflict);assert.deepEqual(await snapshot(),before);
  });
  await scenario('closed correction rejects a shift that changed after preliminary authorization',async()=>{
   await service.close(id,closeInput,admin);const before=await snapshot();
   beforeWrite=()=>c.query("update temo.turnos set estado='ANULADO' where id_turno=$1",[id]);
   await assert.rejects(service.updateClosed(id,correction,admin),conflict);assert.deepEqual(await snapshot(),before);
  });
  await scenario('accepted handover arriving after preliminary read blocks historical correction',async()=>{
   await service.close(id,closeInput,admin);const before=await snapshot();
   beforeWrite=()=>c.query(`insert into temo.traspasos_turno(id_traspaso,id_turno_origen,id_turno_destino,id_emisor,id_receptor,estado,resumen)
    values($1,$2,$3,$4,$5,'ACEPTADO','{}')`,[randomUUID(),id,shifts[1].database_id,owner.id,peer.id]);
   await assert.rejects(service.updateClosed(id,correction,admin),conflict);assert.deepEqual(await snapshot(),before);
  });
  await scenario('cashier ownership is checked again after assignment changes',async()=>{
   const before=await snapshot();beforeWrite=async()=>{
    await c.query("update temo.turnos set estado='CERRADO' where id_turno=$1",[shifts[1].database_id]);
    await c.query('update temo.turnos set id_cajero=$2 where id_turno=$1',[id,peer.id]);
   };
   await assert.rejects(service.saveCashCount(id,{counts:counts(2),changeNio:0},owner),conflict);assert.deepEqual(await snapshot(),before);
  });
  for(const existing of [false,true])for(const kind of ['cash','close','closed'])await scenario(kind+' persists the current box (existing count: '+existing+')',async()=>{
   if(kind==='closed')await service.close(id,closeInput,admin);
   // Remove counts inside this rollback-only fixture so the insert path also checks its box FK.
   const type=kind==='cash'?'ACTUAL':kind==='close'?'CIERRE_CONTADO':'APERTURA';
   if(!existing)await c.query('delete from temo.arqueos where id_turno=$1 and tipo=$2',[id,type]);
   beforeWrite=()=>c.query('update temo.turnos set id_caja=$2 where id_turno=$1',[id,shifts[1].id_caja]);
   if(kind==='cash')await service.saveCashCount(id,{counts:counts(2),changeNio:0},owner);
   else if(kind==='close')await service.close(id,closeInput,admin);
   else await service.updateClosed(id,correction,admin);
   const row=(await c.query('select id_caja from temo.arqueos where id_turno=$1 and tipo=$2 limit 1',[id,type])).rows[0];
   assert.equal(row.id_caja,shifts[1].id_caja);
  });
  for(const kind of ['cash','close'])await scenario(kind+' rejects a completed closure after its initial read',async()=>{
   const before=await snapshot();beforeWrite=()=>c.query("update temo.turnos set estado='CERRADO' where id_turno=$1",[id]);
   const operation=kind==='cash'?service.saveCashCount(id,{counts:counts(8),changeNio:0},owner):service.close(id,closeInput,admin);
   await assert.rejects(operation,conflict);assert.deepEqual(await snapshot(),before);
  });
  await scenario('audit failure rolls back all historical correction effects',async()=>{
   await service.close(id,closeInput,admin);const before=await snapshot();failAudit=true;
   await assert.rejects(service.updateClosed(id,correction,admin),/QA audit unavailable/);failAudit=false;
   assert.deepEqual(await snapshot(),before);
  });
  for(const state of ['ABIERTO','PENDIENTE_APERTURA','PENDIENTE_APROBACION'])await scenario('authorized opening correction remains available in '+state,async()=>{
   await c.query('update temo.turnos set estado=$2 where id_turno=$1',[id,state]);
   const result=await service.update(id,{...inputs[0],counts:counts(3)},admin);assert.equal(Number(result.efectivo_inicial_nio),300);
  });
  await scenario('ordinary close and historical correction remain available',async()=>{
   await service.close(id,closeInput,admin);const result=await service.updateClosed(id,correction,admin);
   assert.equal(result.estado,'CERRADO');assert.equal(Number(result.efectivo_inicial_nio),300);assert.equal(Number(result.efectivo_final_nio),200);
  });
 }finally{await c.query('rollback');await c.end();}
});

test('opening correction waits for concurrent closure and rejects it after commit', {skip:!process.env.TEMO_TEST_PREVIEW}, async()=>{
 const {ConfigService}=require('@nestjs/config');
 const {DatabaseService}=require('../dist/modules/database/database.service');
 const db=new DatabaseService(new ConfigService({DATABASE_URL:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',DATABASE_SSL:'false',APP_ENV:'development',DATABASE_POOL_MAX:4}));
 const prefix='MUTATION_RACE_'+randomUUID().replaceAll('-','').slice(0,12),users=[];
 let branch,releaseClosing,closing,editing;
 try{
  branch=(await db.query(`insert into temo.sucursales(codigo,nombre,estado) values($1,$1,'ACTIVO') returning id_sucursal`,[prefix])).rows[0].id_sucursal;
  for(const [index,role] of ['JEFA','CAJERO'].entries())users.push((await db.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
   select id_rol,'Mutation Race','QA',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo=$2
   returning id_usuario as id,usuario as username,version_sesion as "sessionVersion",$2::text as "roleCode"`,[prefix+index,role])).rows[0]);
  const [admin,owner]=users;
  await db.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[owner.id,branch]);
  const service=new ShiftsService(db),input={branchId:branch,branch:prefix,register:prefix,cashier:owner.username,counts:counts(1),balances:[],notes:'race fixture',prepared:false};
  const shift=await service.create(input,admin),id=shift.database_id;
  const before=(await service.detail(id,admin)).cashCounts;
  let locked;const ready=new Promise(resolve=>{locked=resolve;}),release=new Promise(resolve=>{releaseClosing=resolve;});
  closing=db.transaction(async c=>{await c.query("update temo.turnos set estado='CERRADO' where id_turno=$1",[id]);locked();await release;});
  await Promise.race([ready,closing.then(()=>{throw new Error('closure ended early');})]);
  let writerPid;
  const observed={query:(sql,args)=>db.query(sql,args),transaction:work=>db.transaction(async c=>{
   writerPid=(await c.query('select pg_backend_pid() as pid')).rows[0].pid;return work(c);
  })};
  editing=new ShiftsService(observed).update(id,{...input,counts:counts(9)},admin).then(value=>({value}),error=>({error}));
  let blocked=false;const deadline=Date.now()+5000;
  while(Date.now()<deadline){
   if(writerPid)blocked=(await db.query('select cardinality(pg_blocking_pids($1))>0 as blocked',[writerPid])).rows[0].blocked;
   if(blocked)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.ok(blocked,'Independent connection actually waits for the shift lock');
  releaseClosing();await closing;
  const result=await editing;assert.ok(conflict(result.error),'Concurrent closing must win over stale opening edit');
  const after=await service.detail(id,admin);assert.equal(after.estado,'CERRADO');assert.equal(Number(after.efectivo_inicial_nio),100);assert.deepEqual(after.cashCounts,before);
 }finally{
  releaseClosing?.();await Promise.allSettled([closing,editing].filter(Boolean));
  if(branch)await db.transaction(async c=>{
   const ids=(await c.query('select id_turno from temo.turnos where id_sucursal=$1',[branch])).rows.map(row=>row.id_turno);
   await c.query("delete from temo.bitacora where tabla='turnos' and id_registro=any($1::uuid[])",[ids]);
   await c.query('delete from temo.notificaciones_usuarios where id_turno=any($1::uuid[])',[ids]);
   await c.query('delete from temo.solicitudes_cierre_turno where id_turno=any($1::uuid[])',[ids]);
   await c.query('delete from temo.turnos where id_sucursal=$1',[branch]);
   await c.query('delete from temo.jornadas where id_sucursal=$1',[branch]);
   await c.query('delete from temo.cajas where id_sucursal=$1',[branch]);
   await c.query('delete from temo.usuarios_sucursales where id_sucursal=$1',[branch]);
   await c.query('delete from temo.sucursales where id_sucursal=$1',[branch]);
   if(users.length)await c.query('delete from temo.usuarios where id_usuario=any($1::uuid[])',[users.map(row=>row.id)]);
  });
  await db.onModuleDestroy();
 }
});
