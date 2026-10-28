const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {TransactionsService}=require('../dist/modules/transactions/transactions.service');
const {TransactionsController}=require('../dist/modules/transactions/transactions.controller');
const {createTransactionBatchSchema,updateTransactionSchema,updateTransactionGroupSchema,voidTransactionSchema}=require('../dist/modules/transactions/transaction-batch.schema');
const {auditChanges}=require('../dist/modules/catalogs/audit-changes');
const rates={buy:36.4,sell:37},counts=amount=>({NIO:amount?[{denomination:10,piles25:0,loose:amount/10}]:[],USD:[]});
const settlement=amount=>({primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:counts(amount),changeCounts:counts(0)});
const change=(amount=20,requestId=randomUUID())=>updateTransactionSchema.parse({requestId,entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount,rates,settlement:settlement(amount)});

test('transaction change contracts reject invalid references and forged fields, including void bodies',()=>{
  const input=change();
  assert.ok(updateTransactionSchema.safeParse(input).success);
  assert.ok(voidTransactionSchema.safeParse({}).success);
  for(const value of [null,[],{requestId:'invalid'},{userId:randomUUID()},{shiftId:randomUUID()},{requestId:1}])assert.equal(voidTransactionSchema.safeParse(value).success,false);
  assert.equal(updateTransactionSchema.safeParse({...input,shiftId:randomUUID()}).success,false);
  assert.equal(updateTransactionGroupSchema.safeParse({requestId:'invalid',updates:[],voidIds:[randomUUID()],preferential:false}).success,false);
  const controller=new TransactionsController({}, {void(){throw new Error('service must not run');}});
  assert.throws(()=>controller.voidTransaction(randomUUID(),{user:{}},{userId:randomUUID()}),e=>e.getStatus()===400);
});

test('transaction edit, void and group receipts with permissions and audit: local preview rollback',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
  const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,extensions,public',statement_timeout:15000});
  await c.connect();await c.query('begin');let sequence=0,failure='';
  const db={query:(sql,args)=>c.query(sql,args),transaction:async work=>{
    const save='change_security_'+(++sequence);await c.query('savepoint '+save);
    const proxy={query:(sql,args)=>{
      if(failure==='audit'&&sql.includes('insert into temo.bitacora'))throw new Error('audit unavailable');
      if(failure==='receipt'&&sql.includes('insert into temo.solicitudes_financieras'))throw new Error('receipt unavailable');
      return c.query(sql,args);
    }};
    try{const result=await work(proxy);await c.query('release savepoint '+save);return result;}
    catch(e){await c.query('rollback to savepoint '+save);await c.query('release savepoint '+save);throw e;}
  }};
  try{
    if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
    const admin=(await c.query(`select u.id_usuario as id,u.version_sesion as "sessionVersion",'JEFA' as "roleCode" from temo.usuarios u join temo.roles r using(id_rol)
      where r.codigo='JEFA' and u.estado='ACTIVO' and not u.debe_cambiar_contrasena limit 1`)).rows[0];
    const branch=(await c.query(`select s.id_sucursal as id,s.nombre from temo.sucursales s join temo.cuentas_sucursales cs using(id_sucursal)
      join temo.cuentas_bancarias cb using(id_cuenta) join temo.entidades_bancarias e using(id_entidad) join temo.monedas m using(id_moneda)
      where s.estado='ACTIVO' and cb.estado='ACTIVO' and e.codigo='BAC' and m.codigo='NIO' limit 1`)).rows[0];
    const shifts=new ShiftsService(db),transactions=new TransactionsService(db);
    async function owner(){
      const username='change_qa_'+randomUUID().replaceAll('-','');
      const actor=(await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
        select id_rol,'Change','QA',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo='CAJERO'
        returning id_usuario as id,version_sesion as "sessionVersion",'CAJERO' as "roleCode"`,[username])).rows[0];
      await c.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[actor.id,branch.id]);
      const shift=await shifts.create({branchId:branch.id,branch:branch.nombre,register:username,cashier:username,counts:counts(1000),balances:[],notes:'isolated correction fixture',prepared:false},admin);
      return {actor,shift};
    }
    const a=await owner(),b=await owner();
    async function create(amounts=[10]){
      return transactions.createBatch(createTransactionBatchSchema.parse({shiftId:a.shift.database_id,userId:a.actor.id,rates,
        transactions:amounts.map(amount=>({entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount})),settlement:settlement(amounts.reduce((x,y)=>x+y,0))}),{actor:a.actor});
    }
    const state=async()=>{
      const shift=await shifts.detail(a.shift.database_id,a.actor);
      return {cash:shift.cashCounts,expected:shift.expectedCash,balances:shift.balances.map(r=>[r.account_id,r.calculated,r.system])};
    };
    const receiptCount=async key=>(await c.query('select count(*)::int as n from temo.solicitudes_financieras where id_usuario=$1 and id_solicitud=$2',[a.actor.id,key])).rows[0].n;
    let editId,editInput,voidId,voidKey;
    await t.test('edit repeats once; changed content or target conflicts; old replay cannot overwrite a later correction',async()=>{
      editId=(await create()).transactions[0].id;editInput=change();
      const first=await transactions.update(editId,editInput,a.actor),after=await state();
      assert.deepEqual(await transactions.update(editId,{...editInput,requestId:editInput.requestId.toUpperCase()},a.actor),first);
      assert.deepEqual(await state(),after);assert.equal(await receiptCount(editInput.requestId),1);
      const audits=await c.query("select count(*)::int as n from temo.bitacora where tabla='transacciones' and accion='ACTUALIZAR' and id_registro=$1",[editId]);assert.equal(audits.rows[0].n,1);
      await assert.rejects(transactions.update(editId,change(30,editInput.requestId),a.actor),e=>e.getStatus()===409);
      await assert.rejects(transactions.update((await create()).transactions[0].id,editInput,a.actor),e=>e.getStatus()===409);
      await transactions.update(editId,change(30),a.actor);const later=await state();
      assert.deepEqual(await transactions.update(editId,editInput,a.actor),first);assert.deepEqual(await state(),later);
      assert.equal((await c.query('select monto_original from temo.transacciones where id_transaccion=$1',[editId])).rows[0].monto_original,'30.0000');
    });
    await t.test('void replay confirms result without double restitution or audit; before/after is readable',async()=>{
      voidId=(await create()).transactions[0].id;voidKey=randomUUID();const before=await state();
      const first=await transactions.void(voidId,a.actor,undefined,voidKey),after=await state();
      assert.equal(after.expected.NIO,before.expected.NIO-10);
      assert.deepEqual(await transactions.void(voidId,a.actor,undefined,voidKey),first);assert.deepEqual(await state(),after);
      const audits=(await c.query("select datos_anteriores,datos_nuevos from temo.bitacora where tabla='transacciones' and accion='ANULAR' and id_registro=$1",[voidId])).rows;
      assert.equal(audits.length,1);assert.equal(audits[0].datos_anteriores.estado,'REGISTRADA');assert.equal(audits[0].datos_nuevos.estado,'ANULADA');
      assert.ok(auditChanges('transacciones',audits[0].datos_anteriores,audits[0].datos_nuevos).changes.some(r=>r.field==='Estado'&&r.after==='ANULADA'));
      await assert.rejects(transactions.void(editId,a.actor,undefined,voidKey),e=>e.getStatus()===409);
    });
    await t.test('group update and complete cancellation are atomic and replayable even after anchor is annulled',async()=>{
      const created=await create([10,20]),ids=created.transactions.map(r=>r.id);
      const input=updateTransactionGroupSchema.parse({requestId:randomUUID(),updates:[{id:ids[0],data:change(30)},{id:ids[1],data:change(40)}],voidIds:[],preferential:false});
      const result=await transactions.updateGroup(ids[0],input,a.actor),after=await state();
      assert.deepEqual(await transactions.updateGroup(ids[0],input,a.actor),result);assert.deepEqual(await state(),after);
      const bad={...input,requestId:randomUUID(),updates:[{id:editId,data:change(20)}],voidIds:[ids[1]]};
      await assert.rejects(transactions.updateGroup(ids[0],bad,a.actor),e=>e.getStatus()===409);assert.deepEqual(await state(),after);
      const cancellation={requestId:randomUUID(),updates:[],voidIds:ids,preferential:false};
      const done=await transactions.updateGroup(ids[0],cancellation,a.actor),cancelled=await state();
      assert.equal(cancelled.expected.NIO,after.expected.NIO-70);
      assert.deepEqual(await transactions.updateGroup(ids[0],cancellation,a.actor),done);assert.deepEqual(await state(),cancelled);
      assert.equal(await receiptCount(cancellation.requestId),1);
      const childReceipts=(await c.query("select count(*)::int as n from temo.solicitudes_financieras where operacion in ('EDITAR_TRANSACCION','ANULAR_TRANSACCION') and resultado->>'id'=any($1::text[])",[ids])).rows[0].n;
      assert.equal(childReceipts,0,'Group children must not create independent receipts');
    });
    await t.test('audit or receipt failure rolls back single edit, void and whole group; original reference can retry',async()=>{
      for(const fail of ['audit','receipt'])for(const mode of ['edit','void','group']){
        const created=await create(mode==='group'?[10,20]:[10]),ids=created.transactions.map(r=>r.id),key=randomUUID(),input=change(20,key);
        const run=()=>mode==='edit'?transactions.update(ids[0],input,a.actor):mode==='void'?transactions.void(ids[0],a.actor,undefined,key):transactions.updateGroup(ids[0],{requestId:key,updates:[],voidIds:ids,preferential:false},a.actor);
        const before=await state();failure=fail;await assert.rejects(run(),new RegExp(fail+' unavailable'));failure='';
        assert.deepEqual(await state(),before);assert.equal(await receiptCount(key),0);
        const result=await run(),after=await state();assert.deepEqual(await run(),result);assert.deepEqual(await state(),after);
      }
    });
    await t.test('foreign cashier, revoked session, changed role and mandatory password cannot mutate or replay',async()=>{
      const id=(await create()).transactions[0].id,key=randomUUID(),before=await state();
      for(const actor of [b.actor,{...a.actor,sessionVersion:-1},{...a.actor,roleCode:'TRANSFERISTA'},{...a.actor,mustChangePassword:true}]){
        await assert.rejects(transactions.update(id,change(20,key),actor),e=>e.getStatus()===403);
        await assert.rejects(transactions.void(id,actor,undefined,key),e=>e.getStatus()===403);
        await assert.rejects(transactions.updateGroup(id,{requestId:key,updates:[],voidIds:[id],preferential:false},actor),e=>e.getStatus()===403);
      }
      await c.query('savepoint revoked_actor');await c.query('update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1',[a.actor.id]);
      await assert.rejects(transactions.update(editId,editInput,a.actor),e=>e.getStatus()===403);
      await assert.rejects(transactions.void(voidId,a.actor,undefined,voidKey),e=>e.getStatus()===403);
      await c.query('rollback to savepoint revoked_actor');assert.deepEqual(await state(),before);
    });
    await t.test('cancelled and unopened shifts deny administrator writes; historical receipts preserve closed money',async()=>{
      const id=(await create()).transactions[0].id;
      for(const status of ['ANULADO','PENDIENTE_APERTURA']){
        await c.query('savepoint unavailable_shift');await c.query('update temo.turnos set estado=$2::temo.estado_turno where id_turno=$1',[a.shift.database_id,status]);
        await assert.rejects(transactions.update(id,change(20),admin),e=>e.getStatus()===409);
        await assert.rejects(transactions.void(id,admin,undefined,randomUUID()),e=>e.getStatus()===409);
        await assert.rejects(transactions.updateGroup(id,{requestId:randomUUID(),updates:[],voidIds:[id],preferential:false},admin),e=>e.getStatus()===409);
        await c.query('rollback to savepoint unavailable_shift');
      }
      await c.query("update temo.turnos set estado='CERRADO' where id_turno=$1",[a.shift.database_id]);const before=await state();
      await assert.rejects(transactions.update(editId,editInput,a.actor),e=>e.getStatus()===409);
      await assert.rejects(transactions.void(voidId,a.actor,undefined,voidKey),e=>e.getStatus()===409);
      const input=change(20),result=await transactions.update(id,input,admin);
      assert.equal(result.historical,true);assert.deepEqual(await transactions.update(id,input,admin),result);assert.deepEqual(await state(),before);
      const key=randomUUID(),annulled=await transactions.void(id,admin,undefined,key);
      assert.deepEqual(await transactions.void(id,admin,undefined,key),annulled);assert.deepEqual(await state(),before);
      await assert.rejects(transactions.update(id,change(30),admin),e=>e.getStatus()===409,'Historical annulment cannot be reopened through another edit');
      assert.deepEqual(await state(),before);
    });
  }finally{await c.query('rollback');await c.end();}
});
