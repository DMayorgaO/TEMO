const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {ConfigService}=require('@nestjs/config');
const {DatabaseService}=require('../dist/modules/database/database.service');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {HandoversService}=require('../dist/modules/shifts/handovers.service');

test('real concurrent connections reserve receiver and accept only once in isolated preview',{skip:!process.env.TEMO_TEST_PREVIEW},async()=>{
  const db=new DatabaseService(new ConfigService({DATABASE_URL:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',DATABASE_SSL:'false',APP_ENV:'development',DATABASE_POOL_MAX:4}));
  const shifts=new ShiftsService(db),handovers=new HandoversService(db,shifts);
  const prefix='HANDOVER_QA_'+randomUUID().replaceAll('-','').slice(0,16);
  let branch;const users=[];
  try{
    const admin=(await db.query(`select u.id_usuario as id,u.version_sesion as "sessionVersion",'JEFA' as "roleCode"
      from temo.usuarios u join temo.roles r using(id_rol) where r.codigo='JEFA' and r.estado='ACTIVO'
        and u.estado='ACTIVO' and not u.debe_cambiar_contrasena limit 1`)).rows[0];
    branch=(await db.query(`insert into temo.sucursales(codigo,nombre,estado) values($1,$1,'ACTIVO') returning id_sucursal`,[prefix])).rows[0].id_sucursal;
    for(let i=0;i<3;i++){
      const user=(await db.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
        select id_rol,'CONCURRENCY','QA',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo='CAJERO'
        returning id_usuario as id,usuario as username,version_sesion as "sessionVersion",'CAJERO' as "roleCode"`,[prefix+'_'+i])).rows[0];
      users.push(user);await db.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[user.id,branch]);
    }
    const sources=[];
    for(const user of users.slice(0,2))sources.push(await shifts.create({branchId:branch,branch:prefix,register:prefix+'_'+sources.length,cashier:user.username,counts:{NIO:[],USD:[]},balances:[],notes:'isolated concurrency fixture',prepared:false},admin));
    const payloads=await Promise.all(sources.map(async(source,i)=>{const preview=await handovers.preview(source.database_id,users[i]);return {requestId:randomUUID(),receiverId:users[2].id,expectedVersion:preview.version};}));
    const proposed=await Promise.allSettled(sources.map((source,i)=>handovers.propose(source.database_id,payloads[i],users[i])));
    assert.equal(proposed.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(proposed.filter(result=>result.status==='rejected').length,1);
    const winner=proposed.find(result=>result.status==='fulfilled').value;
    const accepted=await Promise.all([handovers.resolve(winner.id_traspaso,'accept',users[2]),handovers.resolve(winner.id_traspaso,'accept',users[2])]);
    assert.equal(accepted[0].id_turno_destino,accepted[1].id_turno_destino);
    assert.equal((await db.query(`select count(*)::int as n from temo.turnos where id_cajero=$1 and estado='ABIERTO'`,[users[2].id])).rows[0].n,1);
    const index=sources.findIndex(source=>source.database_id!==winner.id_turno_origen);
    const target=sources[index].database_id,cashBefore=(await shifts.detail(target,users[index])).cashCounts;
    let unlock,locked;
    const ready=new Promise(resolve=>{locked=resolve;}),release=new Promise(resolve=>{unlock=resolve;});
    const closing=db.transaction(async c=>{
      await c.query('select id_turno from temo.turnos where id_turno=$1 for update',[target]);
      await c.query(`insert into temo.solicitudes_cierre_turno(id_turno,id_usuario_solicitud,estado,bloquea_cambios)
        values($1,$2,'PENDIENTE',true)`,[target,users[index].id]);
      await c.query(`update temo.turnos set estado='PENDIENTE_APROBACION' where id_turno=$1`,[target]);
      locked();await release;
    });
    // A second connection starts a real cash write while the closure owns the shift lock.
    await Promise.race([ready,closing.then(()=>{throw new Error('Closure ended before acquiring its lock');})]);
    let finished=false;
    const writing=shifts.saveCashCount(target,{counts:{NIO:[{denomination:100,piles25:0,loose:1}],USD:[]},changeNio:0},users[index])
      .then(()=>{finished=true;return null;},error=>{finished=true;return error;});
    try{await new Promise(resolve=>setTimeout(resolve,50));assert.equal(finished,false);}
    finally{unlock();await closing;}
    const denied=await writing;
    assert.equal(denied?.getResponse().code,'TUR-SOL-409');
    assert.deepEqual((await shifts.detail(target,users[index])).cashCounts,cashBefore);
  }finally{
    if(branch)await db.transaction(async c=>{
      const ids=(await c.query('select id_turno from temo.turnos where id_sucursal=$1',[branch])).rows.map(row=>row.id_turno);
      const requests=(await c.query('select id_traspaso from temo.traspasos_turno where id_turno_origen=any($1::uuid[])',[ids])).rows.map(row=>row.id_traspaso);
      await c.query(`delete from temo.bitacora where (tabla='traspasos_turno' and id_registro=any($1::uuid[])) or (tabla='turnos' and id_registro=any($2::uuid[]))`,[requests,ids]);
      await c.query('delete from temo.traspasos_turno where id_turno_origen=any($1::uuid[])',[ids]);
      await c.query('delete from temo.notificaciones_usuarios where id_turno=any($1::uuid[])',[ids]);
      await c.query('delete from temo.solicitudes_cierre_turno where id_turno=any($1::uuid[])',[ids]);
      await c.query('delete from temo.turnos where id_sucursal=$1',[branch]);
      await c.query('delete from temo.jornadas where id_sucursal=$1',[branch]);
      await c.query('delete from temo.cajas where id_sucursal=$1',[branch]);
      await c.query('delete from temo.usuarios_sucursales where id_sucursal=$1',[branch]);
      await c.query('delete from temo.sucursales where id_sucursal=$1',[branch]);
      if(users.length)await c.query('delete from temo.usuarios where id_usuario=any($1::uuid[])',[users.map(user=>user.id)]);
    });
    await db.onModuleDestroy();
  }
});
