const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {TransactionsService}=require('../dist/modules/transactions/transactions.service');
const {payPendingSchema,payPendingBatchSchema,createTransactionBatchSchema}=require('../dist/modules/transactions/transaction-batch.schema');
const rates={buy:36.4,sell:37};
const counts=amount=>({NIO:amount?[{denomination:10,piles25:0,loose:amount/10}]:[],USD:[]});
const settlement=(amount=0)=>({primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:counts(amount),changeCounts:counts(0)});

test('payment schemas reject forged identities, invalid references and duplicate pending IDs',()=>{
  const valid={requestId:randomUUID(),rates,settlement:settlement(10)};
  assert.ok(payPendingSchema.safeParse(valid).success);
  for(const extra of [{requestId:'bad'},{userId:randomUUID()},{shiftId:randomUUID()}])assert.equal(payPendingSchema.safeParse({...valid,...extra}).success,false);
  const id=randomUUID();
  assert.equal(payPendingBatchSchema.safeParse({pendingIds:[id,id.toUpperCase()],method:'EFECTIVO',rates,settlement:settlement(20)}).success,false);
});

test('pending payment receipts and permissions: isolated preview, all changes rolled back',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
  const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,extensions,public',statement_timeout:15000});
  await c.connect();await c.query('begin');let sequence=0,failure='';
  const db={query:(sql,args)=>c.query(sql,args),transaction:async work=>{
    const save='payment_security_'+(++sequence);await c.query('savepoint '+save);
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
    const shifts=new ShiftsService(db),payments=new TransactionsService(db);
    async function owner(scope=branch){
      const username='qa_payment_'+randomUUID().replaceAll('-','');
      const actor=(await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
        select id_rol,'Payment','QA',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo='CAJERO'
        returning id_usuario as id,version_sesion as "sessionVersion",'CAJERO' as "roleCode"`,[username])).rows[0];
      await c.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[actor.id,scope.id]);
      const shift=await shifts.create({branchId:scope.id,branch:scope.nombre,register:username,cashier:username,counts:counts(1000),balances:[],notes:'isolated payment fixture',prepared:false},admin);
      return {actor,shift};
    }
    const a=await owner(),b=await owner();
    const foreignName='QA_PAY_'+randomUUID().replaceAll('-','').slice(0,16);
    const foreignBranch=(await c.query(`insert into temo.sucursales(codigo,nombre,estado) values($1,$1,'ACTIVO') returning id_sucursal as id,nombre`,[foreignName])).rows[0];
    const foreign=await owner(foreignBranch);
    async function pending(owner=a,amount=10,extra={}){
      const batch=createTransactionBatchSchema.parse({shiftId:owner.shift.database_id,userId:owner.actor.id,rates,
        transactions:[{entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount,pendingName:'Payment security QA',...extra}],settlement:settlement()});
      const created=await payments.createBatch(batch,{actor:owner.actor});
      return (await c.query('select id_pendiente from temo.pagos_pendientes where id_transaccion=$1',[created.transactions[0].id])).rows[0].id_pendiente;
    }
    const state=async(owner=a)=>{
      const shift=await shifts.detail(owner.shift.database_id,owner.actor);
      return {cash:shift.cashCounts,expected:shift.expectedCash,balances:shift.balances.map(r=>[r.account_id,r.calculated,r.system]),
        count:(await c.query('select count(*)::int as n from temo.abonos_pendientes where id_usuario_creacion=$1',[owner.actor.id])).rows[0].n};
    };
    const singleInput=(amount=10)=>payPendingSchema.parse({requestId:randomUUID(),rates,settlement:settlement(amount)});
    let firstId,firstInput,firstResult;
    for(const currency of ['NIO','USD'])await t.test(`outgoing ${currency} payment: replay and reversal preserve funds exactly once`,async()=>{
      const id=await pending(a,10,{movementCode:'RE',currencyCode:currency});
      const cash={NIO:[],USD:[]};cash[currency]=[{denomination:10,piles25:0,loose:1}];
      const input=payPendingSchema.parse({requestId:randomUUID(),rates,
        settlement:{...settlement(),primaryCounts:cash}});
      const before=await state(),result=await payments.payPending(id,input,a.actor),after=await state();
      // Shift detail exposes expected cash consolidated in NIO, including USD.
      const delta=currency==='USD'?10*rates.buy:10;
      assert.ok(Math.abs(after.expected.NIO-(before.expected.NIO-delta))<0.000001);
      assert.equal(after.count,before.count+1);
      assert.deepEqual(await payments.payPending(id,input,a.actor),result);
      assert.deepEqual(await state(),after);
      await payments.reopenPendingPayment(id,a.actor);
      const reverted=await state();
      assert.ok(Math.abs(reverted.expected.NIO-before.expected.NIO)<0.000001);
      await assert.rejects(payments.payPending(id,input,a.actor),e=>e.getStatus()===409);
      assert.deepEqual(await state(),reverted);
    });
    await t.test('single replay returns same payment once; changed payload or another pending conflicts',async()=>{
      firstId=await pending();firstInput=singleInput();const before=await state();
      firstResult=await payments.payPending(firstId,firstInput,a.actor);
      const after=await state();assert.equal(after.count,before.count+1);assert.equal(after.expected.NIO,before.expected.NIO+10);
      assert.deepEqual(await payments.payPending(firstId,{...firstInput,requestId:firstInput.requestId.toUpperCase()},a.actor),firstResult);
      assert.deepEqual(await state(),after);
      await assert.rejects(payments.payPending(firstId,{...firstInput,settlement:settlement(20)},a.actor),e=>e.getStatus()===409);
      await assert.rejects(payments.payPending(await pending(),firstInput,a.actor),e=>e.getStatus()===409);
      await assert.rejects(payments.payPending(firstId,singleInput(),a.actor),e=>e.getStatus()===409);
    });
    await t.test('batch cash, digital and mixed retain one effect and complete receipt of all portions',async()=>{
      for(const method of ['EFECTIVO','DIGITAL','MIXTO']){
        const ids=[await pending(),await pending()];
        const input=payPendingBatchSchema.parse({requestId:randomUUID(),pendingIds:ids,method,rates,
          ...(method!=='DIGITAL'?{settlement:settlement(method==='MIXTO'?10:20)}:{}),
          ...(method!=='EFECTIVO'?{digital:{entityCode:'BAC',movementCode:'RE',...(method==='MIXTO'?{amount:10}:{})}}:{})});
        const before=await state(),result=await payments.payPendingBatch(input,a.actor),after=await state();
        assert.equal(after.count-before.count,result.paymentIds.length);
        assert.equal(after.expected.NIO-before.expected.NIO,method==='DIGITAL'?0:method==='MIXTO'?10:20);
        assert.deepEqual(await payments.payPendingBatch(input,a.actor),result);
        assert.deepEqual(await state(),after);
        const detail=await payments.pendingPaymentDetail(ids[0],a.actor);
        failure='audit';await assert.rejects(payments.reopenPaymentBatch(ids[0],detail.compensations.map(r=>r.id_abono),a.actor),/audit unavailable/);failure='';
        assert.deepEqual(await state(),after);
        await payments.reopenPaymentBatch(ids[0],detail.compensations.map(r=>r.id_abono),a.actor);
        const reverted=await state();
        await assert.rejects(payments.payPendingBatch(input,a.actor),e=>e.getStatus()===409);
        assert.deepEqual(await state(),reverted);
        const corrected=await payments.payPendingBatch({...input,requestId:randomUUID()},a.actor);
        assert.notDeepEqual(corrected.paymentIds,result.paymentIds);
        await assert.rejects(payments.payPendingBatch(input,a.actor),e=>e.getStatus()===409);
      }
    });
    await t.test('audit or receipt failure rolls back pending status, cash and payment; same reference retries safely',async()=>{
      for(const fail of ['audit','receipt']){
        const id=await pending(),input=singleInput(),before=await state();failure=fail;
        await assert.rejects(payments.payPending(id,input,a.actor),new RegExp(fail+' unavailable'));failure='';
        assert.deepEqual(await state(),before);
        assert.equal((await c.query('select estado from temo.pagos_pendientes where id_pendiente=$1',[id])).rows[0].estado,'PENDIENTE');
        const result=await payments.payPending(id,input,a.actor);
        assert.equal((await payments.payPending(id,input,a.actor)).paymentId,result.paymentId);
      }
    });
    await t.test('revoked, disabled, changed-role and password-change sessions cannot pay, replay or reverse',async()=>{
      const id=await pending(),input=singleInput(),before=await state();
      async function deny(actor){
        await assert.rejects(payments.payPending(id,input,actor),e=>e.getStatus()===403);
        await assert.rejects(payments.payPending(firstId,firstInput,actor),e=>e.getStatus()===403);
        await assert.rejects(payments.reopenPendingPayment(firstId,actor),e=>e.getStatus()===403);
        await assert.rejects(payments.reopenPaymentBatch(firstId,[firstResult.paymentId],actor),e=>e.getStatus()===403);
      }
      await deny({...a.actor,sessionVersion:-1});
      await deny({...a.actor,roleCode:'TRANSFERISTA'});
      for(const assignment of ["estado='INACTIVO'",'debe_cambiar_contrasena=true',"id_rol=(select id_rol from temo.roles where codigo='TRANSFERISTA')"]){
        await c.query('savepoint identity_change');await c.query(`update temo.usuarios set ${assignment} where id_usuario=$1`,[a.actor.id]);
        await deny(a.actor);await c.query('rollback to savepoint identity_change');
      }
      assert.deepEqual(await state(),before);
    });
    await t.test('same-branch cashier may pay shared pending but application shift isolates funds and replay scope',async()=>{
      const id=await pending(),input=singleInput(),aBefore=await state(a),bBefore=await state(b);
      await assert.rejects(payments.payPending(id,input,foreign.actor),e=>e.getStatus()===409);
      const result=await payments.payPending(id,input,b.actor);
      assert.equal(result.appliedShiftId,b.shift.database_id);
      assert.deepEqual(await state(a),aBefore);assert.equal((await state(b)).expected.NIO,bBefore.expected.NIO+10);
      await assert.rejects(payments.reopenPaymentBatch(id,[result.paymentId],a.actor),e=>e.getStatus()===403);
      await assert.rejects(payments.reopenPendingPayment(id,a.actor),e=>[403,409].includes(e.getStatus()));
      await c.query("update temo.turnos set estado='CERRADO' where id_turno=$1",[a.shift.database_id]);
      assert.deepEqual(await payments.payPending(id,input,b.actor),result,'Replay authorizes applying shift rather than closed source shift');
      await c.query("update temo.turnos set estado='ABIERTO' where id_turno=$1",[a.shift.database_id]);
      await c.query("update temo.turnos set estado='CERRADO' where id_turno=$1",[b.shift.database_id]);
      await assert.rejects(payments.payPending(id,input,b.actor),e=>e.getStatus()===409);
      await assert.rejects(payments.reopenPaymentBatch(id,[result.paymentId],admin),e=>e.getStatus()===403);
      await assert.rejects(payments.reopenPendingPayment(id,admin),e=>[403,409].includes(e.getStatus()));
    });
    await t.test('reopening individual payment invalidates old receipt; review shift does not accept new liquidations',async()=>{
      await payments.reopenPendingPayment(firstId,a.actor);
      const before=await state();await assert.rejects(payments.payPending(firstId,firstInput,a.actor),e=>e.getStatus()===409);
      assert.deepEqual(await state(),before);
      await c.query("update temo.turnos set estado='EN_REVISION' where id_turno=$1",[a.shift.database_id]);
      await assert.rejects(payments.payPending(firstId,singleInput(),a.actor),e=>e.getStatus()===409);
      assert.deepEqual(await state(),before);
    });
  }finally{await c.query('rollback');await c.end();}
});
