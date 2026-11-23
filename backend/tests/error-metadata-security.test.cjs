const test=require('node:test'),assert=require('node:assert/strict');
const {HttpException,ConflictException}=require('@nestjs/common');
const {AppExceptionFilter}=require('../dist/common/errors/app-exception.filter');
const {catalogPostgresError}=require('../dist/common/errors/error-catalog');
function capture(error){
 const logs=[];let body,status;
 const filter=new AppExceptionFilter();filter.logger={error:value=>logs.push(JSON.parse(value))};
 const response={status:value=>{status=value;return response;},json:value=>{body=value;}};
 filter.catch(error,{switchToHttp:()=>({getRequest:()=>({method:'POST',route:{path:'/api/transactions/:id'},body:{password:'private-marker'},headers:{authorization:'private-marker'},query:{secret:'private-marker'}}),getResponse:()=>response})});
 return {body,status,logs};
}
test('internal errors never copy arbitrary code, message, stack, SQL or credentials into response/log',()=>{
 for(const error of [Object.assign(Error('private-marker'),{code:'postgres://private-marker',detail:'private-marker',query:'private-marker'}),new HttpException({code:{secret:'private-marker'},message:'private-marker'},500),new HttpException({code:'private-marker',message:'private-marker'},503)]){
  const result=capture(error);assert.ok(!JSON.stringify(result).includes('private-marker'));assert.equal(result.logs.length,1);
  assert.match(result.body.requestId,/^[A-F0-9]{8}$/);assert.equal(result.logs[0].requestId,result.body.requestId);
 }
 const pg=capture(Object.assign(Error('private-marker'),{code:'23505'}));assert.equal(pg.body.code,'TRA-DAT-003');assert.equal(pg.logs[0].postgresCode,'23505');
});
test('malformed HTTP bodies fall back safely and valid conflict contracts remain exact',()=>{
 for(const body of [null,[],123,{message:{secret:'private-marker'}},{message:['safe',{secret:'private-marker'}]},{message:'private-marker'.repeat(1000)},{code:{secret:'private-marker'}}]){
  const result=capture(new HttpException(body,400));assert.equal(result.status,400);assert.equal(typeof result.body.message,'string');assert.ok(!JSON.stringify(result).includes('private-marker'));
 }
 for(const code of ['TRA-VER-409','TRF-VER-409','TUR-SOL-409']){
  const result=capture(new ConflictException({code,message:'Conserve su borrador.'}));assert.equal(result.body.code,code);assert.equal(result.body.message,'Conserve su borrador.');
 }
 const array=capture(new HttpException({message:['Primero.','Segundo.']},400));assert.equal(array.body.message,'Primero. Segundo.');
 assert.equal(capture(new HttpException({code:'TRA-VER-409',message:'Formato inválido.'},400)).body.code,'TRA-REQ-400');
 for(const status of [400,413,415])assert.equal(capture(new HttpException({code:'GEN-REQ-'+status},status)).body.code,'GEN-REQ-'+status);
});
test('PostgreSQL error catalog never resolves inherited prototype keys',()=>{
 for(const value of ['constructor','toString','__proto__','private-marker',undefined])assert.equal(catalogPostgresError(value,'/api/transactions').code,'TRA-500');
});

test('real HTTP preserves validation/conflict responses and hides internal metadata',async()=>{
 require('reflect-metadata');const {Controller,Post,Module}=require('@nestjs/common'),{NestFactory}=require('@nestjs/core');
 class FixtureController{
  internal(){throw Object.assign(Error('private-marker'),{code:'password=private-marker',detail:'private-marker'});}
  conflict(){throw new ConflictException({code:'TRA-VER-409',message:'Conserve su borrador.'});}
  malformed(){throw new HttpException({code:{secret:'private-marker'},message:{secret:'private-marker'}},400);}
 }
 Controller('transactions')(FixtureController);
 for(const method of ['internal','conflict','malformed'])Post(method+'/:id')(FixtureController.prototype,method,Object.getOwnPropertyDescriptor(FixtureController.prototype,method));
 class Fixture{}Module({controllers:[FixtureController]})(Fixture);
 const app=await NestFactory.create(Fixture,{logger:false});app.setGlobalPrefix('api');
 const logs=[],filter=new AppExceptionFilter();filter.logger={error:value=>logs.push(value)};app.useGlobalFilters(filter);
 try{
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  for(const [method,status,code] of [['internal',500,'TRA-500'],['conflict',409,'TRA-VER-409'],['malformed',400,'TRA-REQ-400']]){
   const response=await fetch(base+'/api/transactions/'+method+'/private-marker?token=private-marker',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer private-marker'},body:JSON.stringify({password:'private-marker'})});
   assert.equal(response.status,status);const body=await response.json();assert.equal(body.code,code);assert.ok(body.path.endsWith('/:id'));assert.ok(!JSON.stringify(body).includes('private-marker'));
  }
  assert.equal(logs.length,3);assert.ok(!JSON.stringify(logs).includes('private-marker'));
 }finally{await app.close();}
});
