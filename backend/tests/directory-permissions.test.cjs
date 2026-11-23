require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict'),{Module}=require('@nestjs/common'),{NestFactory,Reflector}=require('@nestjs/core');
const {DirectoryController}=require('../dist/modules/directory/directory.controller');
const {DirectoryService}=require('../dist/modules/directory/directory.service');
const {DirectoryRouteGuard}=require('../dist/modules/directory/directory-route.guard');
const {METHOD_METADATA}=require('@nestjs/common/constants');
const {AuthGuard}=require('../dist/modules/auth/auth.guard');
const id='11111111-1111-4111-8111-111111111111',reference='22222222-2222-4222-8222-222222222222';
test('HTTP directory permission matrix covers reads, writes, identifiers and strict input contracts',async()=>{
 let calls=0;const service={list:()=>{calls++;return[];},detail:()=>{calls++;return{database_id:id};},create:()=>{calls++;return{database_id:id};},update:()=>{calls++;return{database_id:id};}};
 class FixtureModule{}Module({controllers:[DirectoryController],providers:[{provide:DirectoryService,useValue:service}]})(FixtureModule);
 const app=await NestFactory.create(FixtureModule,{logger:false});app.setGlobalPrefix('api');
 app.useGlobalGuards(new AuthGuard(new Reflector(),{validateAccessToken:async token=>({id,roleCode:token.split('-')[0],sessionVersion:token.endsWith('-missing')?undefined:token.endsWith('-string')?'1':1,mustChangePassword:token.endsWith('-password')})}));
 try{await app.listen(0,'127.0.0.1');const url=await app.getUrl();
  assert.deepEqual(Object.getOwnPropertyNames(DirectoryController.prototype).filter(name=>Reflect.hasMetadata(METHOD_METADATA,DirectoryController.prototype[name])).sort(),['create','detail','list','update']);
  const input={requestId:reference,name:'QA Person',references:['QA']};
  const invoke=(method,path,role,body)=>fetch(url+'/api/directory'+path,{method,headers:{...(role?{authorization:'Bearer '+role}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  for(const role of [null,'JEFA','CAJERO','TRANSFERISTA','UNKNOWN','JEFA-password','CAJERO-password','JEFA-missing','CAJERO-string'])for(const [method,path,body] of [['GET',''],['GET','/'+id],['POST','',input],['PUT','/'+id,{...input,expectedVersion:'a'.repeat(64)}]]){
   const before=calls,response=await invoke(method,path,role,body);
   const allowed=method==='GET'?['JEFA','CAJERO','TRANSFERISTA'].includes(role):['JEFA','CAJERO'].includes(role);
   assert.equal(response.status,allowed?(method==='POST'?201:200):role?403:401,`${role} ${method} ${path}`);assert.equal(calls-before,allowed?1:0);
  }
  for(const path of ['/not-a-uuid','/'+id+'?includePrivate=true','?roleCode=JEFA','?ids[]=1','?limit=1&limit=2']){
   const before=calls;assert.equal((await invoke('GET',path,'CAJERO')).status,400);assert.equal(calls,before);
  }
  for(const [method,path,body] of [['POST','',input],['PUT','/'+id,{...input,expectedVersion:'a'.repeat(64)}]]){
   for(const query of ['roleCode=JEFA','userId='+id,'expectedVersion=ignored','limit=1&limit=2']){
    const before=calls;assert.equal((await invoke(method,path+'?'+query,'JEFA',body)).status,400);assert.equal(calls,before);
   }
  }
  for(const requestId of [undefined,null,[],123,'','bad']){
   const before=calls;assert.equal((await invoke('POST','','JEFA',{...input,requestId})).status,400);assert.equal(calls,before);
  }
  for(const payload of [{...input,id_usuario_creacion:id},{...input,identifiers:[{type:'Cuenta',number:'123',roleCode:'JEFA'}]}]){
   const before=calls;assert.equal((await invoke('POST','','CAJERO',payload)).status,400);assert.equal(calls,before);
  }
 }finally{await app.close();}
});

test('unreviewed directory routes and inherited policy names are denied',()=>{
 for(const name of ['unreviewed','constructor','toString']){
  const handler=Object.defineProperty(()=>{},'name',{value:name});
  const context={getHandler:()=>handler,switchToHttp:()=>({getRequest:()=>({user:{id,roleCode:'JEFA',sessionVersion:1}})})};
  assert.throws(()=>new DirectoryRouteGuard().canActivate(context),error=>error.getStatus()===403);
 }
});
