import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {releaseManifest,verifyReleaseManifest,sha256} from './lib/release-candidate.mjs';
const root=path.resolve(import.meta.dirname,'..');
try{
 const [mode,output,...extra]=process.argv.slice(2);
 if(!['--prepare','--verify'].includes(mode)||!output||extra.length)throw Error('Uso: --prepare|--verify tmp/archivo.json');
 if((await lstat(path.join(root,'tmp'))).isSymbolicLink())throw Error('Directorio temporal enlazado no admitido.');
 const target=path.resolve(root,output),allowed=await realpath(path.join(root,'tmp'));
 if(path.dirname(target)!==path.join(root,'tmp')||!target.endsWith('.json')||await realpath(path.dirname(target))!==allowed)throw Error('El manifiesto debe guardarse directamente en tmp.');
 const secrets=[];
 for(const file of ['.env.production','.env.cloud']){
  let bytes;try{bytes=await readFile(path.join(root,file));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  for(const [key,value] of Object.entries(dotenv.parse(bytes)))if(/SECRET|PASSWORD|TOKEN|DATABASE_URL|PRIVATE|ENCRYPTION|API_KEY/.test(key)&&value.length>=8){
   secrets.push(value);if(key==='DATABASE_URL'){try{secrets.push(decodeURIComponent(new URL(value).password));}catch{throw Error('Configuracion privada invalida.');}}
  }
 }
 const manifest=await releaseManifest(root,secrets);
 if(mode==='--prepare')await writeFile(target,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 else{if((await lstat(target)).isSymbolicLink())throw Error('Manifiesto enlazado no admitido.');verifyReleaseManifest(JSON.parse(await readFile(target,'utf8')),manifest);}
 console.log(JSON.stringify({mode,files:manifest.files.length,changed:manifest.changed.length,base:manifest.base,sha256:sha256(await readFile(target)),knownProductionAndPilotSecretScan:true,published:false}));
}catch(error){console.error(error.message?.startsWith('Posible secreto')||error.message?.startsWith('Ruta privada')?error.message:'Preparacion/verificacion rechazada; revise rutas, conflictos, permisos y cambios del candidato.');process.exitCode=1;}
