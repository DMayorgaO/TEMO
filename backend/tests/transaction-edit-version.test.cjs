const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {TransactionsService}=require('../dist/modules/transactions/transactions.service');
const {createTransactionBatchSchema,updateTransactionSchema,updateTransactionGroupSchema,voidTransactionSchema}=require('../dist/modules/transactions/transaction-batch.schema');
const rates={buy:36.4,sell:37},counts=amount=>({NIO:amount?[{denomination:10,piles25:0,loose:amount/10}]:[],USD:[]});
const settlement=amount=>({primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:counts(amount),changeCounts:counts(0)});
const change=(amount=20)=>updateTransactionSchema.parse({entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount,rates,settlement:settlement(amount)});
const connectionString='postgresql://temo_preview@127.0.0.1:55433/temo_preview';
const stale=e=>e.getStatus()===409&&e.getResponse().code==='TRA-VER-409';

test('edit version contracts preserve big integer text and reject coercion, malformed or injected versions',()=>{
  for(const expectedVersion of ['1','9007199254740993','9223372036854775807'])assert.ok(updateTransactionSchema.safeParse({...change(),expectedVersion}).success);
  for(const expectedVersion of [1,null,{},'','01','-1','1.0','1;select 1','9'.repeat(20)]){
    assert.equal(updateTransactionSchema.safeParse({...change(),expectedVersion}).success,false);
    assert.equal(voidTransactionSchema.safeParse({expectedVersion}).success,false);
    assert.equal(updateTransactionGroupSchema.safeParse({expectedVersion,updates:[],voidIds:[randomUUID()],preferential:false}).success,false);
  }
});

test('version migration is repeatable without resetting existing counters',{skip:!process.env.TEMO_TEST_PREVIEW},async()=>{
  const c=new Client({connectionString});await c.connect();await c.query('begin');
  try{
    const sql=require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../../database/init/053_transaction_edit_versions.sql'),'utf8');
    const before=(await c.query('select id_grupo_transacciones,version_edicion::text from temo.grupos_transacciones order by id_grupo_transacciones')).rows;
    await c.query(sql);await c.query(sql);
    assert.deepEqual((await c.query('select id_grupo_transacciones,version_edicion::text from temo.grupos_transacciones order by id_grupo_transacciones')).rows,before);
  }finally{await c.query('rollback');await c.end();}
});

test('stale edit protection, linked financial state and receipt priority: preview rollback',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
  const c=new Client({connectionString,options:'-c search_path=temo,extensions,public',statement_timeout:15000});await c.connect();await c.query('begin');
  let sequence=0,failure='',interleave=null;
  const query=async(sql,args)=>{
    if(failure==='audit'&&sql.includes('insert into temo.bitacora'))throw new Error('audit unavailable');
    if(failure==='receipt'&&sql.includes('insert into temo.solicitudes_financieras'))throw new Error('receipt unavailable');
    const result=await c.query(sql,args);
    if(interleave&&sql.includes(interleave.marker)){
      const id=interleave.id;interleave=null;
      await c.query("update temo.transacciones set descripcion='Concurrent fixture change' where id_transaccion=$1",[id]);
    }
    return result;
  };
  const db={query,transaction:async work=>{
    const save='version_test_'+(++sequence);await c.query('savepoint '+save);
    try{const result=await work({query});await c.query('release savepoint '+save);return result;}
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
      const username='version_qa_'+randomUUID().replaceAll('-','');
      const actor=(await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
        select id_rol,'Version','QA',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo='CAJERO'
        returning id_usuario as id,version_sesion as "sessionVersion",'CAJERO' as "roleCode"`,[username])).rows[0];
      await c.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[actor.id,branch.id]);
      const shift=await shifts.create({branchId:branch.id,branch:branch.nombre,register:username,cashier:username,counts:counts(1000),balances:[],notes:'isolated edit version fixture',prepared:false},admin);
      return {actor,shift};
    }
    const a=await owner(),b=await owner();
    const create=(amounts=[10],pending=false)=>transactions.createBatch(createTransactionBatchSchema.parse({shiftId:a.shift.database_id,userId:a.actor.id,rates,
      transactions:amounts.map(amount=>({entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount,...(pending?{pendingName:'Version QA'}:{})})),settlement:settlement(pending?0:amounts.reduce((x,y)=>x+y,0))}),{actor:a.actor});
    const version=async id=>(await transactions.detail(id,a.actor)).editVersion;
    const state=async()=>{
      const row=await shifts.detail(a.shift.database_id,a.actor);return {cash:row.cashCounts,expected:row.expectedCash,balances:row.balances.map(r=>[r.account_id,r.calculated,r.system])};
    };
    await t.test('ordinary reads, unrelated groups and shift cash polling do not invalidate an editor',async()=>{
      const id=(await create()).transactions[0].id,v=await version(id);
      assert.equal(typeof v,'string');assert.match(v,/^[1-9][0-9]*$/);
      await transactions.groupDetail(id,a.actor);assert.equal(await version(id),v);
      await shifts.saveCashCount(a.shift.database_id,{counts:counts(1010),changeNio:0},a.actor);
      const other=(await create()).transactions[0].id;await transactions.update(other,change(20),a.actor);
      assert.equal(await version(id),v);
    });
    await t.test('same version in two editors: one edit succeeds, stale edit cannot overwrite or create receipt',async()=>{
      const id=(await create()).transactions[0].id,old=await version(id),input={...change(),requestId:randomUUID(),expectedVersion:old};
      const result=await transactions.update(id,input,a.actor),after=await state();
      assert.notEqual(await version(id),old);
      const staleInput={...change(30),requestId:randomUUID(),expectedVersion:old};
      await assert.rejects(transactions.update(id,staleInput,a.actor),stale);assert.deepEqual(await state(),after);
      assert.equal((await c.query('select count(*)::int as n from temo.solicitudes_financieras where id_solicitud=$1',[staleInput.requestId])).rows[0].n,0);
      assert.deepEqual(await transactions.update(id,input,a.actor),result,'Confirmed request beats old version check');
      assert.deepEqual(await state(),after);
      await transactions.update(id,{...change(10),expectedVersion:await version(id)},a.actor);
      await assert.rejects(transactions.update(id,staleInput,a.actor),stale,'Returning to the original amount cannot revive an old version');
    });
    await t.test('one changed group member invalidates whole-group update and cancellation atomically',async()=>{
      const created=await create([10,20]),ids=created.transactions.map(r=>r.id),before=await transactions.groupDetail(ids[0],a.actor);
      assert.ok(before.details.every(row=>row.editVersion===before.editVersion));
      await transactions.update(ids[1],{...change(30),expectedVersion:before.editVersion},a.actor);const after=await state();
      const input={requestId:randomUUID(),expectedVersion:before.editVersion,updates:ids.map(id=>({id,data:change(40)})),voidIds:[],preferential:false};
      await assert.rejects(transactions.updateGroup(ids[0],input,a.actor),stale);
      await assert.rejects(transactions.updateGroup(ids[0],{...input,updates:[],voidIds:ids},a.actor),stale);
      assert.deepEqual(await state(),after);
      const current=await transactions.groupDetail(ids[0],a.actor);
      await transactions.updateGroup(ids[0],{...input,expectedVersion:current.editVersion},a.actor);
    });
    await t.test('stale void cannot remove a newer amount; a confirmed void retries with its original version',async()=>{
      const id=(await create()).transactions[0].id,old=await version(id);
      await transactions.update(id,{...change(30),expectedVersion:old},a.actor);const after=await state();
      await assert.rejects(transactions.void(id,a.actor,undefined,randomUUID(),old),stale);assert.deepEqual(await state(),after);
      const v=await version(id),key=randomUUID(),result=await transactions.void(id,a.actor,undefined,key,v),voided=await state();
      assert.deepEqual(await transactions.void(id,a.actor,undefined,key,v),result);assert.deepEqual(await state(),voided);
    });
    await t.test('payment by another cashier invalidates pending source group without changing its cash',async()=>{
      const id=(await create([10],true)).transactions[0].id,old=await version(id),before=await state();
      const pending=(await c.query('select id_pendiente from temo.pagos_pendientes where id_transaccion=$1',[id])).rows[0].id_pendiente;
      await transactions.payPending(pending,{rates,settlement:settlement(10)},b.actor);
      assert.notEqual(await version(id),old);assert.deepEqual(await state(),before);
      await assert.rejects(transactions.update(id,{...change(20),expectedVersion:old},a.actor),stale);
      await assert.rejects(transactions.update(id,{...change(20),expectedVersion:await version(id)},b.actor),e=>e.getStatus()===403);
    });
    await t.test('cash denominations and account amount edits also invalidate; failed transaction rolls its version back',async()=>{
      const id=(await create()).transactions[0].id,v=await version(id);
      await c.query('savepoint direct_cash_change');
      const cash=(await c.query(`select ad.id_arqueo,ad.id_denominacion from temo.arqueos_denominaciones ad join temo.arqueos a using(id_arqueo)
        where a.id_transaccion=$1 or a.id_grupo_transacciones=(select id_grupo_transacciones from temo.transacciones where id_transaccion=$1) limit 1`,[id])).rows[0];assert.ok(cash,'Cash fixture must exist');
      await c.query('update temo.arqueos_denominaciones set sueltos=sueltos+1 where id_arqueo=$1 and id_denominacion=$2',[cash.id_arqueo,cash.id_denominacion]);
      await assert.rejects(transactions.update(id,{...change(),expectedVersion:v},a.actor),stale);
      await c.query('rollback to savepoint direct_cash_change');assert.equal(await version(id),v);
      await c.query('savepoint direct_account_change');
      await c.query('update temo.transacciones_montos set monto=monto+1 where id_transaccion=$1',[id]);
      await assert.rejects(transactions.update(id,{...change(),expectedVersion:v},a.actor),stale);
      await c.query('rollback to savepoint direct_account_change');assert.equal(await version(id),v);
      for(const fail of ['audit','receipt']){
        const input={...change(),requestId:randomUUID(),expectedVersion:await version(id)},before=await state();failure=fail;
        await assert.rejects(transactions.update(id,input,a.actor),new RegExp(fail+' unavailable'));failure='';
        assert.equal(await version(id),input.expectedVersion);assert.deepEqual(await state(),before);
        await transactions.update(id,input,a.actor);
      }
    });
    await t.test('mixed read snapshots are rejected rather than returning a fresh token for old fields',async()=>{
      const id=(await create()).transactions[0].id;
      interleave={id,marker:'select datos,proyeccion,anulada'};
      await assert.rejects(transactions.detail(id,a.actor),stale);
      interleave={id,marker:'select pp.codigo_pendiente, ap.monto'};
      await assert.rejects(transactions.groupDetail(id,a.actor),stale);
      assert.ok((await transactions.groupDetail(id,a.actor)).editVersion);
    });
    await t.test('shift state and historical corrections invalidate old forms, while preserving closed funds',async()=>{
      const id=(await create()).transactions[0].id,openVersion=await version(id);
      await c.query('savepoint historical_versions');
      await c.query("update temo.turnos set estado='CERRADO' where id_turno=$1",[a.shift.database_id]);
      const closed=await transactions.detail(id,admin),before=await state();assert.notEqual(closed.editVersion,openVersion);
      await assert.rejects(transactions.update(id,{...change(),expectedVersion:openVersion},admin),stale);
      await transactions.update(id,{...change(),expectedVersion:closed.editVersion},admin);
      await assert.rejects(transactions.void(id,admin,undefined,randomUUID(),closed.editVersion),stale);assert.deepEqual(await state(),before);
      await c.query('rollback to savepoint historical_versions');
    });
  }finally{await c.query('rollback');await c.end();}
});
