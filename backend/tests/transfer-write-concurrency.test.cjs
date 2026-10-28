const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {ConfigService}=require('@nestjs/config');
const {DatabaseService}=require('../dist/modules/database/database.service');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {TransfersService}=require('../dist/modules/transfers/transfers.service');
const counts=n=>({NIO:[{denomination:100,piles25:0,loose:n}],USD:[]});

test('transfer edits and voids serialize financial effects, retain origin and protect closed shifts',{skip:!process.env.TEMO_TEST_PREVIEW},async()=>{
  const db=new DatabaseService(new ConfigService({DATABASE_URL:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',DATABASE_SSL:'false',APP_ENV:'development',DATABASE_POOL_MAX:4}));
  const shifts=new ShiftsService(db),transfers=new TransfersService(db),prefix='QA_TRF_'+randomUUID().replaceAll('-','').slice(0,12);
  let branch;const users=[];
  try{
    const admin=(await db.query(`select u.id_usuario as id,u.version_sesion as "sessionVersion",'JEFA' as "roleCode" from temo.usuarios u join temo.roles r using(id_rol) where r.codigo='JEFA' and u.estado='ACTIVO' and not u.debe_cambiar_contrasena limit 1`)).rows[0];
    branch=(await db.query(`insert into temo.sucursales(codigo,nombre,estado) values($1,$1,'ACTIVO') returning id_sucursal`,[prefix])).rows[0].id_sucursal;
    const sources=[];
    for(let i=0;i<2;i++){
      const actor=(await db.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
        select id_rol,'Concurrent','Transfer',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo='CAJERO'
        returning id_usuario as id,usuario as username,version_sesion as "sessionVersion",'CAJERO' as "roleCode"`,[prefix+'_'+i])).rows[0];
      users.push(actor);await db.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[actor.id,branch]);
      sources.push(await shifts.create({branchId:branch,branch:prefix,register:prefix+'_'+i,cashier:actor.username,counts:counts(10),balances:[],notes:'isolated concurrency fixture',prepared:false},admin));
    }
    const id=sources[0].database_id,actor=users[0];
    const input={shiftId:id,type:'EFECTIVO',direction:'EGRESO',currency:'NIO',amount:100,description:'concurrent fixture',cashLines:counts(1).NIO};
    const transfer=await transfers.create(input,actor);
    const revised={...input,amount:200,cashLines:counts(2).NIO};
    await Promise.all([transfers.update(transfer.database_id,revised,actor),transfers.update(transfer.database_id,revised,actor)]);
    const edited=await shifts.detail(id,actor);
    assert.equal(edited.cashCounts.ACTUAL.NIO.total,800);assert.equal(edited.expectedCash.NIO,800);
    const voids=await Promise.allSettled([transfers.void(transfer.database_id,'parallel void',actor),transfers.void(transfer.database_id,'parallel void',actor)]);
    assert.equal(voids.filter(row=>row.status==='fulfilled').length,1);assert.equal(voids.filter(row=>row.status==='rejected').length,1);
    assert.equal((await shifts.detail(id,actor)).cashCounts.ACTUAL.NIO.total,1000);
    assert.equal((await shifts.detail(id,actor)).expectedCash.NIO,1000);
    const another=await transfers.create(input,actor);
    const destinationBefore=await shifts.detail(sources[1].database_id,users[1]);
    await assert.rejects(transfers.update(another.database_id,{...input,shiftId:sources[1].database_id},admin),e=>e.getStatus()===403);
    assert.deepEqual((await shifts.detail(sources[1].database_id,users[1])).cashCounts,destinationBefore.cashCounts);
    await db.query(`update temo.turnos set estado='CERRADO' where id_turno=$1`,[id]);
    const closed=await shifts.detail(id,admin);
    await assert.rejects(transfers.update(another.database_id,input,admin),e=>e.getStatus()===409);
    await assert.rejects(transfers.void(another.database_id,'closed fixture',admin),e=>e.getStatus()===409);
    assert.deepEqual((await shifts.detail(id,admin)).cashCounts,closed.cashCounts);
    assert.equal((await shifts.detail(id,admin)).expectedCash.NIO,closed.expectedCash.NIO);
  }finally{
    if(branch)await db.transaction(async c=>{
      const ids=(await c.query('select id_turno from temo.turnos where id_sucursal=$1',[branch])).rows.map(row=>row.id_turno);
      const transferIds=(await c.query('select id_transferencia from temo.transferencias where id_turno=any($1::uuid[])',[ids])).rows.map(row=>row.id_transferencia);
      await c.query(`delete from temo.bitacora where (tabla='turnos' and id_registro=any($1::uuid[])) or (tabla='transferencias' and id_registro=any($2::uuid[]))`,[ids,transferIds]);
      await c.query('delete from temo.notificaciones_usuarios where id_turno=any($1::uuid[])',[ids]);
      await c.query('delete from temo.movimientos_efectivo where id_transferencia=any($1::uuid[])',[transferIds]);
      await c.query('delete from temo.movimientos_cuentas where id_transferencia=any($1::uuid[])',[transferIds]);
      await c.query('delete from temo.transferencias where id_transferencia=any($1::uuid[])',[transferIds]);
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
