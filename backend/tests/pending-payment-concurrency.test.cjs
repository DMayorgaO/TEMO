const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {ConfigService}=require('@nestjs/config');
const {DatabaseService}=require('../dist/modules/database/database.service');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {TransactionsService}=require('../dist/modules/transactions/transactions.service');
const {createTransactionBatchSchema}=require('../dist/modules/transactions/transaction-batch.schema');
const counts=amount=>({NIO:amount?[{denomination:10,piles25:0,loose:amount/10}]:[],USD:[]});
const settlement=(amount=0)=>({primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:counts(amount),changeCounts:counts()});

test('actual concurrent payments and reversals serialize money across pool connections',{skip:!process.env.TEMO_TEST_PREVIEW},async()=>{
  const connection=new DatabaseService(new ConfigService({DATABASE_URL:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',DATABASE_SSL:'false',APP_ENV:'development',DATABASE_POOL_MAX:4}));
  const schema='qa_payment_'+randomUUID().replaceAll('-','');assert.match(schema,/^qa_payment_[a-f0-9]{32}$/);
  // Only receipts are isolated for cleanup: committed append-only production-shaped receipts are never disabled or deleted.
  const rewrite=sql=>sql.replaceAll('temo.solicitudes_financieras',schema+'.solicitudes_financieras');
  const db={query:(sql,args)=>connection.query(rewrite(sql),args),transaction:work=>connection.transaction(client=>work({query:(sql,args)=>client.query(rewrite(sql),args)}))};
  const shifts=new ShiftsService(db),payments=new TransactionsService(db),rates={buy:36.4,sell:37};
  const prefix='QA_PAY_'+randomUUID().replaceAll('-','').slice(0,12);let branch,actor;
  try{
    await connection.query(`create schema ${schema}`);
    await connection.query(`create table ${schema}.solicitudes_financieras (like temo.solicitudes_financieras including all)`);
    await connection.query(`create trigger proteger_recibo_financiero before update or delete on ${schema}.solicitudes_financieras
      for each row execute function temo.proteger_recibo_financiero()`);
    const admin=(await db.query(`select u.id_usuario as id,u.version_sesion as "sessionVersion",'JEFA' as "roleCode" from temo.usuarios u join temo.roles r using(id_rol)
      where r.codigo='JEFA' and u.estado='ACTIVO' and not u.debe_cambiar_contrasena limit 1`)).rows[0];
    branch=(await db.query(`insert into temo.sucursales(codigo,nombre,estado) values($1,$1,'ACTIVO') returning id_sucursal`,[prefix])).rows[0].id_sucursal;
    await db.query(`insert into temo.cuentas_sucursales(id_sucursal,id_cuenta) select $1,cb.id_cuenta from temo.cuentas_bancarias cb
      join temo.entidades_bancarias e using(id_entidad) join temo.monedas m using(id_moneda) where e.codigo='BAC' and m.codigo='NIO' and cb.estado='ACTIVO' limit 1`,[branch]);
    actor=(await db.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
      select id_rol,'Payment','Concurrent',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo='CAJERO'
      returning id_usuario as id,version_sesion as "sessionVersion",'CAJERO' as "roleCode"`,[prefix])).rows[0];
    await db.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[actor.id,branch]);
    const shift=await shifts.create({branchId:branch,branch:prefix,register:prefix,cashier:prefix,counts:counts(1000),balances:[],notes:'isolated payment concurrency fixture',prepared:false},admin);
    async function createPending(){
      const created=await payments.createBatch(createTransactionBatchSchema.parse({shiftId:shift.database_id,userId:actor.id,rates,transactions:[{entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount:10,pendingName:prefix}],settlement:settlement()}),{});
      return (await db.query('select id_pendiente from temo.pagos_pendientes where id_transaccion=$1',[created.transactions[0].id])).rows[0].id_pendiente;
    }
    for(const mode of ['single','batch']){
      const id=await createPending(),key=randomUUID();
      const input={requestId:key,rates,settlement:settlement(10)};
      const pay=requestId=>mode==='single'?payments.payPending(id,{...input,requestId},actor):payments.payPendingBatch({...input,requestId,pendingIds:[id],method:'EFECTIVO'},actor);
      const before=await shifts.detail(shift.database_id,actor);
      const result=await Promise.all([pay(key),pay(key.toUpperCase())]);
      assert.deepEqual(result[0],result[1]);
      assert.equal((await db.query('select count(*)::int as n from temo.abonos_pendientes where id_pendiente=$1',[id])).rows[0].n,1);
      assert.equal((await shifts.detail(shift.database_id,actor)).expectedCash.NIO,before.expectedCash.NIO+10);
      const ids=(await db.query('select id_abono from temo.abonos_pendientes where id_pendiente=$1',[id])).rows.map(r=>r.id_abono);
      const reversed=await Promise.allSettled([payments.reopenPaymentBatch(id,ids,actor),payments.reopenPaymentBatch(id,ids,actor)]);
      assert.equal(reversed.filter(r=>r.status==='fulfilled').length,1);assert.equal(reversed.filter(r=>r.status==='rejected').length,1);
      assert.equal((await shifts.detail(shift.database_id,actor)).expectedCash.NIO,before.expectedCash.NIO);
      await assert.rejects(pay(key),e=>e.getStatus()===409);
      const distinct=await Promise.allSettled([pay(randomUUID()),pay(randomUUID())]);
      assert.equal(distinct.filter(r=>r.status==='fulfilled').length,1);assert.equal(distinct.filter(r=>r.status==='rejected').length,1);
      assert.equal((await shifts.detail(shift.database_id,actor)).expectedCash.NIO,before.expectedCash.NIO+10);
    }
  }finally{
    if(branch)await connection.transaction(async c=>{
      const shifts=(await c.query('select id_turno from temo.turnos where id_sucursal=$1',[branch])).rows.map(r=>r.id_turno);
      const transactions=(await c.query('select id_transaccion from temo.transacciones where id_sucursal=$1',[branch])).rows.map(r=>r.id_transaccion);
      const groups=(await c.query('select id_grupo_transacciones from temo.grupos_transacciones where id_turno=any($1::uuid[])',[shifts])).rows.map(r=>r.id_grupo_transacciones);
      const pending=(await c.query('select id_pendiente from temo.pagos_pendientes where id_transaccion=any($1::uuid[])',[transactions])).rows.map(r=>r.id_pendiente);
      const abonos=(await c.query('select id_abono from temo.abonos_pendientes where id_turno_aplicacion=any($1::uuid[])',[shifts])).rows.map(r=>r.id_abono);
      await c.query('delete from temo.bitacora where id_registro=any($1::uuid[]) or id_usuario=$2',[[...shifts,...transactions,...groups,...pending,...abonos],actor?.id??null]);
      await c.query('delete from temo.notificaciones_usuarios where id_turno=any($1::uuid[])',[shifts]);
      await c.query('delete from temo.movimientos_efectivo where id_turno=any($1::uuid[])',[shifts]);
      await c.query('delete from temo.movimientos_cuentas where id_transaccion=any($1::uuid[])',[transactions]);
      await c.query('delete from temo.abonos_pendientes where id_pendiente=any($1::uuid[])',[pending]);
      await c.query('delete from temo.pagos_pendientes where id_pendiente=any($1::uuid[])',[pending]);
      await c.query('delete from temo.transacciones where id_transaccion=any($1::uuid[])',[transactions]);
      await c.query('delete from temo.grupos_transacciones where id_grupo_transacciones=any($1::uuid[])',[groups]);
      await c.query('delete from temo.turnos where id_sucursal=$1',[branch]);
      await c.query('delete from temo.jornadas where id_sucursal=$1',[branch]);await c.query('delete from temo.cajas where id_sucursal=$1',[branch]);
      await c.query('delete from temo.usuarios_sucursales where id_sucursal=$1',[branch]);await c.query('delete from temo.cuentas_sucursales where id_sucursal=$1',[branch]);
      await c.query('delete from temo.sucursales where id_sucursal=$1',[branch]);
      if(actor)await c.query('delete from temo.usuarios where id_usuario=$1',[actor.id]);
      await c.query('delete from temo.contrapartes where nombre=$1',[prefix]);
    });
    await connection.query(`drop schema if exists ${schema} cascade`);
    await connection.onModuleDestroy();
  }
});
