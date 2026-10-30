const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {authorizedExport,recordAuthorizedExport,recordRequestedExport}=require('../dist/common/export-selection');
const denied=error=>error.getStatus()===403;

test('exports reject missing or malformed session versions before SQL',async()=>{
  let queries=0;
  const db={query:async()=>{queries++;return {rowCount:1};}};
  for(const version of [undefined,null,'1',NaN,Infinity,-1,1.5,2147483648]){
    await assert.rejects(recordAuthorizedExport(db,{user:{id:randomUUID(),roleCode:'JEFA',sessionVersion:version}},'Usuarios','PDF',1),denied);
  }
  await assert.rejects(recordAuthorizedExport(db,{user:{id:randomUUID(),roleCode:'JEFA',sessionVersion:1,mustChangePassword:true}},'Usuarios','PDF',1),denied);
  assert.equal(queries,0);
});

test('preview: export handoff revalidates identity atomically with its audit',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
  const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview'});
  await c.connect();await c.query('begin');
  try{
    if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
    const actors={};
    for(const roleCode of ['JEFA','CAJERO','TRANSFERISTA']){
      const actor=(await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
        select id_rol,'Export','QA',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo=$2
        returning id_usuario as id,version_sesion as "sessionVersion"`,['export_'+randomUUID().replaceAll('-',''),roleCode])).rows[0];
      actors[roleCode]={...actor,roleCode};
    }
    const auditCount=async()=>(await c.query("select count(*)::int as n from temo.bitacora where id_usuario=any($1::uuid[])",[Object.values(actors).map(row=>row.id)])).rows[0].n;
    const rows=[{id:randomUUID(),name:'private payload sentinel'}],input={format:'PDF',ids:[rows[0].id]};
    const exportRows=actor=>authorizedExport(c,{user:actor,ip:'::ffff:127.0.0.1'},'Transacciones',input,rows,row=>row.id);
    await t.test('current administrator/cashier can export; other roles and role forgery fail',async()=>{
      assert.deepEqual(await exportRows(actors.JEFA),rows);
      assert.deepEqual(await exportRows(actors.CAJERO),rows);
      const count=await auditCount();
      await assert.rejects(exportRows(actors.TRANSFERISTA),denied);
      await assert.rejects(exportRows({...actors.CAJERO,roleCode:'JEFA'}),denied);
      await assert.rejects(recordAuthorizedExport(c,{user:actors.CAJERO},'Usuarios','PDF',1),denied);
      assert.equal(await auditCount(),count);
    });
    await t.test('revocation after rows were read blocks delivery and creates no success audit',async()=>{
      const actor=actors.CAJERO,count=await auditCount();
      await c.query('update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1',[actor.id]);
      await assert.rejects(exportRows(actor),denied);
      await assert.rejects(recordRequestedExport(c,{user:actor},'Turnos','EXCEL',1),denied);
      assert.equal(await auditCount(),count);
      await c.query('update temo.usuarios set version_sesion=$2 where id_usuario=$1',[actor.id,actor.sessionVersion]);
    });
    await t.test('disabled accounts, disabled roles and mandatory password changes fail at handoff',async()=>{
      const actor=actors.JEFA,count=await auditCount();
      await c.query("update temo.usuarios set estado='INACTIVO' where id_usuario=$1",[actor.id]);
      await assert.rejects(exportRows(actor),denied);
      await c.query("update temo.usuarios set estado='ACTIVO',debe_cambiar_contrasena=true where id_usuario=$1",[actor.id]);
      await assert.rejects(exportRows(actor),denied);
      await c.query('update temo.usuarios set debe_cambiar_contrasena=false where id_usuario=$1',[actor.id]);
      await c.query("update temo.roles set estado='INACTIVO' where codigo='JEFA'");
      try{await assert.rejects(exportRows(actor),denied);}finally{await c.query("update temo.roles set estado='ACTIVO' where codigo='JEFA'");}
      assert.equal(await auditCount(),count);
    });
    await t.test('audits record verified vs declared counts without row contents or secrets',async()=>{
      await recordRequestedExport(c,{user:actors.JEFA},'Usuarios','PDF',7);
      await recordAuthorizedExport(c,{user:actors.JEFA},'Grafica de transacciones','PNG',31);
      const events=(await c.query('select datos_nuevos from temo.bitacora where id_usuario=$1 order by numero_auditoria',[actors.JEFA.id])).rows;
      assert.ok(events.some(row=>row.datos_nuevos.filas_declaradas===7));
      assert.ok(events.some(row=>row.datos_nuevos.filas_verificadas===31));
      assert.ok(!JSON.stringify(events).includes('private payload sentinel'));
      assert.ok(!JSON.stringify(events).includes('not-a-login-credential'));
    });
  }finally{await c.query('rollback');await c.end();}
});
