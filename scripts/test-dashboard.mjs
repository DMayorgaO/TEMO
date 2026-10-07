import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import pg from 'pg';
import { bankBalances, cashierCounts, filterCounts, reconciliationRows, reconciliationTotal } from '../frontend/src/components/admin-dashboard-data.ts';
const require=createRequire(import.meta.url);
const {ShiftsService}=require('../backend/dist/modules/shifts/shifts.service');
const client=new pg.Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview'});
await client.connect();
const db={query:(...args)=>client.query(...args),transaction:async work=>{
  await client.query('begin');try{const result=await work(client);await client.query('rollback');return result;}catch(error){await client.query('rollback');throw error;}
}};
try{
  const service=new ShiftsService(db);
  await assert.rejects(()=>service.dashboard({roleCode:'CAJERO'}));
  const data=await service.dashboard({roleCode:'JEFA'});
  assert.equal(new Date(`${data.from}T12:00Z`).getUTCDay(),1);
  assert.equal(new Date(`${data.to}T12:00Z`).getUTCDay(),6);
  assert.equal(new Set(data.balances.map(row=>`${row.branch_id}:${row.account_id}`)).size,data.balances.length);
  for(const row of data.counts)assert.equal(row.total,row.nio+row.usd);
  assert.equal(data.tableDay,data.today);
  for (const row of data.reconciliation) assert(data.accounts.some(account=>account.branch_id===row.branch_id&&account.entity===row.entity&&account.currency===row.currency));
  assert(data.reconciliation.some(row=>row.currency==='NIO'));
  assert(data.reconciliation.some(row=>row.currency==='USD'));
  const custom=await service.dashboard({roleCode:'JEFA'},'2026-09-01','2026-09-30');
  assert.equal(custom.from,'2026-09-01');assert.equal(custom.to,'2026-09-30');
  const selectedDay=await service.dashboard({roleCode:'JEFA'},'2026-09-01','2026-09-30','2026-10-05');
  assert.equal(selectedDay.tableDay,'2026-10-05');
  assert.equal(cashierCounts(selectedDay,filterCounts(selectedDay.counts,[],[]),selectedDay.tableDay).reduce((sum,row)=>sum+row.total,0),selectedDay.counts.filter(row=>row.day===selectedDay.tableDay).reduce((sum,row)=>sum+row.total,0));
  const expected=await client.query(`select count(*)::int as total from temo.transacciones t where estado<>'ANULADA'
    and not exists(select 1 from temo.correcciones_transacciones_cerradas h where h.id_transaccion=t.id_transaccion and h.anulada)
    and (fecha_transaccion at time zone 'America/Managua')::date between $1::date and $2::date`,[data.from,data.to]);
  assert.equal(data.counts.filter(row=>row.day>=data.from&&row.day<=data.to).reduce((sum,row)=>sum+row.total,0),expected.rows[0].total);
  console.log('PASS dashboard: authorization, real SQL, local dates, week, range, counts, shared accounts, NIO and USD');
  console.log(JSON.stringify({today:data.today,balances:data.balances.length,counts:data.counts.length}));
  await client.query('begin');
  try {
    const ids=(await client.query('select id_transaccion from temo.transacciones order by fecha_creacion limit 3')).rows.map(row=>row.id_transaccion);
    assert.equal(ids.length,3,'Requires the isolated preview seed');
    await client.query("update temo.transacciones set fecha_transaccion=now()-interval '2 days' where not(id_transaccion=any($1::uuid[]))",[ids]);
    const fixtureClient={query:(sql,params)=>sql.startsWith('set transaction isolation')?Promise.resolve({rows:[]}):client.query(sql,params)};
    for(const [index,entity,currency,direction,amount] of [[0,'PEX','NIO','ENTRA',180],[1,'PEX','USD','ENTRA',50],[2,'TELEDOLAR','USD','SALE',80]]){
      const movement=(await client.query(`select cm.id_cuenta_movimiento,m.id_moneda from temo.cuentas_movimientos cm
        join temo.cuentas_bancarias cb using(id_cuenta) join temo.entidades_bancarias e using(id_entidad)
        join temo.monedas m using(id_moneda) join temo.efectos_movimientos ef using(id_cuenta_movimiento)
        where e.codigo=$1 and m.codigo=$2 and ef.direccion_efectivo=$3 and cb.estado='ACTIVO' limit 1`,[entity,currency,direction])).rows[0];
      assert(movement,`Missing fixture movement ${entity} ${currency}`);
      await client.query(`update temo.transacciones set id_cuenta_movimiento=$2,id_moneda_original=$3,monto_original=$4,fecha_transaccion=now(),estado='REGISTRADA' where id_transaccion=$1`,[ids[index],movement.id_cuenta_movimiento,movement.id_moneda,amount]);
    }
    const fixtureService=new ShiftsService({query:(...args)=>fixtureClient.query(...args),transaction:work=>work(fixtureClient)});
    const fixture=await fixtureService.dashboard({roleCode:'JEFA'});
    assert.equal(fixture.reconciliation.reduce((sum,row)=>sum+(row.entity==='PEX'&&row.currency==='NIO'?Number(row.income):0),0),180);
    const total=reconciliationTotal(reconciliationRows(fixture.reconciliation));
    assert.equal(total.amounts.USD.difference,-30);
    assert.equal(total.amounts.NIO.difference,180);
    const all=filterCounts(fixture.counts,[],[]).filter(row=>row.day===fixture.today);
    assert.equal(cashierCounts(fixture,all,fixture.today).reduce((sum,row)=>sum+row.total,0),3);
    assert.equal(filterCounts(all,['PEX'],[]).reduce((sum,row)=>sum+row.total,0),2);
    assert.equal(filterCounts(all,['PEX','TELEDOLAR'],['USD']).reduce((sum,row)=>sum+row.total,0),2);
    assert.equal(filterCounts(all,[],['NIO']).reduce((sum,row)=>sum+row.total,0),1);
    assert.equal(filterCounts(all,[],['NIO','USD']).reduce((sum,row)=>sum+row.total,0),3);
    const pexUsd=fixture.accounts.find(row=>row.entity==='PEX'&&row.currency==='USD');
    assert(pexUsd);
    await client.query("update temo.cuentas_bancarias set estado='INACTIVO' where id_cuenta=$1",[pexUsd.account_id]);
    const inactive=await fixtureService.dashboard({roleCode:'JEFA'});
    assert(!inactive.accounts.some(row=>row.account_id===pexUsd.account_id));
    assert(!inactive.reconciliation.some(row=>row.branch_id===pexUsd.branch_id&&row.entity==='PEX'&&row.currency==='USD'));
    console.log('PASS selected date, shared table/chart bank and currency filters, active account scopes, two-currency totals');
    const balance=(await client.query(`select stc.id_turno,stc.id_cuenta from temo.saldos_turno_cuentas stc
      join temo.cuentas_bancarias cb using(id_cuenta) join temo.entidades_bancarias e using(id_entidad)
      where e.codigo='PEX' limit 1`)).rows[0];
    assert(balance);
    await client.query(`update temo.saldos_turno_cuentas set saldo_inicial=-500,saldo_final_calculado=-500,saldo_final_sistema=-500 where id_turno=$1 and id_cuenta=$2`,[balance.id_turno,balance.id_cuenta]);
    const negative=await fixtureService.dashboard({roleCode:'JEFA'});
    assert.equal(Number(negative.balances.find(row=>row.account_id===balance.id_cuenta).system),-500);
    assert.equal(bankBalances(negative).find(row=>row.entity==='PEX').amounts.NIO,-500);
    await client.query(`update temo.turnos set estado='CERRADO',fecha_cierre=now() where id_turno=$1`,[balance.id_turno]);
    await client.query(`update temo.saldos_turno_cuentas set saldo_final_sistema=-600 where id_turno=$1 and id_cuenta=$2`,[balance.id_turno,balance.id_cuenta]);
    const closed=await fixtureService.dashboard({roleCode:'JEFA'});
    assert.equal(Number(closed.balances.find(row=>row.account_id===balance.id_cuenta).system),-600);
    console.log('PASS negative balances and saved closing fallback');
    console.log('PASS fixture: PEX NIO +180; PEX USD 50 - Teledolar payments 80 = -30; fixtures rolled back');
  } finally { await client.query('rollback'); }
}finally{await client.end();}
