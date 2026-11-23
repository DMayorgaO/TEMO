import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
export const sha256=data=>createHash('sha256').update(data).digest('hex');
export function assertReleasePath(file){
 if(typeof file!=='string'||!file||file.includes('\\')||file.startsWith('/')||/[\x00-\x1f:]/.test(file)||file.split('/').some(p=>p==='.'||p==='..'||!p))throw Error('Ruta de candidato invalida.');
 if(/(^|\/)(tmp|backups?|node_modules|dist|coverage|logs|\.git|\.certificates|local-seeds)(\/|$)|gastos|INFORME_SEGURIDAD|seguridad.*privad|security.*private|\.(dump|pem|key|p12|pfx|crt|cer|der|jks|keystore|log)$/i.test(file))throw Error('Ruta privada excluida: '+file);
 if(/(^|\/)\.env($|\.)|\.env($|\.)/i.test(file)&&!file.endsWith('.env.example')&&file!=='.env.example')throw Error('Configuracion privada excluida: '+file);
}
export function assertReleaseContent(file,bytes,secrets=[]){
 const text=bytes.toString('utf8');
 if(/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text)||secrets.some(s=>s.length>=8&&[s,encodeURIComponent(s),JSON.stringify(s).slice(1,-1)].some(v=>bytes.includes(Buffer.from(v)))))throw Error('Posible secreto en candidato: '+file);
}
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20*1024*1024});
export async function releaseManifest(root,secrets=[]){
 root=await realpath(root);
 const base=git(root,['rev-parse','HEAD']).trim();
 const branch=git(root,['branch','--show-current']).trim();
 if(git(root,['ls-files','-v','-z']).split('\0').filter(Boolean).some(entry=>!entry.startsWith('H ')))throw Error('Entradas Git ocultas o especiales no admitidas.');
 if(git(root,['ls-files','-u','-z']))throw Error('Existen conflictos sin resolver.');
 const index=[];
 const tracked=git(root,['ls-files','--stage','-z']).split('\0').filter(Boolean).map(line=>{const [meta,file]=line.split('\t');if(!/^100(644|755) /.test(meta))throw Error('Entrada Git no regular: '+file);index.push({path:file,mode:meta.split(' ')[0],oid:meta.split(' ')[1]});return file;});
 const untracked=git(root,['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
 for(const entry of index){
  assertReleasePath(entry.path);
  const bytes=execFileSync('git',['cat-file','blob',entry.oid],{cwd:root,maxBuffer:20*1024*1024,stdio:['ignore','pipe','pipe']});
  assertReleaseContent(entry.path,bytes,secrets);
 }
 const files=[];const deleted=[];
 for(const file of [...new Set([...tracked,...untracked])].sort()){
  assertReleasePath(file);
  let stat;try{stat=await lstat(path.join(root,file));}catch(e){if(e.code==='ENOENT'&&tracked.includes(file)){deleted.push(file);continue;}throw e;}
  const pieces=file.split('/');let current=root;
  for(const piece of pieces){current=path.join(current,piece);if((await lstat(current)).isSymbolicLink())throw Error('Enlace no admitido: '+file);}
  if(!stat.isFile()||!(await realpath(current)).startsWith(root+path.sep))throw Error('Archivo fuera del repositorio: '+file);
  const bytes=await readFile(current);assertReleaseContent(file,bytes,secrets);
  files.push({path:file,bytes:bytes.length,sha256:sha256(bytes)});
 }
 const changed=git(root,['diff','HEAD','--name-only','-z']).split('\0').filter(Boolean);
 return {format:1,base,branch,index,files,deleted,changed:[...new Set([...changed,...untracked])].sort()};
}
export function verifyReleaseManifest(expected,current){
 if(JSON.stringify(expected)!==JSON.stringify(current))throw Error('El candidato cambio. Repita revision y preparacion.');
 return true;
}
