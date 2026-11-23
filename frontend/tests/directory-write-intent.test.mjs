import test from 'node:test';
import assert from 'node:assert/strict';
import {DirectoryWriteIntent} from '../src/utils/directory-write-intent.ts';
test('uncertain directory writes keep exact body and reference, and never cross sessions',()=>{
 let n=0;const intent=new DirectoryWriteIntent(()=>String(++n));const first=intent.prepare({name:'Original',references:['private']},'session-a');
 for(const status of [undefined,408,500,502,503]){intent.rejected(status);assert.equal(intent.prepare({name:'Changed'},'session-a'),first);}
 assert.equal(n,1);assert.throws(()=>intent.prepare({},'session-b'),/sesion cambio/);assert.equal(intent.unresolved,true);
 intent.complete();assert.equal(intent.unresolved,false);assert.notEqual(intent.prepare({name:'Next'},'session-b'),first);
});
test('confirmed directory rejection permits corrections with a new reference',()=>{
 for(const status of [400,401,403,404,409,413,422,429]){let n=0;const intent=new DirectoryWriteIntent(()=>String(++n));intent.prepare({name:'Before'},'session');intent.rejected(status);const next=JSON.parse(intent.prepare({name:'After'},'session'));assert.equal(next.name,'After');assert.equal(next.requestId,'2');}
});
test('directory intent requires a live session and does not mutate a supplied payload',()=>{
 const intent=new DirectoryWriteIntent(()=>'reference'),payload={name:'Private'};assert.throws(()=>intent.prepare(payload,''),/sesion/);assert.equal(intent.unresolved,false);intent.prepare(payload,'session');assert.deepEqual(payload,{name:'Private'});
});
