const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {HandoversService}=require('../dist/modules/shifts/handovers.service');
const {TransactionsService}=require('../dist/modules/transactions/transactions.service');
const {TransactionsController}=require('../dist/modules/transactions/transactions.controller');
const {TransfersService}=require('../dist/modules/transfers/transfers.service');
const {createTransactionBatchSchema}=require('../dist/modules/transactions/transaction-batch.schema');
const {auditChanges}=require('../dist/modules/catalogs/audit-changes');
const url='postgresql://temo_preview@127.0.0.1:55433/temo_preview';
const cash=amount=>({NIO:[{denomination:10,piles25:0,loose:amount/10}],USD:[]});
const settlement=amount=>({primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:cash(amount),changeCounts:{NIO:[],USD:[]}});

test('financial receipts and permission matrix: real local services, every change rolled back',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
  const c=new Client({connectionString:url,options:'-c search_path=temo,extensions,public',statement_timeout:15000});await c.connect();await c.query('begin');
  let seq=0,failAudit=false,failReceipt=false;
  const db={query:(sql,args)=>c.query(sql,args),transaction:async work=>{
    const save='security_'+(++seq);await c.query('savepoint '+save);
    const client={query:(sql,args)=>{
      if(failAudit&&sql.includes('insert into temo.bitacora'))throw new Error('audit unavailable');
      if(failReceipt&&sql.includes('insert into temo.solicitudes_financieras'))throw new Error('receipt unavailable');
      return c.query(sql,args);
    }};
    try{const value=await work(client);await c.query('release savepoint '+save);return value;}
    catch(error){await c.query('rollback to savepoint '+save);throw error;}
  }};
  try{
    if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
    const admin=(await c.query(`select u.id_usuario as id,u.version_sesion as "sessionVersion",'JEFA' as "roleCode" from temo.usuarios u join temo.roles r using(id_rol) where r.codigo='JEFA' and u.estado='ACTIVO' and not u.debe_cambiar_contrasena limit 1`)).rows[0];
    const branch=(await c.query(`select s.id_sucursal as id,s.nombre from temo.sucursales s join temo.cuentas_sucursales cs using(id_sucursal)
      join temo.cuentas_bancarias cb using(id_cuenta) join temo.entidades_bancarias e using(id_entidad) join temo.monedas m using(id_moneda)
      where s.estado='ACTIVO' and cb.estado='ACTIVO' and e.codigo='BAC' and m.codigo='NIO' limit 1`)).rows[0];
    const shifts=new ShiftsService(db),handovers=new HandoversService(db,shifts),transactions=new TransactionsService(db),transfers=new TransfersService(db);
    const controller=new TransactionsController(db,transactions);
    async function cashier(label,scope=branch){
      const login='security_request_'+randomUUID().replaceAll('-','');
      const actor=(await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
        select id_rol,'Request',$1,$2,'not-a-login-credential','ACTIVO',false from temo.roles where codigo='CAJERO'
        returning id_usuario as id,version_sesion as "sessionVersion",usuario as username`,[label,login])).rows[0];actor.roleCode='CAJERO';
      await c.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[actor.id,scope.id]);
      const shift=await shifts.create({branchId:scope.id,branch:scope.nombre,register:login,cashier:login,counts:cash(1000),balances:[],notes:'isolated security fixture',prepared:false},admin);
      return {actor,shift};
    }
    const a=await cashier('A'),b=await cashier('B');
    const foreignName='QA_'+randomUUID().replaceAll('-','').slice(0,16);
    const foreignBranch=(await c.query(`insert into temo.sucursales(codigo,nombre,estado) values($1,$1,'ACTIVO') returning id_sucursal as id,nombre`,[foreignName])).rows[0];
    const foreign=await cashier('Foreign',foreignBranch);
    const payload=(owner,requestId=randomUUID())=>createTransactionBatchSchema.parse({requestId,shiftId:owner.shift.database_id,userId:owner.actor.id,rates:{buy:36.4,sell:37},transactions:[{entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount:10}],settlement:settlement(10)});
    const summary=owner=>shifts.detail(owner.shift.database_id,owner.actor);
    let original;
    const first=payload(a);
    await t.test('same request returns original IDs and response; one cash effect, ledger and creation audit',async()=>{
      const before=await summary(a);
      original=await controller.createBatch({...first,userId:b.actor.id},{user:a.actor,headers:{}});
      const replay=await transactions.createBatch({...first},{actor:a.actor});
      assert.deepEqual(replay,original);
      assert.equal(Number((await summary(a)).expectedCash.NIO),before.expectedCash.NIO+10);
      assert.equal((await c.query(`select count(*)::int as n from temo.solicitudes_financieras where id_usuario=$1 and id_solicitud=$2`,[a.actor.id,first.requestId])).rows[0].n,1);
      assert.equal((await c.query(`select count(*)::int as n from temo.bitacora where tabla='grupos_transacciones' and id_registro=$1 and accion='CREAR'`,[original.groupId])).rows[0].n,1);
      assert.equal((await c.query(`select id_usuario_creacion from temo.grupos_transacciones where id_grupo_transacciones=$1`,[original.groupId])).rows[0].id_usuario_creacion,a.actor.id);
    });
    await t.test('same key with changed data rejected; distinct key and distinct owner remain legitimate',async()=>{
      await assert.rejects(transactions.createBatch({...first,transactions:[{...first.transactions[0],amount:20}]},{actor:a.actor}),e=>e.getStatus()===409);
      const other=await transactions.createBatch(payload(b,first.requestId),{actor:b.actor});assert.notEqual(other.groupId,original.groupId);
      const sameAmount=await transactions.createBatch(payload(a),{actor:a.actor});assert.notEqual(sameAmount.groupId,original.groupId);
    });
    await t.test('audit and receipt failures roll back cash, transactions and receipt; same key can be retried',async()=>{
      for(const failure of ['audit','receipt']){
        const before=await summary(a),input=payload(a);
        failAudit=failure==='audit';failReceipt=failure==='receipt';
        await assert.rejects(transactions.createBatch(input,{actor:a.actor}),/unavailable/);failAudit=false;failReceipt=false;
        assert.deepEqual((await summary(a)).cashCounts,before.cashCounts);
        assert.deepEqual((await summary(a)).expectedCash,before.expectedCash);
        assert.equal((await c.query('select 1 from temo.solicitudes_financieras where id_solicitud=$1',[input.requestId])).rowCount,0);
        const applied=await transactions.createBatch(input,{actor:a.actor});
        assert.deepEqual(await transactions.createBatch(input,{actor:a.actor}),applied);
      }
    });
    await t.test('cash transfer resend applies once and cannot change payload or bypass owner scope',async()=>{
      const input={requestId:randomUUID(),shiftId:a.shift.database_id,type:'EFECTIVO',direction:'EGRESO',currency:'NIO',amount:10,description:'receipt fixture',cashLines:cash(10).NIO};
      const before=await summary(a),transfer=await transfers.create(input,a.actor);
      const replay=await transfers.create(input,a.actor);assert.equal(replay.database_id,transfer.database_id);
      assert.equal((await summary(a)).expectedCash.NIO,before.expectedCash.NIO-10);
      await assert.rejects(transfers.create({...input,amount:20},a.actor),e=>e.getStatus()===409);
      await assert.rejects(transfers.create(input,b.actor),e=>e.getStatus()===403);
    });
    await t.test('revocation, deactivation, role change and password-change flags deny both new writes and replays',async()=>{
      const tests=[['version_sesion','version_sesion+1'],['estado',"'INACTIVO'"],['id_rol',"(select id_rol from temo.roles where codigo='TRANSFERISTA')"],['debe_cambiar_contrasena','true']];
      for(const [field,value]of tests){
        await c.query('savepoint identity_case');await c.query(`update temo.usuarios set ${field}=${value} where id_usuario=$1`,[a.actor.id]);
        await assert.rejects(transactions.createBatch(first,{actor:a.actor}),e=>e.getStatus()===403);
        await assert.rejects(transactions.createBatch(payload(a),{actor:a.actor}),e=>e.getStatus()===403);
        await assert.rejects(shifts.saveCashCount(a.shift.database_id,{counts:cash(1000),changeNio:0},a.actor),e=>e.getStatus()===403);
        await c.query('rollback to savepoint identity_case');
      }
    });
    await t.test('owner and state matrix: cashier cannot use another shift; transfer operator cannot correct cashier cash',async()=>{
      await assert.rejects(transactions.createBatch({...payload(a),shiftId:b.shift.database_id},{actor:a.actor}),e=>e.getStatus()===409);
      await assert.rejects(shifts.saveCashCount(b.shift.database_id,{counts:cash(1000),changeNio:0},a.actor),e=>[403,404].includes(e.getStatus()));
      await assert.rejects(handovers.preview(a.shift.database_id,{...a.actor,roleCode:'TRANSFERISTA'}),e=>e.getStatus()===403);
      await assert.rejects(shifts.saveCashCount(a.shift.database_id,{counts:cash(1000),changeNio:0},{...a.actor,roleCode:'TRANSFERISTA'}),e=>e.getStatus()===403);
      await assert.rejects(shifts.close(a.shift.database_id,{},a.actor),e=>e.getStatus()===403);
    });
    await t.test('cross-branch IDs cannot read, export, correct or receive another branch handover',async()=>{
      await assert.rejects(shifts.detail(a.shift.database_id,foreign.actor),e=>e.getStatus()===404);
      await assert.rejects(transactions.detail(original.transactions[0].id,foreign.actor),e=>e.getStatus()===403);
      await assert.rejects(controller.exportRows({format:'EXCEL',ids:[original.transactions[0].id]},{user:foreign.actor}),e=>e.getStatus()===403);
      await assert.rejects(shifts.saveBalances(a.shift.database_id,[],foreign.actor),e=>e.getStatus()===404);
      const preview=await handovers.preview(a.shift.database_id,a.actor);
      assert.ok(!(await handovers.candidates(a.shift.database_id,a.actor)).some(row=>row.id===foreign.actor.id));
      await assert.rejects(handovers.propose(a.shift.database_id,{requestId:randomUUID(),receiverId:foreign.actor.id,expectedVersion:preview.version},a.actor),e=>e.getStatus()===409);
      assert.ok(!(await transfers.context(foreign.actor)).shifts.some(row=>row.id===a.shift.database_id));
    });
    await t.test('administrator keeps authorized reads; transfer operator keeps transfer scope but not cashier corrections',async()=>{
      assert.equal((await shifts.detail(foreign.shift.database_id,admin)).database_id,foreign.shift.database_id);
      await assert.rejects(shifts.close(a.shift.database_id,{}, {...admin,sessionVersion:admin.sessionVersion+1}),e=>e.getStatus()===403);
      const operator=await cashier('Transfer operator');
      await c.query(`update temo.usuarios set id_rol=(select id_rol from temo.roles where codigo='TRANSFERISTA') where id_usuario=$1`,[operator.actor.id]);
      operator.actor.roleCode='TRANSFERISTA';
      assert.ok((await transfers.context(operator.actor)).shifts.some(row=>row.id===a.shift.database_id));
      const bank=(await summary(a)).balances.find(row=>row.entity==='BAC'&&row.currency==='NIO');
      const input={requestId:randomUUID(),shiftId:a.shift.database_id,type:'DIGITAL',direction:'INGRESO',currency:'NIO',accountId:bank.account_id,amount:10,description:'authorized operator scope',cashLines:[]};
      const applied=await transfers.create(input,operator.actor);
      assert.equal((await transfers.create(input,operator.actor)).database_id,applied.database_id);
      await assert.rejects(transactions.createBatch({...payload(operator),shiftId:operator.shift.database_id},{actor:operator.actor}),e=>e.getStatus()===403);
      await assert.rejects(shifts.saveCashCount(operator.shift.database_id,{counts:cash(1000),changeNio:0},operator.actor),e=>e.getStatus()===403);
    });
    await t.test('review corrections capture before/after counts and balances; audit failure preserves old values',async()=>{
      await c.query(`update temo.turnos set estado='EN_REVISION' where id_turno=$1`,[a.shift.database_id]);
      const before=await summary(a);
      failAudit=true;await assert.rejects(shifts.saveCashCount(a.shift.database_id,{counts:cash(900),changeNio:2},a.actor),/audit unavailable/);failAudit=false;
      assert.deepEqual((await summary(a)).cashCounts,before.cashCounts);
      await shifts.saveCashCount(a.shift.database_id,{counts:cash(900),changeNio:2},a.actor);
      const event=(await c.query(`select datos_anteriores,datos_nuevos from temo.bitacora where id_registro=$1 and datos_nuevos->>'evento'='CORREGIR_ARQUEO_EN_REVISION'`,[a.shift.database_id])).rows[0];
      assert.ok(event);const changes=auditChanges('turnos',event.datos_anteriores,event.datos_nuevos).changes;
      assert.ok(changes.some(row=>row.field==='Diferencia registrada NIO'&&row.after==='2'));
      assert.ok(changes.some(row=>row.field.startsWith('Arqueo C$ 10')));
      const bank=before.balances.find(r=>r.entity==='BAC'&&r.currency==='NIO');
      await shifts.saveBalances(a.shift.database_id,[{account:bank.account,amount:15}],a.actor);
      const balanceEvent=(await c.query(`select datos_anteriores,datos_nuevos from temo.bitacora where id_registro=$1 and datos_nuevos->>'evento'='CORREGIR_SALDOS_EN_REVISION'`,[a.shift.database_id])).rows[0];
      assert.ok(auditChanges('turnos',balanceEvent.datos_anteriores,balanceEvent.datos_nuevos).changes.some(row=>row.field.includes('Saldo Sistema')&&Number(row.after)===15));
    });
    await t.test('closed shift denies receipt disclosure and new operations; stored receipt cannot be overwritten',async()=>{
      await c.query(`update temo.turnos set estado='CERRADO' where id_turno=$1`,[a.shift.database_id]);
      await assert.rejects(transactions.createBatch(first,{actor:a.actor}),e=>e.getStatus()===409);
      await assert.rejects(transactions.createBatch(payload(a),{actor:a.actor}),e=>e.getStatus()===409);
      await assert.rejects(db.transaction(client=>client.query(`update temo.solicitudes_financieras set resultado='{}'::jsonb where id_solicitud=$1`,[first.requestId])),e=>e.code==='23514');
    });
  }finally{await c.query('rollback');await c.end();}
});
