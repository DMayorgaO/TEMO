const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {Client}=require('pg');
const {TOTP}=require('otpauth');
const {MfaService}=require('../dist/modules/auth/mfa.service');
const {MfaSecretVault}=require('../dist/modules/auth/mfa-secret-vault');
const options={connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview'};
const hash=value=>createHash('sha256').update(value).digest('hex');
const denied=e=>e.getStatus()===401;
const config=key=>({get:(name,fallback)=>name==='MFA_ENCRYPTION_KEY'?key:fallback});
const fixture=async client=>(await client.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
 select id_rol,'MFA boundary','Fixture',$1,'not-a-login-credential',false from temo.roles where codigo='JEFA'
 returning id_usuario as id,usuario as username,version_sesion as "sessionVersion"`,['mfa_boundary_'+randomUUID().replaceAll('-','')])).rows[0];

test('preview: MFA identity changes deny challenges and verification without consuming state; audit is atomic',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
 const c=new Client(options);await c.connect();
 try{
  await c.query('begin');
  if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
  const user=await fixture(c),key=randomBytes(32).toString('base64');let failAudit=false;
  const db={transaction:async work=>{await c.query('savepoint operation');try{
   const result=await work({query:(sql,args)=>{if(failAudit&&sql.includes('insert into temo.bitacora'))throw Error('synthetic audit failure');return c.query(sql,args);}});
   await c.query('release savepoint operation');return result;
  }catch(e){await c.query('rollback to savepoint operation');await c.query('release savepoint operation');throw e;}}};
  const mfa=new MfaService(db,config(key));
  const initial=await mfa.begin(user);
  const seed=new MfaSecretVault(key).decrypt(user.id,(await c.query('select secreto_cifrado from temo.desafios_mfa where token_hash=$1',[hash(initial.challenge)])).rows[0].secreto_cifrado);
  const otp=new TOTP({secret:seed});
  const snapshot=async()=>({
   challenges:(await c.query('select token_hash,intentos,consumido_en from temo.desafios_mfa where id_usuario=$1 order by token_hash',[user.id])).rows,
   mfa:(await c.query('select ultimo_paso,intentos_fallidos from temo.usuario_mfa where id_usuario=$1',[user.id])).rows,
   recovery:(await c.query('select codigo_hash,consumido_en from temo.recuperacion_mfa where id_usuario=$1 order by codigo_hash',[user.id])).rows,
   audit:(await c.query('select count(*)::int n from temo.bitacora where id_usuario=$1',[user.id])).rows[0].n,
   version:(await c.query('select version_sesion from temo.usuarios where id_usuario=$1',[user.id])).rows[0].version_sesion
  });
  for(const [name,sql] of [
   ['revoked','update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1'],
   ['inactive',"update temo.usuarios set estado='INACTIVO' where id_usuario=$1"],
   ['changed role',"update temo.usuarios set id_rol=(select id_rol from temo.roles where codigo='CAJERO') where id_usuario=$1"],
   ['inactive role',"update temo.roles set estado='INACTIVO' where id_rol=(select id_rol from temo.usuarios where id_usuario=$1)"]
  ])await t.test(name,async()=>{
   await c.query('savepoint scenario');await c.query(sql,[user.id]);const before=await snapshot();
   await assert.rejects(mfa.begin(user),denied);await assert.rejects(mfa.verify(initial.challenge,otp.generate(),'','','Fixture'),denied);
   assert.deepEqual(await snapshot(),before);await c.query('rollback to savepoint scenario');await c.query('release savepoint scenario');
  });
  await t.test('failed enrollment audit rolls back secret, recovery codes, challenge and version',async()=>{
   const before=await snapshot();failAudit=true;await assert.rejects(mfa.verify(initial.challenge,otp.generate(),'','','Fixture'),/synthetic audit failure/);failAudit=false;assert.deepEqual(await snapshot(),before);
  });
  const enrolled=await mfa.verify(initial.challenge,otp.generate(),'','','Fixture');
  assert.equal(enrolled.recoveryCodes.length,8);user.sessionVersion=enrolled.sessionVersion;
  const next=await mfa.begin(user);
  await t.test('failed recovery audit does not consume a recovery code or challenge',async()=>{
   const before=await snapshot();failAudit=true;await assert.rejects(mfa.verify(next.challenge,'',enrolled.recoveryCodes[0],'','Fixture'),/synthetic audit failure/);failAudit=false;assert.deepEqual(await snapshot(),before);
   await mfa.verify(next.challenge,'',enrolled.recoveryCodes[0],'','Fixture');
   await assert.rejects(mfa.verify(next.challenge,'',enrolled.recoveryCodes[0],'','Fixture'),denied);
  });
 }finally{await c.query('rollback');await c.end();}
});

test('preview: MFA challenge creation observes concurrent revocation and holds the role lock',{skip:!process.env.TEMO_TEST_PREVIEW},async()=>{
 const first=new Client(options),second=new Client(options);await first.connect();await second.connect();let user,pending;
 try{
  user=await fixture(first);
  const mfa=new MfaService({transaction:work=>work(second)},config(randomBytes(32).toString('base64')));
  await first.query('begin');await first.query('update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1',[user.id]);
  await second.query('begin');await second.query("set local statement_timeout='5s'");
  pending=assert.rejects(mfa.begin(user),denied);let waiting=false;
  for(let i=0;i<100;i++){
   if((await first.query('select wait_event_type from pg_stat_activity where pid=$1',[second.processID])).rows[0]?.wait_event_type==='Lock'){waiting=true;break;}
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(waiting,true);await first.query('commit');await pending;pending=undefined;await second.query('rollback');
  assert.equal((await first.query('select count(*)::int n from temo.desafios_mfa where id_usuario=$1',[user.id])).rows[0].n,0);
  user.sessionVersion++;
  await second.query('begin');await mfa.begin(user);
  await first.query('begin');await first.query("set local lock_timeout='150ms'");
  await assert.rejects(first.query("update temo.roles set nombre=nombre where codigo='JEFA'"),e=>e.code==='55P03');
 }finally{
  await first.query('rollback');if(pending)await pending;await second.query('rollback');
  if(user)await first.query('delete from temo.usuarios where id_usuario=$1',[user.id]);
  await first.end();await second.end();
 }
});
