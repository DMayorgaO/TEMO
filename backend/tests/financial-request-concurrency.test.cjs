const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');
const {financialRequest}=require('../dist/common/financial-request');

test('real concurrent receipts: one committed effect across connections, isolated temporary schema',{skip:!process.env.TEMO_TEST_PREVIEW},async()=>{
  const schema='qa_receipt_'+randomUUID().replaceAll('-','');
  assert.match(schema,/^qa_receipt_[a-f0-9]{32}$/);
  const options={connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',statement_timeout:15000};
  const setup=new Client(options),a=new Client(options),b=new Client(options);
  await setup.connect();let created=false;
  try{
    await setup.query(`create schema ${schema}`);created=true;
    await setup.query(`create table ${schema}.roles(id_rol uuid primary key,codigo text,estado text);
      create table ${schema}.usuarios(id_usuario uuid primary key,id_rol uuid references ${schema}.roles,
        estado text,debe_cambiar_contrasena boolean,version_sesion integer);
      create table ${schema}.effect(n integer not null);insert into ${schema}.effect values(0);`);
    await setup.query(readFileSync(path.resolve(__dirname,'../../database/init/049_financial_request_receipts.sql'),'utf8').replaceAll('temo.',schema+'.'));
    const actor={id:randomUUID(),roleCode:'CAJERO',sessionVersion:1},role=randomUUID(),requestId=randomUUID();
    await setup.query(`insert into ${schema}.roles values($1,'CAJERO','ACTIVO')`,[role]);
    await setup.query(`insert into ${schema}.usuarios values($1,$2,'ACTIVO',false,1)`,[actor.id,role]);
    await a.connect();await b.connect();
    const invoke=async(connection,id=requestId,payload={amount:10})=>{
      await connection.query('begin');
      const proxy={query:(sql,args)=>connection.query(sql.replaceAll('temo.',schema+'.'),args)};
      try{
        const value=await financialRequest(proxy,{actor,operation:'CREAR_TRANSACCIONES',requestId:id,payload,roles:['CAJERO']},async()=>{
          const result=await connection.query(`update ${schema}.effect set n=n+1 returning n`);
          await new Promise(resolve=>setTimeout(resolve,100));return {operation:result.rows[0].n,id:randomUUID()};
        },async()=>{});
        await connection.query('commit');return value;
      }catch(error){await connection.query('rollback');throw error;}
    };
    const result=await Promise.all([invoke(a),invoke(b,requestId.toUpperCase())]);
    assert.deepEqual(result[0],result[1]);
    assert.equal((await setup.query(`select n from ${schema}.effect`)).rows[0].n,1);
    assert.equal((await setup.query(`select count(*)::int as n from ${schema}.solicitudes_financieras`)).rows[0].n,1);
    await assert.rejects(invoke(a,requestId,{amount:20}),error=>error.getStatus()===409);
    assert.equal((await setup.query(`select n from ${schema}.effect`)).rows[0].n,1);
    const legitimate=await invoke(b,randomUUID());assert.equal(legitimate.operation,2);
  }finally{
    await a.end();await b.end();
    if(created)await setup.query(`drop schema ${schema} cascade`);
    await setup.end();
  }
});
