const test=require('node:test');
const assert=require('node:assert/strict');
const {directoryEntrySchema,directoryUpdateSchema}=require('../dist/modules/directory/directory.schema');
const {DirectoryController}=require('../dist/modules/directory/directory.controller');
const input={name:'  Persona QA  ',references:['Referencia QA']};
const version='a'.repeat(64);

test('directory strict contracts preserve normal inputs, defaults and required edit version',()=>{
  const created=directoryEntrySchema.parse(input);
  assert.equal(created.name,'Persona QA');
  assert.equal(created.status,'ACTIVO');
  assert.deepEqual(created.identifiers,[]);
  assert.deepEqual(created.identities,[]);
  assert.equal(created.observations,'');
  assert.equal(directoryUpdateSchema.parse({...input,expectedVersion:version}).expectedVersion,version);
  assert.equal(directoryUpdateSchema.safeParse(input).success,false);
  assert.equal(directoryEntrySchema.safeParse({...input,references:[]}).success,false);
});

test('directory rejects unexpected top-level ownership, audit and authorization fields',()=>{
  for(const key of ['id','database_id','id_usuario_creacion','roleCode','permissions','edit_version','sources','__proto__']){
    const payload=JSON.parse(JSON.stringify({...input,[key]:'not-accepted'}));
    assert.equal(directoryEntrySchema.safeParse(payload).success,false,key);
    assert.equal(directoryUpdateSchema.safeParse({...payload,expectedVersion:version}).success,false,key);
  }
  assert.equal(directoryEntrySchema.safeParse({...input,expectedVersion:version}).success,false);
});

test('directory rejects unexpected nested fields while accepting supported identifiers and identities',()=>{
  const supported={...input,identifiers:[{institution:'BAC',type:'Cuenta',number:'1234',currency:'NIO'}],identities:[{number:'001-010101-0001A',holder:'Persona QA'}]};
  assert.equal(directoryEntrySchema.safeParse(supported).success,true);
  for(const payload of [
    {...supported,identifiers:[{...supported.identifiers[0],id_cuenta:'not-accepted'}]},
    {...supported,identities:[{...supported.identities[0],id_usuario:'not-accepted'}]},
  ]){
    assert.equal(directoryEntrySchema.safeParse(payload).success,false);
    assert.equal(directoryUpdateSchema.safeParse({...payload,expectedVersion:version}).success,false);
  }
});

test('directory controller rejects invalid contracts before invoking a write service',()=>{
  const calls=[];
  const controller=new DirectoryController({create:(...args)=>{calls.push(args);return 'created';},update:(...args)=>{calls.push(args);return 'updated';}});
  const request={user:{id:'11111111-1111-4111-8111-111111111111',roleCode:'JEFA'}};
  assert.throws(()=>controller.create({...input,roleCode:'JEFA'},request),error=>error.getStatus()===400);
  assert.throws(()=>controller.update(request.user.id,{...input,expectedVersion:version,id_usuario_creacion:request.user.id},request),error=>error.getStatus()===400);
  assert.equal(calls.length,0);
  assert.equal(controller.create(input,request),'created');
  assert.equal(controller.update(request.user.id,{...input,expectedVersion:version},request),'updated');
  assert.equal(calls.length,2);
  assert.equal(calls[1][1].expectedVersion,version);
});
