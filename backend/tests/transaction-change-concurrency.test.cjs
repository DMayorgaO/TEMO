const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {ConfigService}=require('@nestjs/config');
const {DatabaseService}=require('../dist/modules/database/database.service');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {TransactionsService}=require('../dist/modules/transactions/transactions.service');
const {createTransactionBatchSchema,updateTransactionSchema}=require('../dist/modules/transactions/transaction-batch.schema');
const rates={buy:36.4,sell:37},counts=amount=>({NIO:amount?[{denomination:10,piles25:0,loose:amount/10}]:[],USD:[]});
const settlement=amount=>({primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:counts(amount),changeCounts:counts(0)});
const normalizedCounts=value=>Object.fromEntries(Object.entries(value).map(([type,currencies])=>[type,Object.fromEntries(Object.entries(currencies).map(([currency,data])=>[currency,
  {total:data.total,lines:data.lines.map(line=>[line.denomination,line.piles25*25+line.loose]).filter(line=>line[1]>0).sort((a,b)=>b[0]-a[0])}]))]));

test('real concurrent transaction changes and voids apply once across independent pool connections',{skip:!process.env.TEMO_TEST_PREVIEW},async()=>{
  const connection=new DatabaseService(new ConfigService({DATABASE_URL:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',DATABASE_SSL:'false',APP_ENV:'development',DATABASE_POOL_MAX:4}));
  const schema='qa_change_'+randomUUID().replaceAll('-','');assert.match(schema,/^qa_change_[a-f0-9]{32}$/);
  const rewrite=sql=>sql.replaceAll('temo.solicitudes_financieras',schema+'.solicitudes_financieras');
  const db={query:(sql,args)=>connection.query(rewrite(sql),args),transaction:work=>connection.transaction(client=>work({query:(sql,args)=>client.query(rewrite(sql),args)}))};
  const shifts=new ShiftsService(db),transactions=new TransactionsService(db),prefix='QA_CHANGE_'+randomUUID().replaceAll('-','').slice(0,12);
  let branch,actor;
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
      select id_rol,'Concurrent','Correction',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo='CAJERO'
      returning id_usuario as id,version_sesion as "sessionVersion",'CAJERO' as "roleCode"`,[prefix])).rows[0];
    await db.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[actor.id,branch]);
    const shift=await shifts.create({branchId:branch,branch:prefix,register:prefix,cashier:prefix,counts:counts(1000),balances:[],notes:'isolated concurrent changes',prepared:false},admin);
    const create=amounts=>transactions.createBatch(createTransactionBatchSchema.parse({shiftId:shift.database_id,userId:actor.id,rates,
      transactions:amounts.map(amount=>({entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount})),settlement:settlement(amounts.reduce((a,b)=>a+b,0))}),{});
    const snapshot=()=>shifts.detail(shift.database_id,actor);
    for(const mode of ['single','group']){
      const before=await snapshot(),created=await create(mode==='single'?[10]:[10,10]),ids=created.transactions.map(r=>r.id),key=randomUUID();
      const updates=ids.map(id=>({id,data:updateTransactionSchema.parse({entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount:20,rates,settlement:settlement(20)})}));
      const editVersion=(await transactions.detail(ids[0],actor)).editVersion;
      const edit=()=>mode==='single'?transactions.update(ids[0],{...updates[0].data,requestId:key,expectedVersion:editVersion},actor):transactions.updateGroup(ids[0],{requestId:key,expectedVersion:editVersion,updates,voidIds:[],preferential:false},actor);
      const results=await Promise.all([edit(),edit()]);assert.deepEqual(results[0],results[1]);
      assert.equal((await snapshot()).expectedCash.NIO,before.expectedCash.NIO+20*ids.length);
      assert.equal((await db.query('select count(*)::int as n from temo.solicitudes_financieras where id_solicitud=$1',[key])).rows[0].n,1);
      const raceVersion=(await transactions.detail(ids[0],actor)).editVersion;
      const race=await Promise.allSettled([30,40].map(amount=>{
        const requestId=randomUUID(),data=updateTransactionSchema.parse({entityCode:'BAC',movementCode:'DC',currencyCode:'NIO',amount,rates,settlement:settlement(amount)});
        return mode==='single'?transactions.update(ids[0],{...data,requestId,expectedVersion:raceVersion},actor)
          :transactions.updateGroup(ids[0],{requestId,expectedVersion:raceVersion,updates:ids.map(id=>({id,data})),voidIds:[],preferential:false},actor);
      }));
      assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected').length,1);
      assert.equal(race.find(r=>r.status==='rejected').reason.getResponse().code,'TRA-VER-409');
      const winnerAmount=race[0].status==='fulfilled'?30:40;
      assert.equal((await snapshot()).expectedCash.NIO,before.expectedCash.NIO+winnerAmount*ids.length);
      const annulKey=randomUUID();
      const annulVersion=(await transactions.detail(ids[0],actor)).editVersion;
      const annul=()=>mode==='single'?transactions.void(ids[0],actor,undefined,annulKey,annulVersion):transactions.updateGroup(ids[0],{requestId:annulKey,expectedVersion:annulVersion,updates:[],voidIds:ids,preferential:false},actor);
      const voids=await Promise.all([annul(),annul()]);assert.deepEqual(voids[0],voids[1]);
      const after=await snapshot();assert.equal(after.expectedCash.NIO,before.expectedCash.NIO);
      assert.deepEqual(normalizedCounts(after.cashCounts),normalizedCounts(before.cashCounts));
    }
    const id=(await create([10])).transactions[0].id,before=await snapshot();
    const distinct=await Promise.allSettled([transactions.void(id,actor,undefined,randomUUID()),transactions.void(id,actor,undefined,randomUUID())]);
    assert.equal(distinct.filter(r=>r.status==='fulfilled').length,1);assert.equal(distinct.filter(r=>r.status==='rejected').length,1);
    assert.equal((await snapshot()).expectedCash.NIO,before.expectedCash.NIO-10);
  }finally{
    if(branch)await connection.transaction(async c=>{
      const shifts=(await c.query('select id_turno from temo.turnos where id_sucursal=$1',[branch])).rows.map(r=>r.id_turno);
      const transactions=(await c.query('select id_transaccion from temo.transacciones where id_sucursal=$1',[branch])).rows.map(r=>r.id_transaccion);
      const groups=(await c.query('select id_grupo_transacciones from temo.grupos_transacciones where id_turno=any($1::uuid[])',[shifts])).rows.map(r=>r.id_grupo_transacciones);
      await c.query('delete from temo.bitacora where id_registro=any($1::uuid[]) or id_usuario=$2',[[...shifts,...transactions,...groups],actor?.id??null]);
      await c.query('delete from temo.notificaciones_usuarios where id_turno=any($1::uuid[])',[shifts]);
      await c.query('delete from temo.movimientos_efectivo where id_turno=any($1::uuid[])',[shifts]);
      await c.query('delete from temo.movimientos_cuentas where id_transaccion=any($1::uuid[])',[transactions]);
      await c.query('delete from temo.transacciones where id_transaccion=any($1::uuid[])',[transactions]);
      await c.query('delete from temo.grupos_transacciones where id_grupo_transacciones=any($1::uuid[])',[groups]);
      await c.query('delete from temo.turnos where id_sucursal=$1',[branch]);
      await c.query('delete from temo.jornadas where id_sucursal=$1',[branch]);await c.query('delete from temo.cajas where id_sucursal=$1',[branch]);
      await c.query('delete from temo.usuarios_sucursales where id_sucursal=$1',[branch]);await c.query('delete from temo.cuentas_sucursales where id_sucursal=$1',[branch]);
      await c.query('delete from temo.sucursales where id_sucursal=$1',[branch]);
      if(actor)await c.query('delete from temo.usuarios where id_usuario=$1',[actor.id]);
    });
    await connection.query(`drop schema if exists ${schema} cascade`);await connection.onModuleDestroy();
  }
});
