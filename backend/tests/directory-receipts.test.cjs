const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Client}=require('pg');
const {DirectoryService}=require('../dist/modules/directory/directory.service');
const {directoryEntrySchema}=require('../dist/modules/directory/directory.schema');
const status=n=>error=>error.getStatus?.()===n;
test('directory receipts preserve identity, privacy, versions and atomicity in local preview',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
 const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,public,extensions'});
 await c.connect();await c.query('begin');let n=0,failAudit=false,failReceipt=false;
 const query=(sql,args)=>{if(failAudit&&sql.includes('insert into temo.bitacora'))throw Error('audit unavailable');if(failReceipt&&sql.includes('insert into temo.solicitudes_financieras'))throw Error('receipt unavailable');return c.query(sql,args);};
 const db={query,transaction:async work=>{const save='directory_receipt_'+(++n);await c.query('savepoint '+save);try{const r=await work({query});await c.query('release savepoint '+save);return r;}catch(e){await c.query('rollback to savepoint '+save);await c.query('release savepoint '+save);throw e;}}};
 try{
  if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
  const actor=(await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
    select id_rol,'Directory','Receipt',$1,'not-a-login','ACTIVO',false from temo.roles where codigo='CAJERO' returning id_usuario as id,version_sesion as "sessionVersion"`,['receipt_'+randomUUID()])).rows[0];actor.roleCode='CAJERO';
  const service=new DirectoryService(db),input=directoryEntrySchema.parse({requestId:randomUUID(),name:'QA RECEIPT',observations:'PRIVATE NOTE SENTINEL',identifiers:[{type:'Cuenta',number:'7777888899990000'}],identities:[{number:'001-010101-0001A',holder:'PRIVATE HOLDER'}],references:['PRIVATE REFERENCE']});
  const count=async()=>({entries:(await c.query('select count(*)::int n from temo.directorio_destinatarios where id_usuario_creacion=$1',[actor.id])).rows[0].n,
   audits:(await c.query("select count(*)::int n from temo.bitacora where id_usuario=$1 and tabla='directorio_destinatarios'",[actor.id])).rows[0].n,
   receipts:(await c.query('select count(*)::int n from temo.solicitudes_financieras where id_usuario=$1',[actor.id])).rows[0].n});
  const saved=await service.create(input,actor);
  await t.test('create replay after lost response writes once and stores no directory contents',async()=>{
   assert.deepEqual(await service.create({...input,requestId:input.requestId.toUpperCase()},actor),saved);
   assert.deepEqual(await count(),{entries:1,audits:1,receipts:1});
   const receipt=(await c.query('select resultado,huella from temo.solicitudes_financieras where id_usuario=$1',[actor.id])).rows[0];
   assert.deepEqual(receipt.resultado,{id:saved.database_id});assert.match(receipt.huella,/^[a-f0-9]{64}$/);
   const audit=JSON.stringify((await c.query('select datos_anteriores,datos_nuevos from temo.bitacora where id_usuario=$1',[actor.id])).rows);
   for(const sentinel of ['7777888899990000','PRIVATE NOTE','PRIVATE HOLDER','PRIVATE REFERENCE','001-010101-0001A'])assert.ok(!audit.includes(sentinel));
  });
  await t.test('missing or malformed references and altered bodies cannot create more records',async()=>{
   const before=await count();
   for(const requestId of [undefined,null,'',123,[],{},'not-a-uuid'])await assert.rejects(service.create({...input,requestId},actor),status(400));
   await assert.rejects(service.create({...input,name:'DIFFERENT'},actor),status(409));assert.deepEqual(await count(),before);
  });
  const edit={...input,requestId:randomUUID(),expectedVersion:saved.edit_version,name:'UPDATED QA'};
  const edited=await service.update(saved.database_id,edit,actor);
  await t.test('edit replay bypasses its consumed version but does not duplicate audit or children',async()=>{
   const before=await count();assert.deepEqual(await service.update(saved.database_id,edit,actor),edited);assert.deepEqual(await count(),before);
   assert.equal(edited.identifiers.length,1);assert.equal(edited.identities.length,1);
   await assert.rejects(service.update(saved.database_id,{...edit,requestId:randomUUID()},actor),status(409));assert.deepEqual(await count(),before);
  });
  await t.test('replaying an old create returns current authorized data without restoring an old snapshot',async()=>{
   const before=await count();assert.deepEqual(await service.create(input,actor),edited);assert.deepEqual(await count(),before);
  });
  await t.test('reusing an edit reference for a different record or payload is rejected',async()=>{
   const before=await count();await assert.rejects(service.update(randomUUID(),edit,actor),status(409));
   await assert.rejects(service.update(saved.database_id,{...edit,status:'INACTIVO'},actor),status(409));assert.deepEqual(await count(),before);
  });
  await t.test('replays revalidate session, active user, password requirement and role',async()=>{
   const before=await count();
   for(const extra of [{sessionVersion:undefined},{sessionVersion:'1'},{sessionVersion:actor.sessionVersion+1},{mustChangePassword:true},{roleCode:'TRANSFERISTA'},{roleCode:'JEFA'}])await assert.rejects(service.create(input,{...actor,...extra}),status(403));
   for(const change of ["estado='INACTIVO'","debe_cambiar_contrasena=true"]){await c.query(`update temo.usuarios set ${change} where id_usuario=$1`,[actor.id]);await assert.rejects(service.create(input,actor),status(403));await c.query("update temo.usuarios set estado='ACTIVO',debe_cambiar_contrasena=false where id_usuario=$1",[actor.id]);}
   assert.deepEqual(await count(),before);
  });
  await t.test('audit or receipt failure rolls back the parent, children and success evidence',async()=>{
   for(const kind of ['audit','receipt']){
    const before=await count();failAudit=kind==='audit';failReceipt=kind==='receipt';
    await assert.rejects(service.create({...input,requestId:randomUUID()},actor),/unavailable/);
    await assert.rejects(service.update(saved.database_id,{...edit,requestId:randomUUID(),expectedVersion:edited.edit_version,name:'MUST ROLLBACK'},actor),/unavailable/);
    failAudit=false;failReceipt=false;assert.deepEqual(await count(),before);assert.deepEqual(await service.detail(saved.database_id),edited);
   }
  });
  await t.test('confirmed receipts remain immutable for the application role',async()=>{
   for(const sql of ['update temo.solicitudes_financieras set resultado=resultado where id_usuario=$1','delete from temo.solicitudes_financieras where id_usuario=$1']){
    await c.query('savepoint immutable_directory');await assert.rejects(c.query(sql,[actor.id]),e=>e.code==='23514');await c.query('rollback to savepoint immutable_directory');
   }
  });
  await t.test('deactivation replays once and does not reactivate on replay of an earlier create',async()=>{
   const inputVoid={...edit,requestId:randomUUID(),expectedVersion:edited.edit_version,status:'INACTIVO'};
   const result=await service.update(saved.database_id,inputVoid,actor),before=await count();assert.equal(result.status,'INACTIVO');
   assert.deepEqual(await service.update(saved.database_id,inputVoid,actor),result);assert.deepEqual(await service.create(input,actor),result);assert.deepEqual(await count(),before);
  });
 }finally{await c.query('rollback');await c.end();}
});
