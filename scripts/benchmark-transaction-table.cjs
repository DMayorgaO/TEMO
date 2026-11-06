// Local-only, temporary SQL fixtures. Does not change persistent rows, sequences or schema.
const {Client}=require('pg');const fs=require('node:fs');
const {TransactionsController}=require('../backend/dist/modules/transactions/transactions.controller');
const {TransactionsService}=require('../backend/dist/modules/transactions/transactions.service');
const {buildTransactionTableQuery,parseTransactionTable}=require('../backend/dist/modules/transactions/transaction-table.query');
const actor={id:'11111111-1111-4111-8111-111111111111',roleCode:'JEFA'};
let relations=new Set();
const rewrite=s=>s.replace(/temo\.(\w+)/g,(full,name)=>relations.has(name)?`pg_temp.${name}`:full);
(async()=>{const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',statement_timeout:120000});await c.connect();
try{await c.query('begin');relations=new Set((await c.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='temo' and c.relkind in ('r','v')")).rows.map(x=>x.relname));const done=new Set();
async function clone(name){if(done.has(name)||!relations.has(name))return;assertName(name);done.add(name);
 const r=(await c.query("select c.relkind,case when c.relkind='v' then pg_get_viewdef(c.oid,true) end definition from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='temo' and c.relname=$1",[name])).rows[0];
 if(r.relkind==='v'){for(const [,dep]of r.definition.matchAll(/temo\.(\w+)/g))await clone(dep);await c.query(`create temp view ${name} as ${rewrite(r.definition)}`);}
 else{await c.query(`create temp table ${name} as table temo.${name}`);const indexes=(await c.query('select indexdef from pg_indexes where schemaname=$1 and tablename=$2',['temo',name])).rows;
 for(const {indexdef}of indexes)await c.query(rewrite(indexdef));}}
let originalSql;const capture={query:async(sql)=>{originalSql=sql;return {rows:[]};}};await new TransactionsController(capture,{applyHistoricalRows:async x=>x}).list('200','0',{user:actor});
const q=buildTransactionTableQuery(parseTransactionTable({limit:'10',inactive:'true'}),actor);
for(const [,name]of (originalSql+q.sql).matchAll(/temo\.(\w+)/g))await clone(name);
const template=(await c.query('select to_jsonb(t) as data from pg_temp.transacciones t limit 1')).rows[0].data;
const group=(await c.query('select to_jsonb(g) as data from pg_temp.grupos_transacciones g where id_grupo_transacciones=$1',[template.id_grupo_transacciones])).rows[0].data;
const results=[];
const sizes=process.argv.slice(2).length?process.argv.slice(2).map(Number):[20000,100000];
if(sizes.some(n=>![20000,100000].includes(n)))throw Error('Use only 20000 or 100000');
for(const n of sizes){
 await c.query('truncate pg_temp.transacciones,pg_temp.grupos_transacciones');
 await c.query('create temp table seed_ids as select i,gen_random_uuid() as tid,gen_random_uuid() as gid from generate_series(1,$1::int) i',[n]);
 await c.query(`insert into pg_temp.grupos_transacciones select (jsonb_populate_record(null::pg_temp.grupos_transacciones,$1::jsonb||jsonb_build_object('id_grupo_transacciones',gid,'codigo_operacion',i))).* from seed_ids`,[group]);
 await c.query(`insert into pg_temp.transacciones select (jsonb_populate_record(null::pg_temp.transacciones,$1::jsonb||jsonb_build_object('id_transaccion',tid,'id_grupo_transacciones',gid,'orden_grupo',1,'consecutivo_turno',i,'monto_original',(i%5000)+1,'fecha_transaccion','2026-10-01T12:00:00Z'))).* from seed_ids`,[template]);
 await c.query('drop table seed_ids');await c.query('analyze pg_temp.transacciones');await c.query('analyze pg_temp.grupos_transacciones');
 let bytes=0,requests=0;let start=performance.now();
 for(let offset=0;offset<1000;offset+=200){const rows=(await c.query(rewrite(originalSql),[200,offset,'JEFA',actor.id,null])).rows;bytes+=Buffer.byteLength(JSON.stringify(rows));requests++;if(rows.length<200)break;}
 const beforeMs=performance.now()-start;const after=[];let afterBytes=0;
 for(let i=0;i<10;i++){start=performance.now();const result=(await c.query(rewrite(q.sql),q.params)).rows[0];after.push(performance.now()-start);afterBytes=Buffer.byteLength(JSON.stringify(result));if(result.total!==n||result.rows.length!==10)throw Error('Unexpected count');}
 const explain=(await c.query('explain (analyze,buffers,format json) '+rewrite(q.sql),q.params)).rows[0]['QUERY PLAN'][0];
 after.sort((a,b)=>a-b);results.push({records:n,before:{measuredPages:requests,fullHistoryRequests:Math.floor(n/200)+1,partialBaseline:true,bytes,sqlMs:beforeMs},after:{requests:1,bytes:afterBytes,p50SqlMs:after[4],p95SqlMs:after[9],planningMs:explain['Planning Time'],executionMs:explain['Execution Time'],sharedHits:explain.Plan['Shared Hit Blocks'],localHits:explain.Plan['Local Hit Blocks'],tempWritten:explain.Plan['Temp Written Blocks']}});
 console.log(JSON.stringify(results.at(-1)));
}
fs.writeFileSync('tmp/transaction-table-benchmark.json',JSON.stringify({localOnly:true,fixture:'temporary indexed clones; one transaction per group, no linked settlement for synthetic rows',results},null,2));
}finally{await c.query('rollback');await c.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
function assertName(s){if(!/^\w+$/.test(s))throw Error('Invalid relation name');}
