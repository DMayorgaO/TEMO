const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {HandoversService}=require('../dist/modules/shifts/handovers.service');
const cash={NIO:[{denomination:100,piles25:0,loose:10},{denomination:.5,piles25:0,loose:1},{denomination:.25,piles25:0,loose:1}],USD:[{denomination:10,piles25:0,loose:2}]};

test('handover integration: isolated preview, all fixture changes rolled back',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
  const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,extensions,public',statement_timeout:15000});
  await c.connect();await c.query('begin');let sequence=0,failNotice=false,failCloseAudit=false;
  if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
  const db={query:(sql,args)=>c.query(sql,args),transaction:async work=>{
    const save='handover_'+(++sequence);await c.query('savepoint '+save);
    const proxy={query:(sql,args)=>{if(failNotice&&sql.includes('insert into temo.notificaciones_usuarios'))throw new Error('simulated notice failure');if(failCloseAudit&&sql.includes('insert into temo.bitacora'))throw new Error('simulated close audit failure');return c.query(sql,args);}};
    try{const result=await work(proxy);await c.query('release savepoint '+save);return result;}
    catch(e){await c.query('rollback to savepoint '+save);await c.query('release savepoint '+save);throw e;}
  }};
  const shifts=new ShiftsService(db),handovers=new HandoversService(db,shifts);
  try{
    const adminRow=(await c.query(`select u.id_usuario as id,u.version_sesion from temo.usuarios u join temo.roles r using(id_rol) where r.codigo='JEFA' and r.estado='ACTIVO' and u.estado='ACTIVO' and not u.debe_cambiar_contrasena limit 1`)).rows[0];
    const admin={id:adminRow.id,sessionVersion:adminRow.version_sesion,roleCode:'JEFA'};
    async function user(branch){
      const username='handover_'+randomUUID().replaceAll('-','');
      const row=(await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
        select id_rol,'Handover','QA',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo='CAJERO'
        returning id_usuario as id,version_sesion`,[username])).rows[0];
      await c.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[row.id,branch]);
      return {id:row.id,username,roleCode:'CAJERO',sessionVersion:row.version_sesion};
    }
    const branch=(await c.query(`select id_sucursal as id,nombre from temo.sucursales where estado='ACTIVO' limit 1`)).rows[0];
    await c.query(`insert into temo.cuentas_sucursales(id_cuenta,id_sucursal)
      select cb.id_cuenta,$1 from temo.cuentas_bancarias cb join temo.entidades_bancarias e using(id_entidad)
      where e.codigo in ('TELEDOLAR','BAC') and cb.estado='ACTIVO' on conflict do nothing`,[branch.id]);
    const sender=await user(branch.id),receiver=await user(branch.id),outsider=await user(branch.id);
    const opening={branchId:branch.id,branch:branch.nombre,register:'Handover QA '+randomUUID().slice(0,6),cashier:sender.username,counts:cash,balances:[],notes:'isolated test',prepared:false};
    const source=await shifts.create(opening,admin);const shiftId=source.database_id;
    const banks=source.balances.filter(row=>row.entity!=='TELEDOLAR').slice(0,2);
    for(const [index,bank]of banks.entries())await c.query(`update temo.saldos_turno_cuentas
      set saldo_inicial=$3,saldo_final_calculado=$3,saldo_final_sistema=$3 where id_turno=$1 and id_cuenta=$2`,
    [shiftId,bank.account_id,index?' -10.5123'.trim():'100.1234']);
    const propose=async(target=receiver,requestId=randomUUID())=>{
      const preview=await handovers.preview(shiftId,sender);
      return handovers.propose(shiftId,{requestId,receiverId:target.id,expectedVersion:preview.version},sender);
    };
    await t.test('only owner cashier can preview and propose; candidates confined to branch and availability',async()=>{
      await assert.rejects(handovers.preview(shiftId,admin),e=>e.getStatus()===403);
      await assert.rejects(handovers.preview(shiftId,outsider),e=>e.getStatus()===403);
      assert.ok((await handovers.candidates(shiftId,sender)).some(row=>row.id===receiver.id));
      const preview=await handovers.preview(shiftId,sender);
      await assert.rejects(handovers.propose(shiftId,{requestId:randomUUID(),receiverId:sender.id,expectedVersion:preview.version},sender),e=>e.getStatus()===409);
      await assert.rejects(handovers.preview(shiftId,{...sender,sessionVersion:-1}),e=>e.getStatus()===403);
    });
    await t.test('reject, cancel and expiry leave original open without creating destination',async()=>{
      let h=await propose();
      await assert.rejects(handovers.resolve(h.id_traspaso,'accept',sender),e=>e.getStatus()===403);
      await assert.rejects(handovers.resolve(h.id_traspaso,'accept',outsider),e=>e.getStatus()===404);
      await handovers.resolve(h.id_traspaso,'reject',receiver);
      h=await propose();await handovers.resolve(h.id_traspaso,'cancel',sender);
      h=await propose();await c.query(`update temo.traspasos_turno set fecha_limite=now()-interval '1 minute' where id_traspaso=$1`,[h.id_traspaso]);
      await assert.rejects(handovers.resolve(h.id_traspaso,'accept',receiver),e=>e.getStatus()===409);
      await handovers.list(sender);
      assert.equal((await shifts.detail(shiftId,sender)).estado,'ABIERTO');
    });
    await t.test('inactive and unassigned receivers cannot receive a handover',async()=>{
      await c.query(`update temo.usuarios set estado='INACTIVO' where id_usuario=$1`,[receiver.id]);
      await assert.rejects(propose(),e=>e.getStatus()===409);
      await c.query(`update temo.usuarios set estado='ACTIVO' where id_usuario=$1`,[receiver.id]);
      await c.query('delete from temo.usuarios_sucursales where id_usuario=$1',[receiver.id]);
      assert.ok(!(await handovers.candidates(shiftId,sender)).some(row=>row.id===receiver.id));
      await assert.rejects(propose(),e=>e.getStatus()===409);
      await c.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[receiver.id,branch.id]);
    });
    await t.test('different business day requires administrative closure',async()=>{
      await c.query(`update temo.turnos set fecha_apertura=fecha_apertura-interval '2 days' where id_turno=$1`,[shiftId]);
      await assert.rejects(handovers.preview(shiftId,sender),e=>e.getStatus()===409);
      await c.query(`update temo.turnos set fecha_apertura=now() where id_turno=$1`,[shiftId]);
    });
    await t.test('data changes invalidate receiver acceptance without closing source',async()=>{
      const h=await propose();
      await assert.rejects(shifts.saveCashCount(shiftId,{counts:cash,changeNio:0},sender),e=>e.getResponse().code==='TUR-SOL-409');
      await shifts.saveCashCount(shiftId,{counts:{...cash,NIO:[{denomination:100,piles25:0,loose:11}]},changeNio:0},admin);
      await assert.rejects(handovers.resolve(h.id_traspaso,'accept',receiver),e=>e.getStatus()===409);
      await handovers.resolve(h.id_traspaso,'cancel',sender);
      const withDifference=await propose();
      await handovers.resolve(withDifference.id_traspaso,'cancel',sender);
      await shifts.saveCashCount(shiftId,{counts:cash,changeNio:0},sender);
    });
    await t.test('preview explains exact cash and bank gaps without notifying; explicit review notifies and preserves notes',async()=>{
      const extra={...cash,NIO:[...cash.NIO,{denomination:10,piles25:0,loose:1}]};
      await shifts.saveCashCount(shiftId,{counts:extra,changeNio:0},sender);
      const preview=await handovers.preview(shiftId,sender);
      assert.equal(preview.snapshot.cashDifference,10);
      assert.equal(preview.snapshot.pendingCashDifference,10);
      assert.deepEqual(preview.snapshot.accountDifferences,[]);
      assert.equal(preview.snapshot.dollarPurchases.differenceNio,0);
      assert.ok(!(await shifts.notifications(admin)).some(row=>row.kind==='CLOSE_REQUEST'&&row.shift_id===shiftId));
      const notes='Revisar sobrante contado; entrega con observaciones.';
      await shifts.requestClose(shiftId,sender,notes);
      const notification=(await shifts.notifications(admin)).find(row=>row.kind==='CLOSE_REQUEST'&&row.shift_id===shiftId);
      assert.equal(notification.observations,notes);
      const reviewing=await shifts.detail(shiftId,sender);
      assert.equal(reviewing.estado,'PENDIENTE_APROBACION');assert.equal(reviewing.solicitud_observaciones,notes);
      await shifts.rejectClose(shiftId,admin);
      await shifts.saveCashCount(shiftId,{counts:cash,changeNio:0},sender);
      const bank=banks[0];
      await shifts.saveBalances(shiftId,[{account:bank.account,amount:125.1234}],sender);
      const bankPreview=await handovers.preview(shiftId,sender);
      assert.equal(bankPreview.snapshot.cashDifference,0);
      assert.equal(bankPreview.snapshot.accountDifferences.length,1);
      assert.ok(Math.abs(bankPreview.snapshot.accountDifferences[0].difference-25)<.00001);
      assert.equal(bankPreview.snapshot.accountDifferences[0].accountId,bank.account_id);
      await shifts.saveBalances(shiftId,[{account:bank.account,amount:100.1234}],sender);
    });
    await t.test('receiver availability checked again after request',async()=>{
      const h=await propose();
      const prepared=await shifts.create({...opening,cashier:receiver.username,register:'Receiver QA '+randomUUID().slice(0,6),prepared:true},admin);
      await assert.rejects(handovers.resolve(h.id_traspaso,'accept',receiver),e=>e.getStatus()===409);
      await c.query(`update temo.turnos set estado='ANULADO' where id_turno=$1`,[prepared.database_id]);
      await handovers.resolve(h.id_traspaso,'cancel',sender);
    });
    let accepted;
    await t.test('notice failure rolls back closure and opening; retry succeeds exactly once',async()=>{
      const requestId=randomUUID();const preview=await handovers.preview(shiftId,sender);
      const payload={requestId,receiverId:receiver.id,expectedVersion:preview.version,observations:'Entrega de prueba con monedas y comprobantes.'};
      const h=await handovers.propose(shiftId,payload,sender);
      assert.equal((await handovers.propose(shiftId,payload,sender)).id_traspaso,h.id_traspaso);
      failNotice=true;await assert.rejects(handovers.resolve(h.id_traspaso,'accept',receiver),/simulated notice failure/);failNotice=false;
      assert.equal((await shifts.detail(shiftId,sender)).estado,'ABIERTO');
      assert.equal((await c.query(`select count(*)::int as n from temo.turnos where id_cajero=$1 and estado='ABIERTO'`,[receiver.id])).rows[0].n,0);
      accepted=await handovers.resolve(h.id_traspaso,'accept',receiver);
      assert.equal(accepted.estado,'ACEPTADO');
      assert.equal(accepted.observaciones,payload.observations);
      assert.equal((await handovers.resolve(h.id_traspaso,'accept',receiver)).id_turno_destino,accepted.id_turno_destino);
      const dest=await shifts.detail(accepted.id_turno_destino,receiver),closed=await shifts.detail(shiftId,sender);
      assert.equal(closed.estado,'CERRADO');assert.equal(dest.estado,'ABIERTO');
      assert.ok(closed.observaciones_cierre.includes(payload.observations));
      assert.ok(dest.observaciones_apertura.includes(payload.observations));
      assert.ok(closed.observaciones_cierre.includes(`Traspaso del turno ${closed.id}: ${closed.cajero} entrega a ${dest.cajero}.`));
      assert.ok(!closed.observaciones_cierre.includes(sender.id));
      assert.ok(!closed.observaciones_cierre.includes(receiver.id));
      assert.equal(dest.id_sucursal,closed.id_sucursal);assert.equal(dest.id_caja,closed.id_caja);
      assert.deepEqual(dest.cashCounts.APERTURA,closed.cashCounts.CIERRE_CONTADO);
      assert.equal(Number(dest.cambio_nio),0);
      for(const balance of closed.balances){const newBalance=dest.balances.find(item=>item.account_id===balance.account_id);assert.ok(newBalance);if(balance.entity!=='TELEDOLAR')assert.equal(Number(newBalance.initial),Number(balance.system));else{assert.equal(Number(newBalance.system_income),Number(balance.system_income));assert.equal(Number(newBalance.system_expense),Number(balance.system_expense));}}
      const admins=(await c.query(`select count(*)::int as n from temo.usuarios u join temo.roles r using(id_rol) where r.codigo='JEFA' and r.estado='ACTIVO' and u.estado='ACTIVO'`)).rows[0].n;
      const notices=(await c.query(`select count(*)::int as n from temo.notificaciones_usuarios where tipo='TRASPASO_TURNO' and id_turno=$1`,[shiftId])).rows[0].n;
      assert.equal(notices,admins);
      assert.ok((await shifts.notifications(admin)).some(row=>row.kind==='SHIFT_HANDOVER'&&row.shift_id===shiftId));
    });
    await t.test('late cash and bank writes cannot mutate transferred source',async()=>{
      await assert.rejects(shifts.saveCashCount(shiftId,{counts:cash,changeNio:0},sender));
      await assert.rejects(shifts.saveBalances(shiftId,[],sender));
      await c.query('savepoint protected_write');
      try{await assert.rejects(c.query(`update temo.arqueos set monto_total=0 where id_turno=$1 and tipo='ACTUAL'`,[shiftId]),e=>e.code==='23514');}
      finally{await c.query('rollback to savepoint protected_write');}
    });
    await t.test('review handover registers net differences, isolates both shifts and requires admin closure',async()=>{
      const sourceId=accepted.id_turno_destino;
      const transfers=new(require('../dist/modules/transfers/transfers.service').TransfersService)(db);
      const sourceTd=(await shifts.detail(sourceId,receiver)).balances.find(row=>row.entity==='TELEDOLAR');
      const priorMovement=await transfers.create({shiftId:sourceId,type:'DIGITAL',direction:'INGRESO',currency:sourceTd.currency,accountId:sourceTd.account_id,amount:5,description:'Source operation before handover',cashLines:[]},admin);
      const extra={...cash,NIO:[...cash.NIO,{denomination:10,piles25:0,loose:1}]};
      await shifts.saveCashCount(sourceId,{counts:extra,changeNio:3},receiver);
      const before=await handovers.preview(sourceId,receiver);
      assert.equal(before.snapshot.pendingCashDifference,7);
      await assert.rejects(handovers.registerDifference(sourceId,before.version,outsider),e=>e.getStatus()===403);
      const registered=await handovers.registerDifference(sourceId,before.version,receiver);
      assert.equal(registered.snapshot.changeNio,'10.0000');
      assert.equal(registered.snapshot.pendingCashDifference,0);
      await assert.rejects(handovers.registerDifference(sourceId,before.version,receiver),e=>e.getStatus()===409);
      await c.query(`update temo.saldos_turno_cuentas set fecha_actualizacion=clock_timestamp()+interval '1 second' where id_turno=$1`,[sourceId]);
      const h=await handovers.propose(sourceId,{requestId:randomUUID(),receiverId:outsider.id,expectedVersion:registered.version,mode:'EN_REVISION',observations:'Revisar documentos'},receiver);
      await c.query(`update temo.saldos_turno_cuentas set fecha_actualizacion=clock_timestamp()+interval '2 seconds' where id_turno=$1`,[sourceId]);
      const result=await handovers.resolve(h.id_traspaso,'accept',outsider);
      const newId=result.id_turno_destino;
      assert.equal((await shifts.detail(sourceId,receiver)).estado,'EN_REVISION');
      assert.equal((await shifts.current(receiver)).database_id,sourceId);
      assert.equal((await shifts.access(receiver)).active.estado,'EN_REVISION');
      assert.equal((await shifts.detail(newId,outsider)).estado,'ABIERTO');
      assert.ok((await shifts.notifications(admin)).some(row=>row.kind==='CLOSE_REQUEST'&&row.shift_id===sourceId));
      await c.query('savepoint reject_review');
      await shifts.rejectClose(sourceId,admin);
      assert.equal((await shifts.detail(sourceId,receiver)).estado,'EN_REVISION');
      await c.query('rollback to savepoint reject_review');
      await assert.rejects(transfers.create({shiftId:sourceId,type:'EFECTIVO',direction:'EGRESO',currency:'NIO',amount:10,description:'No new operations',cashLines:[]},receiver));
      const td=(await shifts.detail(sourceId,receiver)).balances.find(row=>row.entity==='TELEDOLAR');
      assert.ok(td,'Teledolar fixture required');
      const tdBefore=(await shifts.detail(sourceId,receiver)).balances.find(row=>row.account_id===td.account_id);
      const sourceCashBefore=await shifts.detail(sourceId,receiver);
      const input={type:'DIGITAL',direction:'INGRESO',currency:td.currency,accountId:td.account_id,amount:12,description:'Isolated recipient movement',cashLines:[]};
      await transfers.create({...input,shiftId:newId},admin);
      await transfers.create({shiftId:newId,type:'EFECTIVO',direction:'EGRESO',currency:'NIO',amount:10,description:'Recipient cash movement',cashLines:[{denomination:10,piles25:0,loose:1}]},outsider);
      const sourceCashAfter=await shifts.detail(sourceId,receiver);
      assert.deepEqual(sourceCashAfter.cashCounts,sourceCashBefore.cashCounts);
      assert.deepEqual(sourceCashAfter.expectedCash,sourceCashBefore.expectedCash);
      const originalAfter=(await shifts.detail(sourceId,receiver)).balances.find(row=>row.account_id===td.account_id);
      assert.equal(originalAfter.income,tdBefore.income);
      assert.equal(originalAfter.system_income,tdBefore.system_income);
      const destinationBefore=await shifts.detail(newId,outsider);
      const transactions=new(require('../dist/modules/transactions/transactions.service').TransactionsService)(db);
      const {createTransactionBatchSchema,updateTransactionSchema}=require('../dist/modules/transactions/transaction-batch.schema');
      const movement=(await shifts.detail(sourceId,receiver)).availableMovements.find(r=>r.entity==='BAC'&&r.code==='DC'&&r.currencies.includes('NIO'));
      assert.ok(movement,'BAC deposit fixture required');
      const settlement=amount=>({primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:{NIO:[{denomination:10,piles25:0,loose:amount/10}],USD:[]},changeCounts:{NIO:[],USD:[]}});
      const payload=createTransactionBatchSchema.parse({shiftId:sourceId,userId:receiver.id,rates:{buy:36.4,sell:37},transactions:[{entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount:10,description:'Correccion en revision'}],settlement:settlement(10)});
      await assert.rejects(transactions.createBatch({...payload,userId:outsider.id},{}),e=>e.getStatus()===409);
      await assert.rejects(transactions.createBatch({...payload,shiftId:undefined},{}),e=>e.getStatus()===409);
      const cashBeforeCorrection=await shifts.detail(sourceId,receiver);
      const created=await transactions.createBatch(payload,{});
      const transactionId=created.transactions[0].id;
      assert.equal(Number((await shifts.detail(sourceId,receiver)).expectedCash.NIO),Number(cashBeforeCorrection.expectedCash.NIO)+10);
      assert.ok(await transactions.detail(transactionId,receiver));
      await transactions.update(transactionId,updateTransactionSchema.parse({entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount:20,rates:{buy:36.4,sell:37},settlement:settlement(20)}),receiver);
      assert.equal(Number((await shifts.detail(sourceId,receiver)).expectedCash.NIO),Number(cashBeforeCorrection.expectedCash.NIO)+20);
      await assert.rejects(transactions.void(transactionId,outsider),e=>e.getStatus()===403);
      await transactions.void(transactionId,receiver);
      assert.deepEqual((await shifts.detail(sourceId,receiver)).expectedCash,cashBeforeCorrection.expectedCash);
      await transfers.update(priorMovement.database_id,{...input,shiftId:sourceId,amount:7},admin);
      assert.equal(Number((await shifts.detail(sourceId,receiver)).balances.find(r=>r.account_id===td.account_id).calculated),Number(tdBefore.calculated)+2);
      await shifts.saveCashCount(sourceId,{counts:cash,changeNio:0},receiver);
      await shifts.saveBalances(sourceId,[{account:td.account,amount:23,income:25,expense:2}],receiver);
      const sourceCorrection=await transfers.create({...input,shiftId:newId,amount:1},admin);
      await assert.rejects(transfers.update(sourceCorrection.database_id,{...input,shiftId:sourceId,amount:1},outsider),e=>e.getStatus()===403);
      await transfers.void(sourceCorrection.database_id,'Rollback temporary test movement',admin);
      const destinationAfter=await shifts.detail(newId,outsider);
      assert.deepEqual(destinationAfter.cashCounts,destinationBefore.cashCounts);
      assert.deepEqual(destinationAfter.balances.map(r=>[r.account_id,r.income,r.expense,r.system]),destinationBefore.balances.map(r=>[r.account_id,r.income,r.expense,r.system]));
      const notificationBefore=(await shifts.notifications(admin)).find(row=>row.kind==='CLOSE_REQUEST'&&row.shift_id===sourceId);
      await assert.rejects(shifts.requestClose(sourceId,outsider),e=>[403,404].includes(e.getStatus()));
      await assert.rejects(shifts.requestClose(sourceId,{...receiver,sessionVersion:-1}),e=>e.getStatus()===403);
      await assert.rejects(shifts.requestClose(sourceId,admin),e=>e.getStatus()===403);
      failCloseAudit=true;
      await assert.rejects(shifts.requestClose(sourceId,receiver),/simulated close audit failure/);
      failCloseAudit=false;
      assert.deepEqual((await shifts.notifications(admin)).find(row=>row.kind==='CLOSE_REQUEST'&&row.shift_id===sourceId),notificationBefore);
      const request=await shifts.requestClose(sourceId,receiver);
      const notificationAfter=(await shifts.notifications(admin)).find(row=>row.kind==='CLOSE_REQUEST'&&row.shift_id===sourceId);
      assert.equal(request.id,notificationBefore.id);
      assert.ok(new Date(notificationAfter.created_at)>new Date(notificationBefore.created_at));
      const ready=await shifts.detail(sourceId,receiver);
      assert.equal(ready.estado,'EN_REVISION');
      assert.equal(ready.solicitud_estado,'PENDIENTE');
      assert.ok(ready.solicitud_observaciones.includes('Revisar documentos'));
      assert.ok(ready.solicitud_observaciones.includes('Handover QA entrega a Handover QA'));
      assert.deepEqual((await shifts.detail(newId,outsider)).cashCounts,destinationAfter.cashCounts);
      assert.deepEqual((await shifts.detail(newId,outsider)).balances,destinationAfter.balances);
      const event=(await c.query(`select datos_nuevos from temo.bitacora where id_registro=$1 and datos_nuevos->>'evento'='SOLICITAR_CIERRE_TRAS_CORRECCIONES'`,[sourceId])).rows[0];
      assert.equal(event.datos_nuevos.estado,'EN_REVISION');
      // Legacy system notes are repaired without losing user text, including chained handovers.
      const legacy=`Traspaso ${h.id_traspaso}; emisor ${receiver.id}; receptor ${outsider.id}. Cierre pendiente de aprobacion administrativa.\nObservaciones: Revisar documentos`;
      await c.query('update temo.turnos set observaciones_cierre=$2 where id_turno=$1',[sourceId,legacy]);
      await c.query('update temo.turnos set observaciones_apertura=$2 where id_turno=$1',[newId,legacy]);
      await c.query('update temo.solicitudes_cierre_turno set observaciones_cierre=$2 where id_turno=$1',[sourceId,legacy]);
      const migration=require('node:fs').readFileSync(require('node:path').join(__dirname,'../../database/init/050_readable_handover_observations.sql'),'utf8');
      await c.query(migration);
      const repaired=await shifts.detail(sourceId,receiver);
      assert.equal(repaired.observaciones_cierre,ready.observaciones_cierre);
      assert.equal(repaired.solicitud_observaciones,ready.solicitud_observaciones);
      assert.equal((await shifts.detail(newId,outsider)).observaciones_apertura,ready.observaciones_cierre);
      await c.query(migration);
      assert.equal((await shifts.detail(sourceId,receiver)).observaciones_cierre,repaired.observaciones_cierre);
      const closing=await shifts.detail(sourceId,receiver);
      const balances=closing.balances.map(r=>({account:r.account,amount:Number(r.system),income:r.system_income===null?undefined:Number(r.system_income),expense:r.system_expense===null?undefined:Number(r.system_expense)}));
      await assert.rejects(shifts.close(sourceId,{counts:cash,balances,changeNio:0,observations:'Revision resuelta'},receiver),e=>e.getStatus()===403);
      await shifts.close(sourceId,{counts:cash,balances,changeNio:0,observations:'Revision resuelta'},admin);
      assert.equal((await shifts.detail(sourceId,admin)).estado,'CERRADO');
      await assert.rejects(shifts.requestClose(sourceId,receiver),e=>[404,409].includes(e.getStatus()));
      const approval=(await c.query(`select datos_anteriores,datos_nuevos from temo.bitacora where id_registro=$1 and accion='APROBAR'`,[sourceId])).rows[0];
      assert.equal(approval.datos_anteriores.estado,'EN_REVISION');
      assert.equal(approval.datos_nuevos.estado,'CERRADO');
      assert.ok(approval.datos_nuevos.settlement.primaryCounts.NIO.length);
      await assert.rejects(transactions.createBatch(payload,{}),e=>e.getStatus()===409);
      const closedTd=(await shifts.detail(sourceId,admin)).balances.find(row=>row.account_id===td.account_id);
      assert.equal(Number(closedTd.system_income),25);
      assert.equal((await shifts.detail(newId,outsider)).estado,'ABIERTO');
    });
  }finally{await c.query('rollback');await c.end();}
});
