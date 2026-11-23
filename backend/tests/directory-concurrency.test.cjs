const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{readFileSync}=require('node:fs'),{Client}=require('pg');
const {DirectoryService}=require('../dist/modules/directory/directory.service');
const {directoryEntrySchema}=require('../dist/modules/directory/directory.schema');
test('directory concurrency: real connections, isolated schema, one effect and stale-writer rejection',{skip:!process.env.TEMO_TEST_PREVIEW},async()=>{
 const schema='qa_directory_'+randomUUID().replaceAll('-','');assert.match(schema,/^qa_directory_[a-f0-9]{32}$/);
 const options={connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',statement_timeout:15000};
 const setup=new Client(options),a=new Client(options),b=new Client(options);let created=false;
 await setup.connect();
 try{
  await setup.query(`create schema ${schema}`);created=true;
  await setup.query(`create table ${schema}.roles(id_rol uuid primary key,codigo text,estado text);
   create table ${schema}.usuarios(id_usuario uuid primary key,id_rol uuid,estado text,debe_cambiar_contrasena boolean,version_sesion integer);
   create table ${schema}.monedas(id_moneda uuid primary key,codigo text);
   create table ${schema}.directorio_destinatarios(id_destinatario uuid primary key default gen_random_uuid(),codigo_destinatario bigserial,nombre text,observaciones text,estado text,id_usuario_creacion uuid,id_usuario_modificacion uuid,fecha_modificacion timestamptz);
   create table ${schema}.directorio_identificadores(id_destinatario uuid,institucion text,tipo text,numero text,id_moneda uuid,orden integer,fecha_creacion timestamptz default now());
   create table ${schema}.directorio_cedulas(id_destinatario uuid,numero text,titular text,orden integer);
   create table ${schema}.directorio_referencias(id_destinatario uuid,referencia text,orden integer);
   create table ${schema}.directorio_fuentes_importacion(id_destinatario uuid,hoja text,fila integer);
   create table ${schema}.bitacora(id_usuario uuid,accion text,tabla text,id_registro uuid,datos_anteriores jsonb,datos_nuevos jsonb);`);
  for(const file of ['049_financial_request_receipts.sql','056_directory_request_receipts.sql'])await setup.query(readFileSync('database/init/'+file,'utf8').replaceAll('temo.',schema+'.'));
  const actor={id:randomUUID(),roleCode:'CAJERO',sessionVersion:1},other={...actor,id:randomUUID()},role=randomUUID();
  await setup.query(`insert into ${schema}.roles values($1,'CAJERO','ACTIVO')`,[role]);
  for(const user of [actor,other])await setup.query(`insert into ${schema}.usuarios values($1,$2,'ACTIVO',false,1)`,[user.id,role]);
  await a.connect();await b.connect();
  const service=connection=>new DirectoryService({query:(sql,args)=>connection.query(sql.replaceAll('temo.',schema+'.'),args),transaction:async work=>{
   await connection.query('begin');try{const r=await work({query:(sql,args)=>connection.query(sql.replaceAll('temo.',schema+'.'),args)});await connection.query('commit');return r;}catch(e){await connection.query('rollback');throw e;}
  }});
  const first=service(a),second=service(b),input=directoryEntrySchema.parse({requestId:randomUUID(),name:'Concurrent QA',references:['REFERENCE']});
  const pair=await Promise.all([first.create(input,actor),second.create({...input,requestId:input.requestId.toUpperCase()},actor)]);
  assert.deepEqual(pair[0],pair[1]);assert.equal((await setup.query(`select count(*)::int n from ${schema}.directorio_destinatarios`)).rows[0].n,1);
  assert.equal((await setup.query(`select count(*)::int n from ${schema}.bitacora`)).rows[0].n,1);
  const id=pair[0].database_id,edit={...input,requestId:randomUUID(),name:'WINNER',expectedVersion:pair[0].edit_version};
  const replayed=await Promise.all([first.update(id,edit,actor),second.update(id,edit,actor)]);assert.deepEqual(replayed[0],replayed[1]);
  const competing=await Promise.allSettled([
   first.update(id,{...edit,requestId:randomUUID(),name:'ONE',expectedVersion:replayed[0].edit_version},actor),
   second.update(id,{...edit,requestId:randomUUID(),name:'TWO',expectedVersion:replayed[0].edit_version},other)]);
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(competing.find(r=>r.status==='rejected').reason.getStatus(),409);
  assert.equal((await setup.query(`select count(*)::int n from ${schema}.bitacora`)).rows[0].n,3);
  const changed=await Promise.allSettled([first.create({...input,requestId:randomUUID()},actor),second.create({...input,name:'DIFFERENT BODY'},actor)]);
  assert.equal(changed[0].status,'fulfilled');assert.equal(changed[1].reason.getStatus(),409);
  const independent=await second.create(input,other);assert.notEqual(independent.database_id,id,'same UUID under another identity never returns somebody else\'s receipt');
  await setup.query(`update ${schema}.usuarios set version_sesion=2 where id_usuario=$1`,[actor.id]);
  await assert.rejects(first.create(input,actor),e=>e.getStatus()===403);
 }finally{await a.end();await b.end();if(created)await setup.query(`drop schema ${schema} cascade`);await setup.end();}
});
