require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {Module,RequestMethod,UnauthorizedException}=require('@nestjs/common');
const {PATH_METADATA,METHOD_METADATA}=require('@nestjs/common/constants');
const {NestFactory,Reflector}=require('@nestjs/core');
const {AuthGuard}=require('../dist/modules/auth/auth.guard');
const {CatalogsController}=require('../dist/modules/catalogs/catalogs.controller');
const {CatalogsService}=require('../dist/modules/catalogs/catalogs.service');
const {DatabaseService}=require('../dist/modules/database/database.service');
const {CatalogsRouteGuard}=require('../dist/modules/catalogs/catalogs-route.guard');
const id='11111111-1111-4111-8111-111111111111';
const common=['operationalEntities','entidadesBancarias','currencies','monedas','cuentasBancarias','sucursales','movimientosBancarios'];
const administrative=['revokeSessions','exportRows','resetUserPassword','saveNew','saveExisting','roles','auditoria','auditCapture','auditDetail','usuarios','reglasComisiones'];
test('catalog HTTP matrix preserves operational readers and protects every administrative handler',async()=>{
 let calls=0;const resets=[];
 const service={save:()=>{calls++;return{id};},revokeUserSessions:()=>{calls++;return{id};},resetUserPassword:(...args)=>{calls++;resets.push(args);return{id};}};
 const query=async()=>{calls++;return{rowCount:1,rows:[{id,tabla:'usuarios',datos_anteriores:{},datos_nuevos:{}}]};};
 const db={query,transaction:work=>work({query})};
 class Fixture{}Module({controllers:[CatalogsController],providers:[{provide:CatalogsService,useValue:service},{provide:DatabaseService,useValue:db}]})(Fixture);
 const app=await NestFactory.create(Fixture,{logger:false});app.setGlobalPrefix('api');
 app.useGlobalGuards(new AuthGuard(new Reflector(),{validateAccessToken:async token=>{
  if(token==='REVOKED')throw new UnauthorizedException();
  return{id,roleCode:token.split('-')[0],sessionVersion:token.endsWith('-missing')?undefined:token.endsWith('-string')?'1':1,mustChangePassword:token.endsWith('-password')};
 }}));
 let checks=0;
 try{await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const send=(method,path,role,body)=>fetch(base+'/api/catalogs'+path,{method,headers:{...(role?{authorization:'Bearer '+role}:{}),'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body??{})})});
  const names=Object.getOwnPropertyNames(CatalogsController.prototype).filter(n=>Reflect.hasMetadata(METHOD_METADATA,CatalogsController.prototype[n]));
  assert.deepEqual([...names].sort(),[...common,...administrative,'auditExport'].sort());assert.equal(names.length,19);
  for(const name of names){
   const fn=CatalogsController.prototype[name],method=RequestMethod[Reflect.getMetadata(METHOD_METADATA,fn)],path='/'+Reflect.getMetadata(PATH_METADATA,fn).replace(':id',id).replace(':resource','banks');
   const body=name==='resetUserPassword'?{temporaryPassword:'TemporaryPassword123!'}:name==='exportRows'?{format:'EXCEL',ids:[]}:name==='auditExport'?{section:'Turnos',format:'EXCEL',rows:0}:{};
   const allowed=common.includes(name)?['JEFA','CAJERO','TRANSFERISTA']:name==='auditExport'?['JEFA','CAJERO']:['JEFA'];
   for(const role of [null,'REVOKED','UNKNOWN','JEFA-password','CAJERO-password','JEFA-missing','CAJERO-string','JEFA','CAJERO','TRANSFERISTA']){
    const before=calls,response=await send(method,path,role,body);checks++;
    assert.equal(response.status,allowed.includes(role)?(method==='POST'?201:200):(!role||role==='REVOKED'?401:403),`${role} ${path}: ${await response.text()}`);
    if(!allowed.includes(role))assert.equal(calls,before);
   }
   for(const suffix of ['?userId='+id,'?branchId='+id,'?limit=1&limit=2']){
    const before=calls;assert.equal((await send(method,path+suffix,'JEFA',body)).status,400);assert.equal(calls,before);checks++;
   }
   if(path.includes(id)){
    const before=calls;assert.equal((await send(method,path.replace(id,'bad-id'),'JEFA',body)).status,400);assert.equal(calls,before);checks++;
   }
  }
  for(const value of [null,[],{},123,true,'short','private-secret-marker','A1'+ 'ñ'.repeat(36)]){
   const before=calls,response=await send('POST',`/usuarios/${id}/reset-password`,'JEFA',{temporaryPassword:value});
   assert.equal(response.status,400);assert.equal(calls,before);assert.ok(!(await response.text()).includes('private-secret-marker'));
  }
  for(const body of [{temporaryPassword:'TemporaryPassword123!',userId:id},[],{password:'TemporaryPassword123!'}]){
   const before=calls;assert.equal((await send('POST',`/usuarios/${id}/reset-password`,'JEFA',body)).status,400);assert.equal(calls,before);
  }
  for(const body of [{userId:id},[],{version:123}]){
   const before=calls;assert.equal((await send('POST',`/usuarios/${id}/revoke-sessions`,'JEFA',body)).status,400);assert.equal(calls,before);
  }
  const password=' TemporaryPassword123! ';
  assert.equal((await send('POST',`/usuarios/${id}/reset-password`,'JEFA',{temporaryPassword:password})).status,201);
  assert.equal(resets.at(-1)[1],password);assert.equal(resets.at(-1)[2].id,id);
  for(const section of ['Usuarios','Auditoria','Roles']){
   const before=calls;assert.equal((await send('POST','/auditoria/exportaciones','CAJERO',{section,format:'EXCEL',rows:0})).status,403);assert.equal(calls,before);
  }
  for(const resource of ['__proto__','constructor','unknown']){
   const before=calls;assert.equal((await send('POST','/export/'+resource,'JEFA',{format:'EXCEL',ids:[]})).status,400);assert.equal(calls,before);
  }
  console.log(`Catalog HTTP matrix: 19 handlers, ${checks} role/query/UUID cases plus credential, export and actor checks.`);
 }finally{await app.close();}
});
test('new catalog handlers fail closed until explicitly reviewed',()=>{
 const context={getHandler:()=>function unreviewed(){},switchToHttp:()=>({getRequest:()=>({user:{id,roleCode:'JEFA',sessionVersion:1}})})};
 assert.throws(()=>new CatalogsRouteGuard().canActivate(context),e=>e.getStatus()===403);
});
