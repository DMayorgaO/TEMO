const test=require('node:test');const assert=require('node:assert/strict');
const {parseTransactionTable,buildTransactionTableQuery,readTransactionTable}=require('../dist/modules/transactions/transaction-table.query');
const {TransactionsController}=require('../dist/modules/transactions/transactions.controller');
const {TransactionsService}=require('../dist/modules/transactions/transactions.service');
const id='11111111-1111-4111-8111-111111111111',admin={id,roleCode:'JEFA',sessionVersion:1};
test('table rejects scope injection, query pollution, invalid dates, pagination and sort SQL',()=>{
 for(const value of [{role:'JEFA'},{userId:id},{limit:'201'},{offset:'-1'},{offset:'1e3'},{sort:'monto;drop table'},
 {direction:'DESC NULLS FIRST'},{currency:['USD','NIO']},{startDate:'2026-02-29'},{startTime:'24:00'},{inactive:true},{search:'x'.repeat(201)}])assert.throws(()=>parseTransactionTable(value),e=>e.getStatus()===400);
 const hostile="%_' OR true --";const {sql,params}=buildTransactionTableQuery(parseTransactionTable({search:hostile,entity:hostile}),admin);
 assert.ok(!sql.includes(hostile));assert.equal(params.filter(x=>x===hostile).length,2);
});
test('table and filtered export reject roles and password changes before querying',async()=>{
 let calls=0;const db={query:async()=>{calls++;return {rows:[]};}};const ctrl=new TransactionsController(db,{});
 for(const user of [{...admin,roleCode:'TRANSFERISTA'},{...admin,mustChangePassword:true}]){
  await assert.rejects(()=>readTransactionTable(db,user,{}),e=>e.getStatus()===403);
  await assert.rejects(()=>ctrl.exportFiltered({format:'EXCEL',query:{}},{user}),e=>e.getStatus()===403);
 }assert.equal(calls,0);
});
test('filtered export includes all rows, requires live identity and mandatory audit, never truncates',async()=>{
 const rows=Array.from({length:31},(_,i)=>({database_id:String(i)}));let audit=true,queries=[];
 const db={query:async(sql,args)=>{queries.push({sql,args});return sql.includes('insert into temo.bitacora')?{rows:[],rowCount:audit?1:0}:{rows:[{total:31,rows,totals:{}}]};}};
 const ctrl=new TransactionsController(db,{});assert.equal((await ctrl.exportFiltered({format:'EXCEL',query:{limit:'10',offset:'20'}},{user:admin})).length,31);
 assert.deepEqual(queries[0].args.slice(-2),[5001,0]);assert.equal(queries[1].args[3],31);
 audit=false;await assert.rejects(()=>ctrl.exportFiltered({format:'PDF',query:{}},{user:admin}),e=>e.getStatus()===403);
 const tooMany=new TransactionsController({query:async()=>({rows:[{total:5001,rows:[],totals:{}}]})},{});
 await assert.rejects(()=>tooMany.exportFiltered({format:'PDF',query:{}},{user:admin}),e=>e.getStatus()===400);
});
test('local SQL matches reference records, corrections, scopes, totals and pages', {skip:!process.env.TEMO_TEST_PREVIEW}, async()=>{
 const {Client}=require('pg');const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',statement_timeout:30000});await c.connect();
 try{await c.query('begin read only');const ctrl=new TransactionsController(c,new TransactionsService(c));
 const reference=await ctrl.list('200','0',{user:admin});assert.ok(reference.length>0&&reference.length<200,'local fixture expected');
 for(const inactive of ['true','false'])for(const currency of [undefined,'NIO','USD']){
  const expected=reference.filter(r=>(inactive==='true'||r.estado!=='ANULADA')&&(!currency||r.moneda===currency));
  const q={limit:'3',inactive,...(currency?{currency}:{})};const first=await readTransactionTable(c,admin,q);assert.equal(first.total,expected.length);
  const all=[];for(let offset=0;offset<first.total;offset+=3)all.push(...(await readTransactionTable(c,admin,{...q,offset:String(offset)})).rows);
  assert.deepEqual(all.map(r=>r.database_id).sort(),expected.map(r=>r.database_id).sort());
  for(const row of all){const old=expected.find(r=>r.database_id===row.database_id);for(const key of ['estado','moneda','direccion','entidad','codigo_movimiento','movimiento','descripcion','pendiente'])assert.equal(row[key],old[key]);assert.equal(Number(row.monto),Number(old.monto));}
  for(const moneda of ['NIO','USD'])for(const [key,direction]of [['income','ENTRA'],['expense','SALE']]){
   const total=expected.filter(r=>r.estado!=='ANULADA'&&r.moneda===moneda&&r.direccion===direction).reduce((n,r)=>n+Number(r.monto),0);
   assert.ok(Math.abs(Number(first.totals[moneda]?.[key]||0)-total)<0.00001);
  }
 }
 const scopes=(await c.query('select distinct id_cajero as id from temo.transacciones')).rows;
 for(const user of [...scopes.map(x=>({...x,roleCode:'CAJERO'})),{id,roleCode:'CAJERO'}]){
  const old=await ctrl.list('200','0',{user});const result=await readTransactionTable(c,user,{limit:'200',inactive:'true'});
  assert.deepEqual(result.rows.map(r=>r.database_id).sort(),old.map(r=>r.database_id).sort());
 }
 const row=reference.find(r=>r.estado!=='ANULADA');const filtered=await readTransactionTable(c,admin,{id:row.id});assert.ok(filtered.rows.some(r=>r.database_id===row.database_id));
 const empty=await readTransactionTable(c,admin,{search:'no-such-record-unique'});assert.equal(empty.total,0);assert.deepEqual(empty.rows,[]);
 const beyond=await readTransactionTable(c,admin,{offset:'1000'});assert.equal(beyond.rows.length,0);assert.ok(beyond.total>0);
 }finally{await c.query('rollback');await c.end();}
});

test('temporary SQL fixtures isolate cashier/shift and apply historical filters before totals', {skip:!process.env.TEMO_TEST_PREVIEW}, async()=>{
 const {Client}=require('pg'),{randomUUID}=require('node:crypto');const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview'});await c.connect();
 try{await c.query('begin');
  await c.query('create temp table table_transactions as table temo.transacciones with no data');
  await c.query('create temp table table_shifts as select id_turno,estado from temo.turnos with no data');
  await c.query('create temp table table_corrections as table temo.correcciones_transacciones_cerradas with no data');
  const base=(await c.query('select to_jsonb(t) data from temo.transacciones t limit 1')).rows[0].data;
  const users=(await c.query('select id_usuario as id from temo.usuarios limit 2')).rows;assert.equal(users.length,2);
  const ids=[];
  for(const [i,state] of ['ABIERTO','EN_REVISION','PENDIENTE_APROBACION','CERRADO','ABIERTO'].entries()){
   const tid=randomUUID(),sid=randomUUID();ids.push(tid);
   await c.query('insert into table_shifts values($1,$2)',[sid,state]);
   await c.query(`insert into table_transactions select (jsonb_populate_record(null::pg_temp.table_transactions,$1::jsonb||$2::jsonb)).*`,[base,{id_transaccion:tid,id_turno:sid,id_cajero:users[i===4?1:0].id,estado:'REGISTRADA',orden_grupo:i+1,monto_original:10*(i+1),fecha_transaccion:`2026-10-${String(i+1).padStart(2,'0')}T16:30:00Z`}]);
  }
  await c.query(`insert into table_corrections(id_transaccion,proyeccion,anulada) values($1,$2,false),($3,'{}',true)`,[ids[3],{moneda:'USD',monto:'123.4500',entidad:'CORREGIDO',pendiente:'CLIENTE %_ especial',direccion:'SALE'},ids[1]]);
  const db={query:(sql,args)=>c.query(sql.replaceAll('temo.transacciones t','pg_temp.table_transactions t').replaceAll('temo.turnos tu','pg_temp.table_shifts tu').replaceAll('temo.correcciones_transacciones_cerradas h','pg_temp.table_corrections h'),args)};
  const cashier={...users[0],roleCode:'CAJERO'};
  assert.deepEqual((await readTransactionTable(db,cashier,{inactive:'true',limit:'200'})).rows.map(r=>r.database_id).sort(),ids.slice(0,3).sort());
  assert.deepEqual((await readTransactionTable(db,cashier,{})).rows.map(r=>r.database_id).sort(),[ids[0],ids[2]].sort());
  const correction=await readTransactionTable(db,admin,{currency:'USD',entity:'CORREGIDO',pendingName:'%_'});
  assert.equal(correction.total,1);assert.equal(correction.rows[0].database_id,ids[3]);assert.equal(correction.rows[0].monto,'123.4500');assert.equal(correction.totals.USD.expense,'123.4500');
  assert.equal((await readTransactionTable(db,cashier,{entity:'CORREGIDO'})).total,0);
  const period=await readTransactionTable(db,admin,{startDate:'2026-10-03',endDate:'2026-10-04',startTime:'10:30',endTime:'10:30',sort:'amount',direction:'asc'});
  assert.deepEqual(period.rows.map(r=>r.database_id),[ids[2],ids[3]]);
  assert.equal((await readTransactionTable(db,admin,{startTime:'10:31'})).total,0);
  for(const sort of ['id','registeredAt','entity','movement','amount','pendingName','operatorBranch']){
   const asc=await readTransactionTable(db,admin,{inactive:'true',sort,direction:'asc'}),desc=await readTransactionTable(db,admin,{inactive:'true',sort,direction:'desc'});
   assert.deepEqual(asc.rows.map(r=>r.database_id),desc.rows.map(r=>r.database_id).reverse());
  }
 }finally{await c.query('rollback');await c.end();}
});

test('new reader works under the restricted preview SQL role', {skip:!process.env.TEMO_TEST_PREVIEW},async()=>{
 const {Client}=require('pg');const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview'});await c.connect();
 try{await c.query('begin');const expected=await readTransactionTable(c,admin,{});
  await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
  const privileges=(await c.query('select rolsuper,rolbypassrls from pg_roles where rolname=current_user')).rows[0];assert.equal(privileges.rolsuper,false);assert.equal(privileges.rolbypassrls,false);
  const result=await readTransactionTable(c,admin,{});assert.deepEqual(result,expected);
 }finally{await c.query('rollback');await c.end();}
});
