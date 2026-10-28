const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {HandoversService}=require('../dist/modules/shifts/handovers.service');
const {TransactionsService}=require('../dist/modules/transactions/transactions.service');
const {TransfersService}=require('../dist/modules/transfers/transfers.service');
const {createTransactionBatchSchema,updateTransactionSchema,payPendingSchema,payPendingBatchSchema}=require('../dist/modules/transactions/transaction-batch.schema');
const counts=n=>({NIO:[{denomination:10,piles25:0,loose:n}],USD:[]});
const rates={buy:36.4,sell:37};
const settlement=n=>({primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:counts(n),changeCounts:{NIO:[],USD:[]}});
const blocked=e=>e.getStatus()===409&&e.getResponse().code==='TUR-SOL-409';

test('submitted shifts freeze only their cashier; cancellation, rejection and review handover restore scoped corrections', {skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
  const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,extensions,public',statement_timeout:15000});
  await c.connect();await c.query('begin');let seq=0;
  const db={query:(sql,args)=>c.query(sql,args),transaction:async work=>{
    const save='freeze_'+(++seq);await c.query('savepoint '+save);
    try{const result=await work(c);await c.query('release savepoint '+save);return result;}
    catch(e){await c.query('rollback to savepoint '+save);await c.query('release savepoint '+save);throw e;}
  }};
  try{
    if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
    const admin=(await c.query(`select u.id_usuario as id,u.version_sesion as "sessionVersion",'JEFA' as "roleCode" from temo.usuarios u join temo.roles r using(id_rol)
      where r.codigo='JEFA' and u.estado='ACTIVO' and not u.debe_cambiar_contrasena limit 1`)).rows[0];
    const branch=(await c.query(`select s.id_sucursal as id,s.nombre from temo.sucursales s join temo.cuentas_sucursales cs using(id_sucursal)
      join temo.cuentas_bancarias cb using(id_cuenta) join temo.entidades_bancarias e using(id_entidad) join temo.monedas m using(id_moneda)
      where s.estado='ACTIVO' and cb.estado='ACTIVO' and e.codigo='BAC' and m.codigo='NIO' limit 1`)).rows[0];
    const shifts=new ShiftsService(db),handovers=new HandoversService(db,shifts),transactions=new TransactionsService(db),transfers=new TransfersService(db);
    async function actor(){
      const username='qa_freeze_'+randomUUID().replaceAll('-','');
      const user=(await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
        select id_rol,'Freeze','QA',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo='CAJERO'
        returning id_usuario as id,usuario as username,version_sesion as "sessionVersion",'CAJERO' as "roleCode"`,[username])).rows[0];
      await c.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[user.id,branch.id]);return user;
    }
    const a=await actor(),b=await actor(),receiver=await actor();
    async function open(user,register=user.username){return shifts.create({branchId:branch.id,branch:branch.nombre,register,cashier:user.username,counts:counts(100),balances:[],notes:'freeze fixture',prepared:false},admin);}
    const source=await open(a),other=await open(b),id=source.database_id;
    const batch=(shift,user,pending=false)=>createTransactionBatchSchema.parse({requestId:randomUUID(),shiftId:shift,userId:user.id,rates,
      transactions:[{entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount:10,...(pending?{pendingName:'freeze QA'}:{})}],settlement:settlement(pending?0:1)});
    const originalInput=batch(id,a);
    const original=await transactions.createBatch(originalInput,{actor:a});
    const pending=await transactions.createBatch(batch(id,a,true),{actor:a});
    const pid=(await c.query('select id_pendiente from temo.pagos_pendientes where id_transaccion=$1',[pending.transactions[0].id])).rows[0].id_pendiente;
    const paidPending=await transactions.createBatch(batch(id,a,true),{actor:a});
    const paidId=(await c.query('select id_pendiente from temo.pagos_pendientes where id_transaccion=$1',[paidPending.transactions[0].id])).rows[0].id_pendiente;
    const paymentInput=payPendingSchema.parse({requestId:randomUUID(),rates,settlement:settlement(1)});
    const payment=await transactions.payPending(paidId,paymentInput,a);
    const transferInput={shiftId:id,type:'EFECTIVO',direction:'EGRESO',currency:'NIO',amount:10,cashLines:counts(1).NIO,description:'freeze QA'};
    const transfer=await transfers.create(transferInput,a);
    const signature=async shift=>{
      const d=await shifts.detail(shift,admin);return {cash:d.cashCounts,balances:d.balances,expected:d.expectedCash,change:d.cambio_nio};
    };
    const operations=[
      ()=>shifts.saveCashCount(id,{counts:counts(100),changeNio:0},a),
      ()=>shifts.saveBalances(id,[],a),
      ()=>transactions.createBatch(batch(id,a),{actor:a}),
      ()=>transactions.update(original.transactions[0].id,updateTransactionSchema.parse({entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount:20,rates,settlement:settlement(2)}),a),
      ()=>transactions.void(original.transactions[0].id,a),
      ()=>transactions.updateGroup(original.transactions[0].id,{requestId:randomUUID(),updates:[],voidIds:[original.transactions[0].id],preferential:false},a),
      ()=>transactions.payPending(pid,payPendingSchema.parse({requestId:randomUUID(),rates,settlement:settlement(1)}),a),
      ()=>transactions.payPendingBatch(payPendingBatchSchema.parse({requestId:randomUUID(),pendingIds:[pid],method:'EFECTIVO',rates,settlement:settlement(1)}),a),
      ()=>transactions.reopenPendingPayment(paidId,a),
      ()=>transactions.reopenPaymentBatch(paidId,[payment.paymentId],a),
      ()=>transfers.create(transferInput,a),
      ()=>transfers.update(transfer.database_id,transferInput,a),
      ()=>transfers.void(transfer.database_id,'freeze test',a),
    ];
    await t.test('close request rejects every money mutation without changing funds; other cashier keeps working',async()=>{
      await shifts.requestClose(id,a);const before=await signature(id);
      const submittedVersion=(await shifts.detail(id,a)).closure_version;
      for(const operation of operations)await assert.rejects(operation(),e=>blocked(e)||e.getStatus()===403);
      assert.deepEqual(await transactions.createBatch(originalInput,{actor:a}),original,'Confirmed receipt replay is read-only, not a new movement');
      assert.deepEqual(await signature(id),before);
      assert.equal((await shifts.detail(id,a)).write_locked,true);
      await transactions.createBatch(batch(other.database_id,b),{actor:b});
      await shifts.saveCashCount(other.database_id,{counts:counts(100),changeNio:0},b);
      await assert.rejects(shifts.cancelClose(id,b),e=>e.getStatus()===403);
      await assert.rejects(shifts.cancelClose(id,{...a,sessionVersion:-1}),e=>e.getStatus()===403);
      await shifts.cancelClose(id,a);assert.equal((await shifts.detail(id,a)).write_locked,false);
      await assert.rejects(shifts.close(id,{counts:counts(100),balances:[],changeNio:0,observations:'stale review',expectedCloseRequest:submittedVersion},admin),e=>e.getStatus()===409);
      await transactions.createBatch(batch(id,a),{actor:a});
      await shifts.requestClose(id,a);
      await assert.rejects(shifts.close(id,{counts:counts(100),balances:[],changeNio:0,observations:'stale review',expectedCloseRequest:submittedVersion},admin),e=>e.getStatus()===409);
      await shifts.rejectClose(id,admin);
      assert.equal((await shifts.detail(id,a)).estado,'ABIERTO');
      await transactions.createBatch(batch(id,a),{actor:a});
    });
    await t.test('handover freezes proposal, cancellation/rejection release; review can be corrected until explicitly submitted',async()=>{
      async function propose(){const p=await handovers.preview(id,a);return handovers.propose(id,{requestId:randomUUID(),receiverId:receiver.id,expectedVersion:p.version,mode:'EN_REVISION'},a);}
      let h=await propose();for(const operation of operations)await assert.rejects(operation(),blocked);
      await handovers.resolve(h.id_traspaso,'cancel',a);await shifts.saveCashCount(id,{counts:counts(100),changeNio:0},a);
      h=await propose();await handovers.resolve(h.id_traspaso,'reject',receiver);assert.equal((await shifts.detail(id,a)).write_locked,false);
      h=await propose();const accepted=await handovers.resolve(h.id_traspaso,'accept',receiver);
      const incomingBefore=await signature(accepted.id_turno_destino);
      assert.equal((await shifts.detail(id,a)).write_locked,false);
      assert.ok((await transactions.listPending(a)).some(row=>row.database_id===pid),'Owner can consult pending rows from the review shift without another open shift');
      assert.ok(!(await transactions.listPending({...a,roleCode:'TRANSFERISTA'})).some(row=>row.database_id===pid),'The review visibility exception is restricted to the cashier role');
      const inactive=await actor();
      assert.ok(!(await transactions.listPending(inactive)).some(row=>row.database_id===pid),'Review visibility does not grant another cashier access');
      await transactions.createBatch(batch(id,a),{actor:a});await shifts.saveCashCount(id,{counts:counts(90),changeNio:0},a);
      await shifts.requestClose(id,a);await assert.rejects(shifts.saveCashCount(id,{counts:counts(100),changeNio:0},a),blocked);
      const ownNew=await open(a,'QA_NEW_'+randomUUID().slice(0,8));
      await transactions.createBatch(batch(ownNew.database_id,a),{actor:a});
      await shifts.saveCashCount(ownNew.database_id,{counts:counts(100),changeNio:0},a);
      assert.equal((await shifts.detail(ownNew.database_id,a)).write_locked,false);
      await assert.rejects(transactions.createBatch(batch(id,a),{actor:a}),blocked);
      await shifts.cancelClose(id,a);assert.equal((await shifts.detail(id,a)).estado,'EN_REVISION');
      await shifts.requestClose(id,a);await shifts.rejectClose(id,admin);
      assert.equal((await shifts.detail(id,a)).estado,'EN_REVISION');assert.equal((await shifts.detail(id,a)).write_locked,false);
      await transactions.createBatch(batch(id,a),{actor:a});
      assert.deepEqual(await signature(accepted.id_turno_destino),incomingBefore);
      await transactions.createBatch(batch(accepted.id_turno_destino,receiver),{actor:receiver});
    });
  }finally{await c.query('rollback');await c.end();}
});
