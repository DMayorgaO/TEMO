const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {DirectoryService}=require('../dist/modules/directory/directory.service');
const {directoryEntrySchema,directoryUpdateSchema}=require('../dist/modules/directory/directory.schema');
const {auditChanges}=require('../dist/modules/catalogs/audit-changes');
const forbidden=error=>error.getStatus()===403;

test('directory writes revalidate current identity and audit safely with atomic rollback',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
  const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,public,extensions'});
  await c.connect();await c.query('begin');let sequence=0,failAudit=false;
  const query=(sql,args)=>{if(failAudit&&sql.includes('insert into temo.bitacora'))throw new Error('audit unavailable');return c.query(sql,args);};
  const db={query,transaction:async work=>{
    const save='directory_security_'+(++sequence);await c.query('savepoint '+save);
    try{const result=await work({query});await c.query('release savepoint '+save);return result;}
    catch(error){await c.query('rollback to savepoint '+save);await c.query('release savepoint '+save);throw error;}
  }};
  const directory=new DirectoryService(db);
  const update=async(id,input,actor)=>directory.update(id,{...input,expectedVersion:(await directory.detail(id)).edit_version},actor);
  try{
    if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
    const actors={};
    for(const roleCode of ['JEFA','CAJERO','TRANSFERISTA']){
      const actor=(await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
        select id_rol,'Directory','QA',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo=$2
        returning id_usuario as id,version_sesion as "sessionVersion"`,['directory_'+randomUUID().replaceAll('-',''),roleCode])).rows[0];
      actors[roleCode]={...actor,roleCode};
    }
    const input=directoryEntrySchema.parse({name:'Persona QA',observations:'private notes sentinel',identifiers:[{institution:'QA Bank',type:'Cuenta',number:'1234567890123456',currency:'NIO'}],identities:[{number:'001-010101-0001A',holder:'Persona sensible'}],references:['private reference sentinel']});
    const entry=await directory.create(input,actors.CAJERO);
    await t.test('missing and malformed versions cannot create, edit or deactivate directory entries',async()=>{
      const before=await directory.detail(entry.database_id);
      for(const sessionVersion of [undefined,null,'1',-1,0.5,2147483648]){
        const actor={...actors.CAJERO,sessionVersion};
        await assert.rejects(directory.create(input,actor),forbidden);
        await assert.rejects(directory.update(entry.database_id,{...input,status:'INACTIVO',expectedVersion:before.edit_version},actor),forbidden);
      }
      assert.deepEqual(await directory.detail(entry.database_id),before);
    });
    await t.test('edits require a valid snapshot version and list/detail versions agree',async()=>{
      const detail=await directory.detail(entry.database_id);
      assert.match(detail.edit_version,/^[a-f0-9]{64}$/);
      assert.equal((await directory.list()).find(row=>row.database_id===entry.database_id).edit_version,detail.edit_version);
      assert.equal(directoryUpdateSchema.safeParse(input).success,false);
      assert.equal(directoryUpdateSchema.safeParse({...input,expectedVersion:'bad'}).success,false);
      assert.equal(directoryUpdateSchema.safeParse({...input,expectedVersion:detail.edit_version}).success,true);
      await assert.rejects(directory.update(entry.database_id,input,actors.CAJERO),error=>error.getStatus()===400);
    });
    await t.test('an old edit or deactivation cannot overwrite a newer saved snapshot or add audit',async()=>{
      const old=await directory.detail(entry.database_id);
      const latest=await directory.update(entry.database_id,{...input,name:'Winner QA',expectedVersion:old.edit_version},actors.JEFA);
      assert.notEqual(latest.edit_version,old.edit_version);
      const auditCount=async()=>(await c.query("select count(*)::int as n from temo.bitacora where tabla='directorio_destinatarios' and id_registro=$1",[entry.database_id])).rows[0].n;
      const before=await auditCount();
      for(const status of ['ACTIVO','INACTIVO'])await assert.rejects(directory.update(entry.database_id,{...input,status,expectedVersion:old.edit_version},actors.CAJERO),error=>error.getStatus()===409);
      assert.deepEqual(await directory.detail(entry.database_id),latest);
      assert.equal(await auditCount(),before);
    });
    await t.test('changes to child numbers are versioned even without touching the parent timestamp',async()=>{
      const old=await directory.detail(entry.database_id);
      await c.query("update temo.directorio_identificadores set numero='5555-5555-5555-5555' where id_destinatario=$1",[entry.database_id]);
      assert.notEqual((await directory.detail(entry.database_id)).edit_version,old.edit_version);
      await assert.rejects(directory.update(entry.database_id,{...input,expectedVersion:old.edit_version},actors.JEFA),error=>error.getStatus()===409);
      await update(entry.database_id,input,actors.JEFA);
    });
    await t.test('administrator and cashier remain allowed; transfer operator and forged role are rejected',async()=>{
      await update(entry.database_id,{...input,name:'QA updated'},actors.JEFA);
      await update(entry.database_id,input,actors.CAJERO);
      await assert.rejects(directory.create(input,actors.TRANSFERISTA),forbidden);
      await assert.rejects(update(entry.database_id,input,{...actors.CAJERO,roleCode:'JEFA'}),forbidden);
    });
    await t.test('stale session, disabled user and mandatory password change cannot write',async()=>{
      const actor=actors.CAJERO;
      await assert.rejects(directory.create(input,{...actor,mustChangePassword:true}),forbidden);
      await c.query('update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1',[actor.id]);
      await assert.rejects(update(entry.database_id,input,actor),forbidden);
      await c.query("update temo.usuarios set version_sesion=$2,estado='INACTIVO' where id_usuario=$1",[actor.id,actor.sessionVersion]);
      await assert.rejects(directory.create(input,actor),forbidden);
      await c.query("update temo.usuarios set estado='ACTIVO',debe_cambiar_contrasena=true where id_usuario=$1",[actor.id]);
      await assert.rejects(update(entry.database_id,input,actor),forbidden);
      await c.query('update temo.usuarios set debe_cambiar_contrasena=false where id_usuario=$1',[actor.id]);
    });
    await t.test('audit records detect sensitive changes without storing numbers, holders or free text',async()=>{
      const modified={...input,identifiers:[{...input.identifiers[0],number:'9999567890123456'}],observations:'another private note'};
      await update(entry.database_id,modified,actors.CAJERO);
      const audit=(await c.query("select datos_anteriores,datos_nuevos from temo.bitacora where tabla='directorio_destinatarios' and id_registro=$1 order by numero_auditoria desc limit 1",[entry.database_id])).rows[0];
      assert.equal(audit.datos_nuevos.identifiers_changed,true,'Changing digits while keeping the same final digits is still detected');
      assert.equal(audit.datos_nuevos.observations_changed,true);
      assert.equal(audit.datos_nuevos.identificadores,1);assert.equal(audit.datos_nuevos.cedulas,1);
      const serialized=JSON.stringify(audit);
      for(const secret of ['1234567890123456','9999567890123456','001-010101-0001A','Persona sensible','private notes sentinel','another private note','private reference sentinel','not-a-login-credential'])assert.ok(!serialized.includes(secret));
      const changes=auditChanges('directorio_destinatarios',audit.datos_anteriores,audit.datos_nuevos).changes;
      assert.ok(changes.some(row=>row.field==='Identificadores modificados'));
    });
    await t.test('a role disabled after login cannot create or update directory entries',async()=>{
      const actor=actors.CAJERO;
      await c.query("update temo.roles set estado='INACTIVO' where codigo='CAJERO'");
      try{
        await assert.rejects(directory.create(input,actor),forbidden);
        await assert.rejects(update(entry.database_id,input,actor),forbidden);
      }finally{await c.query("update temo.roles set estado='ACTIVO' where codigo='CAJERO'");}
    });
    await t.test('audit failure restores parent and children; failed creation leaves no partial entry',async()=>{
      const before=await directory.detail(entry.database_id);
      const count=async()=>(await c.query('select count(*)::int as n from temo.directorio_destinatarios')).rows[0].n;
      const beforeCount=await count();failAudit=true;
      try{
        await assert.rejects(update(entry.database_id,{...input,name:'Must roll back',identifiers:[],identities:[],references:['new']},actors.JEFA));
        await assert.rejects(directory.create({...input,name:'Must not persist'},actors.CAJERO));
      }finally{failAudit=false;}
      assert.deepEqual(await directory.detail(entry.database_id),before);assert.equal(await count(),beforeCount);
    });
    await t.test('deactivation is audited as cancellation and nonexistent entry does not create audit',async()=>{
      await update(entry.database_id,{...input,status:'INACTIVO'},actors.JEFA);
      const latest=(await c.query("select accion from temo.bitacora where tabla='directorio_destinatarios' and id_registro=$1 order by numero_auditoria desc limit 1",[entry.database_id])).rows[0];
      assert.equal(latest.accion,'ANULAR');
      const missing=randomUUID();await assert.rejects(update(missing,input,actors.JEFA),error=>error.getStatus()===404);
      assert.equal((await c.query("select count(*)::int as n from temo.bitacora where id_registro=$1",[missing])).rows[0].n,0);
    });
  }finally{await c.query('rollback');await c.end();}
});
