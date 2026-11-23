import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import {captureRecoveryManifest} from './lib/recovery-manifest.mjs';
const client=new pg.Client({host:'127.0.0.1',port:55439,user:'temo_restore',database:'postgres',statement_timeout:30000});
try{
 assert.deepEqual(process.argv.slice(2),['--isolated-restored-directory']);await client.connect();
 const identity=(await client.query("select current_user as actor,current_database() as db,current_setting('data_directory') as directory,inet_server_port() as port")).rows[0];
 assert.equal(identity.actor,'temo_restore');assert.equal(identity.db,'postgres');assert.equal(identity.port,55439);
 assert.match(identity.directory.replaceAll('\\','/'),/\/tmp\/pg-restore-test-[a-f0-9]{32}$/);
 await client.query('begin read only');const before=await captureRecoveryManifest(client,{portableNotNull:true});await client.query('rollback');
 const key='solicitudes_financieras.solicitudes_financieras_operacion_check';
 const constraint=async()=>(await client.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='temo.solicitudes_financieras'::regclass and conname='solicitudes_financieras_operacion_check'")).rows[0];
 const original=await constraint();assert.ok(original&&!original.definition.includes('CREAR_DIRECTORIO'));
 await client.query(await readFile(path.resolve(import.meta.dirname,'../database/init/056_directory_request_receipts.sql'),'utf8'));
 await client.query('begin read only');const after=await captureRecoveryManifest(client,{portableNotNull:true});await client.query('rollback');
 assert.deepEqual(after.tables,before.tables);assert.deepEqual(after.sequences,before.sequences);
 const other=rows=>rows.filter(row=>!(row.kind==='constraint'&&row.name===key));assert.deepEqual(other(after.structureEntries),other(before.structureEntries));
 const updated=await constraint();
 const names=s=>[...s.matchAll(/'([A-Z_]+)'/g)].map(m=>m[1]).sort();
 assert.deepEqual(names(updated.definition),[...names(original.definition),'CREAR_DIRECTORIO','EDITAR_DIRECTORIO'].sort());
 console.log(JSON.stringify({isolated:true,migration:'056',dataTablesUnchanged:after.tables.length,sequencesUnchanged:after.sequences.length,onlyExpectedConstraintChanged:true}));
}catch{console.error('Ensayo 056 rechazado; revisar evidencia privada, sin volcar datos.');process.exitCode=1;}finally{await client.end().catch(()=>{});}
