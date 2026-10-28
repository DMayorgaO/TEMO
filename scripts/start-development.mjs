import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {createServer} from 'node:net';
import {networkInterfaces} from 'node:os';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import pg from 'pg';
import {assessRuntime} from './check-runtime-security.mjs';

const script=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(script),'..');
const preview=path.join(root,'tmp/preview'),runtime=path.join(root,'tmp/development');
const database='postgresql://temo_preview@127.0.0.1:55433/temo_preview';
const privateIp=ip=>/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const links=()=>Object.entries(networkInterfaces()).flatMap(([name,entries])=>(entries||[]).filter(v=>v.family==='IPv4'&&!v.internal&&privateIp(v.address)).map(v=>({name,address:v.address})))
  .sort((a,b)=>Number(/vmware|virtual|vethernet|docker/i.test(a.name))-Number(/vmware|virtual|vethernet|docker/i.test(b.name)));
const addresses=()=>[...new Set(links().map(link=>link.address))];

export function developmentEnvironment(parent={}) {
  const environment=Object.fromEntries(Object.entries(parent).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)));
  return {...environment,APP_ENV:'development',DATABASE_URL:database,DATABASE_SSL:'false',DATABASE_SSL_CA_PATH:'',DATABASE_SSL_CA_BASE64:'',
    PORT:'4187',BACKEND_PORT:'4187',TEMO_ISOLATED_DEVELOPMENT:'1',TEMO_DEVELOPMENT_LOOPBACK:'1',
    AUTH_TOKEN_HOURS:'8',RESEND_API_KEY:'',PASSWORD_RESET_EMAIL_FROM:'',VITE_API_URL:'/api',VITE_APP_ENV:'development',VITE_DEV_LOCAL_PROXY:'1',VITE_SESSION_IDLE_MINUTES:'30',
    CORS_ORIGINS:['http://localhost:3188','http://127.0.0.1:3188',...addresses().map(ip=>`http://${ip}:3188`)].join(',')};
}

function run(file,args) {
  const result=spawnSync(file,args,{cwd:root,windowsHide:true,stdio:'inherit',timeout:120000});
  if(result.error||result.status!==0)throw new Error(`Fallo ${path.basename(file)}. No se reiniciaron los datos.`);
}
async function free(port) {
  await new Promise((resolve,reject)=>{
    const server=createServer();server.once('error',()=>reject(new Error(`Puerto ${port} ocupado por un servicio no gestionado. No se detuvo.`)));
    server.listen(port,'0.0.0.0',()=>server.close(resolve));
  });
}
async function wait(url) {
  for(let i=0;i<60;i++){
    try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw new Error(`No responde ${url}. Consulte tmp/development.`);
}
function stopOwned(pid,service) {
  if(!Number.isSafeInteger(pid)||pid<1)return;
  const result=spawnSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`],{windowsHide:true,encoding:'utf8'});
  if(result.status!==0)throw new Error('No se pudo verificar el proceso anterior; no se detuvo.');
  if(!result.stdout.trim())return;
  const processInfo=JSON.parse(result.stdout),command=String(processInfo.CommandLine).toLowerCase();
  if(String(processInfo.ExecutablePath).toLowerCase()!==process.execPath.toLowerCase()||!command.includes(script.toLowerCase())||!command.includes(`--service ${service}`))throw new Error('El PID anterior pertenece a otro proceso. No se detuvo.');
  process.kill(pid);
}
async function service(name) {
  if(process.env.APP_ENV!=='development'||process.env.DATABASE_URL!==database||process.env.TEMO_ISOLATED_DEVELOPMENT!=='1')throw new Error('Use el lanzador de desarrollo; falta su configuracion aislada.');
  if(name==='api'){
    process.env.AUTH_SECRET=randomBytes(48).toString('hex');
    process.env.MFA_ENCRYPTION_KEY=readFileSync(path.join(preview,'mfa-key'),'utf8').trim();
    await import(pathToFileURL(path.join(root,'backend/dist/main.js')).href);
  }else if(name==='web'){
    const {createServer}=await import('vite');
    const server=await createServer({root:path.join(root,'frontend'),configFile:path.join(root,'frontend/vite.config.ts'),server:{host:'0.0.0.0',port:3188,strictPort:true}});
    await server.listen();
  }else throw new Error('Servicio de desarrollo invalido.');
}
export async function startDevelopment() {
  const assessment=assessRuntime(process.version,process.env,process.execArgv);
  if(!assessment.patchedForOctoberAdvisory||assessment.tlsVerificationDisabled)throw new Error('El runtime no supera el control de seguridad.');
  if(process.platform!=='win32')throw new Error('Este lanzador requiere Windows y el PostgreSQL local de pruebas.');
  if(!existsSync(path.join(preview,'pgdata/PG_VERSION'))||!existsSync(path.join(preview,'mfa-key')))throw new Error('Falta la base de pruebas preparada. No se crearon usuarios ni datos: solicite su preparacion inicial.');
  mkdirSync(runtime,{recursive:true});
  const stateFile=path.join(runtime,'services.json');
  if(existsSync(stateFile)){
    const previous=JSON.parse(readFileSync(stateFile,'utf8'));
    stopOwned(previous.web,'web');stopOwned(previous.api,'api');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  await free(3188);await free(4187);
  const pgRoot=path.join(process.env.ProgramFiles||'C:/Program Files','PostgreSQL');
  const version=readFileSync(path.join(preview,'pgdata/PG_VERSION'),'utf8').trim();
  if(!/^\d+$/.test(version))throw new Error('Version de PostgreSQL invalida.');
  const bin=path.join(pgRoot,version,'bin'),data=path.join(preview,'pgdata');
  const status=spawnSync(path.join(bin,'pg_ctl.exe'),['-D',data,'status'],{windowsHide:true,stdio:'ignore'});
  if(status.status!==0){await free(55433);run(path.join(bin,'pg_ctl.exe'),['-D',data,'-l',path.join(preview,'postgres.log'),'-o','-p 55433 -h 127.0.0.1','-w','start']);}
  const client=new pg.Client({connectionString:database,connectionTimeoutMillis:5000});
  try{await client.connect();const result=await client.query('show listen_addresses');if(result.rows[0].listen_addresses!=='127.0.0.1')throw new Error('PostgreSQL debe escuchar solo en 127.0.0.1.');}finally{await client.end();}
  run(process.execPath,[path.join(root,'scripts/check-security-readiness.mjs')]);
  run(process.execPath,[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),'run','build']);
  const children=[];
  try{
    for(const name of ['api','web']){
      const log=openSync(path.join(runtime,`${name}.log`),'a');
      const child=spawn(process.execPath,[script,'--service',name],{cwd:root,env:developmentEnvironment(process.env),detached:true,windowsHide:true,stdio:['ignore',log,log]});
      child.unref();closeSync(log);children.push(child);
      await wait(name==='api'?'http://127.0.0.1:4187/api/health':'http://127.0.0.1:3188/api/health');
      if(child.exitCode!==null)throw new Error('Un servicio termino al iniciar. Consulte tmp/development.');
    }
    writeFileSync(stateFile,JSON.stringify({api:children[0].pid,web:children[1].pid}));
    console.log('\nDESARROLLO: http://127.0.0.1:3188/#/login');
    for(const link of links())console.log(`RED LOCAL (${link.name}): http://${link.address}:3188/#/login`);
    console.log('Base de pruebas existente conservada. Correo deshabilitado. API y PostgreSQL solo locales.');
    console.log('Los otros dispositivos solo necesitan navegador. Use una red privada de confianza.');
  }catch(error){for(const child of children)if(child.exitCode===null)child.kill();throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===script){
  const args=process.argv.slice(2);
  try{
    if(args.length===2&&args[0]==='--service')await service(args[1]);
    else if(!args.length)await startDevelopment();
    else throw new Error('Argumentos de desarrollo invalidos.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
