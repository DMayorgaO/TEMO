import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { withNioCentCoins } from '../utils/nio-cent-coins';
import { ArrowRightLeft, Check, ClipboardCheck, X } from 'lucide-react';

type Snapshot = {
  counts: Record<'NIO'|'USD',Array<{denomination:number;piles25:number;loose:number}>>;
  totals: {NIO:number;USD:number};
  balances: Array<{account_id:string;account:string;currency:string;entity:string;system:string;system_income:string|null;system_expense:string|null;calculated?:string;income?:string;expense?:string}>;
  hasDifferences:boolean;
  cashDifference?:number;pendingCashDifference?:number;changeNio?:string;
  summary?:{expectedGeneralRate:number;expectedGeneral:{NIO:number;USD:number}};
  dollarPurchases?:{usd:number;differenceNio:number};
  accountDifferences?:Array<{accountId:string;account:string;currency:string;field:string;difference:number}>;
  identity?:{shiftCode:string;branch:string;register:string;sender:string};
};
type Handover = {id_traspaso:string;id_emisor:string;id_receptor:string;estado:string;emisor:string;receptor:string;
  turno_origen:string;sucursal:string;caja:string;fecha_limite:string;resumen:Snapshot;observaciones?:string;modo?:'CON_CIERRE'|'EN_REVISION'};
type Request = <T>(path:string,init?:RequestInit)=>Promise<T>;
const money=(value:number|string,currency:string)=>`${currency==='NIO'?'C$':'$'} ${Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const optionalMoney=(value:number|string|undefined,currency='NIO')=>value===undefined?'—':money(value,currency);

function Difference({value,currency='NIO'}:{value?:number;currency?:string}) {
  const zero=value!==undefined&&Math.abs(value)<.005;
  return <span className={`handover-difference ${value===undefined||zero?'':Number(value)>0?'handover-difference--positive':'handover-difference--negative'}`}>
    {value===undefined?'—':zero?'---':money(value,currency)}
  </span>;
}

function CashTable({currency,snapshot}:{currency:'NIO'|'USD';snapshot:Snapshot}) {
  return <section className={`handover-cash-card handover-cash-card--${currency.toLowerCase()}`}>
    <header><strong>Arqueo en {currency==='NIO'?'Córdobas (NIO)':'Dólares (USD)'}</strong><strong>{money(snapshot.totals[currency],currency)}</strong></header>
    <table><colgroup><col/><col/><col/><col/><col/></colgroup>
      <thead><tr><th>×25</th><th>Sueltos</th><th>Cantidad</th><th>Denominación</th><th>Monto</th></tr></thead>
      <tbody>{withNioCentCoins(currency,snapshot.counts[currency]).map(line=><tr key={line.denomination}><td>{line.piles25}</td><td>{line.loose}</td><td>{line.piles25*25+line.loose}</td><td>{money(line.denomination,currency)}</td><td>{money(line.denomination*(line.piles25*25+line.loose),currency)}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={4}>Total contado</td><td>{money(snapshot.totals[currency],currency)}</td></tr></tfoot>
    </table>
  </section>;
}

function BalanceTables({snapshot}:{snapshot:Snapshot}) {
  return <section className="shift-close-balances"><h3>Saldos de cuentas de la sucursal</h3><div className="shift-close-balance-tables">
    {(['NIO','USD']as const).map(currency=><section key={currency} className={`shift-close-balance-card shift-close-balance-card--${currency.toLowerCase()}`}>
      <header>Saldos en {currency==='NIO'?'Córdobas (NIO)':'Dólares (USD)'}</header>
      <table><colgroup><col style={{width:'34%'}}/><col style={{width:'22%'}}/><col style={{width:'22%'}}/><col style={{width:'22%'}}/></colgroup>
        <thead><tr><th>Banco / Cuenta</th><th>Calculado</th><th>Sistema</th><th>Diferencia</th></tr></thead>
        <tbody>{!snapshot.balances.some(row=>row.currency===currency)&&<tr><td colSpan={4}>Sin cuentas en esta moneda.</td></tr>}{snapshot.balances.filter(row=>row.currency===currency).flatMap(row=>{
          const fields=row.entity==='TELEDOLAR'
            ? [{field:'Pagos',system:row.system_income??undefined,calculated:row.income},{field:'Envíos',system:row.system_expense??undefined,calculated:row.expense}]
            : [{field:'',system:row.system,calculated:row.calculated}];
          return fields.map(field=><tr key={`${row.account_id}:${field.field}`}>
            <td><strong>{row.entity}{field.field?` · ${field.field}`:''}</strong><small>{row.account}</small></td>
            <td>{optionalMoney(field.calculated,currency)}</td><td>{optionalMoney(field.system,currency)}</td>
            <td><Difference value={field.system===undefined||field.calculated===undefined?undefined:Number(field.system)-Number(field.calculated)} currency={currency}/></td>
          </tr>);
        })}</tbody>
      </table>
    </section>)}
  </div></section>;
}

export function ShiftHandovers({userId,shiftId,request,prepare,onChanged,onOpenChange,onRegistered}:{userId:string;shiftId?:string;request:Request;prepare?:()=>Promise<void>;onChanged:()=>void;onOpenChange?:(open:boolean)=>void;onRegistered?:(value:string)=>void}) {
  const [items,setItems]=useState<Handover[]>([]);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [observations,setObservations]=useState('');
  const [candidates,setCandidates]=useState<Array<{id:string;nombre:string}>>([]);
  const [receiver,setReceiver]=useState('');
  const [preview,setPreview]=useState<{snapshot:Snapshot;version:string}|null>(null);
  const [reviewing,setReviewing]=useState<Handover|null>(null);
  const dialogRef=useRef<HTMLElement>(null);
  const busyRef=useRef(false);busyRef.current=busy;
  const requestId=useRef('');
  const mounted=useRef(true);
  const current=items.find(item=>item.id_receptor===userId)||items.find(item=>item.id_emisor===userId)||(open?reviewing:null);
  useEffect(()=>{onOpenChange?.(open);return()=>onOpenChange?.(false);},[open,onOpenChange]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keyboard=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!busyRef.current){event.preventDefault();setOpen(false);}
      if(event.key!=='Tab')return;
      const fields=[...dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')||[]];
      if(!fields.length){event.preventDefault();return;}
      if(event.shiftKey&&document.activeElement===fields[0]){event.preventDefault();fields[fields.length-1]?.focus();}
      else if(!event.shiftKey&&document.activeElement===fields[fields.length-1]){event.preventDefault();fields[0].focus();}
    };
    document.addEventListener('keydown',keyboard);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',keyboard);if(previous?.isConnected)previous.focus();};
  },[open]);
  useEffect(()=>{
    mounted.current=true;
    let running=false;
    const load=async()=>{
      if (running || document.visibilityState==='hidden') return;
      running=true;
      try {const data=await request<Handover[]>('/shifts/handovers');if(mounted.current)setItems(data);}
      catch { /* Mantiene el resumen visible durante interrupciones de red. */ }
      finally {running=false;}
    };
    void load();const timer=setInterval(()=>void load(),5000);
    return()=>{mounted.current=false;clearInterval(timer);};
  },[request,userId]);

  async function show() {
    setOpen(true);setError('');setPreview(null);setBusy(true);setObservations('');
    try {
      const latest=await request<Handover[]>('/shifts/handovers');setItems(latest);
      const pending=latest.find(item=>item.id_emisor===userId||item.id_receptor===userId);
      setReviewing(pending||null);
      if(pending)return;
      if(!shiftId)return;
      await prepare?.();
      const [data,available]=await Promise.all([
        request<{snapshot:Snapshot;version:string;requestId:string}>(`/shifts/${shiftId}/handover-preview`),
        request<Array<{id:string;nombre:string}>>(`/shifts/${shiftId}/handover-candidates`),
      ]);
      setPreview(data);setCandidates(available);setReceiver('');requestId.current=data.requestId;
    }catch(failure){setError(failure instanceof Error?failure.message:'No fue posible preparar el traspaso.');}
    finally{setBusy(false);}
  }
  async function run(action:'send'|'accept'|'reject'|'cancel'|'register',mode:'CON_CIERRE'|'EN_REVISION'='CON_CIERRE') {
    if(busy)return;setBusy(true);setError('');
    try{
      if(action==='register'&&shiftId){
        const data=await request<{snapshot:Snapshot;version:string;requestId:string}>(`/shifts/${shiftId}/handover-difference`,{method:'POST',body:JSON.stringify({expectedVersion:preview?.version})});
        setPreview(data);requestId.current=data.requestId;onRegistered?.(data.snapshot.changeNio||'0');return;
      }else if(action==='send'){
        await request(`/shifts/${shiftId}/handovers`,{method:'POST',body:JSON.stringify({requestId:requestId.current,receiverId:receiver,expectedVersion:preview?.version,observations,mode})});
      }else if(current){await request(`/shifts/handovers/${current.id_traspaso}/${action}`,{method:'POST'});}
      const latest=await request<Handover[]>('/shifts/handovers');setItems(latest);
      setOpen(false);onChanged();
    }catch(failure){setError(failure instanceof Error?failure.message:'No se pudo completar el traspaso.');}
    finally{setBusy(false);}
  }
  const snapshot=current?.resumen||preview?.snapshot;
  const identity=current?{shiftCode:current.turno_origen,branch:current.sucursal,register:current.caja,sender:current.emisor}:snapshot?.identity;
  const rate=snapshot?.summary?.expectedGeneralRate;
  const cashDifference=snapshot?.pendingCashDifference;
  const registered=snapshot?.changeNio;
  return <>
    {(shiftId||current)&&<button type="button" className="secondary-button" onClick={()=>void show()}><ArrowRightLeft size={17}/>{current?(current.id_receptor===userId?'Revisar traspaso':'Traspaso pendiente'):'Traspaso'}</button>}
    {open&&createPortal(<div className="modal-backdrop"><section ref={dialogRef} className={`shift-close-modal handover-dialog${current?.id_receptor===userId?' handover-dialog--receipt':''}`} role="dialog" aria-modal="true" aria-labelledby="handover-title">
      <header className="modal-header"><div><p>{identity?`${identity.shiftCode} · ${identity.sender}${current?` → ${current.receptor}`:''}`:'Entrega y recepción de caja'}</p><h2 id="handover-title">Traspaso de turno</h2></div><button type="button" className="icon-button close-button" title="Cerrar" aria-label="Cerrar traspaso" disabled={busy} onClick={()=>setOpen(false)}><X size={18}/></button></header>
      <div className="shift-close-body">
      {identity&&<div className="shift-close-summary shift-close-summary--identity"><label>ID<strong>{identity.shiftCode}</strong></label><label>Sucursal<strong>{identity.branch}</strong></label><label>Caja<strong>{identity.register}</strong></label><label>Cajero saliente<strong>{identity.sender}</strong></label></div>}
      {current&&<p className="handover-recipient"><strong>{current.emisor} → {current.receptor}</strong><span>Vence: {new Date(current.fecha_limite).toLocaleTimeString('es-NI',{timeZone:'America/Managua'})}</span></p>}
      {current?.modo==='EN_REVISION'&&<p className="handover-review-warning">Al aceptar, recibirá un turno nuevo. El turno anterior quedará en revisión para cierre por un Administrador.</p>}
      {busy&&<p role="status">Procesando...</p>}
      {error&&<p className="login-error" role="alert">{error}</p>}
      {snapshot&&<>
        <div className="handover-cash-grid"><CashTable currency="NIO" snapshot={snapshot}/><div className="cash-count-right-column"><CashTable currency="USD" snapshot={snapshot}/>
          <dl className="handover-reconciliation">
            <div><dt>Diferencia NIO</dt><dd><Difference value={cashDifference}/></dd></div>
            <div><dt>Diferencia USD</dt><dd><Difference value={rate===undefined||cashDifference===undefined?undefined:cashDifference/rate} currency="USD"/></dd></div>
            <div><dt>Diferencia registrada</dt><dd>{optionalMoney(registered)}</dd></div>
            <div className="handover-purchase-difference"><dt>Diferencia acumulada por compra de dólares</dt><dd>{optionalMoney(snapshot.dollarPurchases?.differenceNio)}</dd></div>
          </dl>
          {!current&&<button type="button" className="secondary-button" disabled={busy||cashDifference===undefined||Math.abs(cashDifference)<.005} onClick={()=>void run('register')}><ClipboardCheck size={17}/>Registrar diferencia</button>}
        </div></div>
        <BalanceTables snapshot={snapshot}/>
        {snapshot.hasDifferences&&<div className="handover-review-warning"><strong>El receptor debe revisar y confirmar los valores entregados.</strong><ul>
          {cashDifference!==undefined&&Math.abs(cashDifference)>=.005&&<li>{cashDifference>0?'Sobrante':'Faltante'} de efectivo: {money(Math.abs(cashDifference),'NIO')}.</li>}
          {Boolean(snapshot.accountDifferences?.length)&&<li>Hay diferencias en {new Set(snapshot.accountDifferences?.map(row=>row.accountId)).size} cuenta(s); se detallan en las tablas de saldos.</li>}
        </ul></div>}
      </>}
      {!current&&preview&&<label className="form-field">Cajero receptor<select value={receiver} disabled={busy} onChange={event=>setReceiver(event.target.value)}><option value="">{candidates.length?'Seleccionar cajero':'No hay cajeros disponibles'}</option>{candidates.map(item=><option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>}
      {current?<div className="handover-observations"><strong>Observaciones</strong><p>{current.observaciones||'Sin observaciones'}</p></div>:<label className="form-field">Observaciones<textarea rows={2} maxLength={2000} value={observations} disabled={busy} onChange={event=>setObservations(event.target.value)}/></label>}
      </div><footer className="modal-footer">
        {current?(current.id_receptor===userId?<><button type="button" className="secondary-button danger-button" disabled={busy} onClick={()=>void run('reject')}><X size={17}/>Rechazar</button><button type="button" className="primary-button" disabled={busy} onClick={()=>void run('accept')}><Check size={17}/>Aceptar traspaso</button></>:<button type="button" className="secondary-button danger-button" disabled={busy} onClick={()=>void run('cancel')}><X size={17}/>Cancelar traspaso</button>):<>
          <button type="button" className="secondary-button" disabled={busy||!receiver||!preview} onClick={()=>void run('send','EN_REVISION')}><ArrowRightLeft size={17}/>Traspasar en revisión</button>
          <button type="button" className="primary-button" disabled={busy||!receiver||!preview} onClick={()=>void run('send')}><Check size={17}/>Traspasar y cerrar</button>
        </>}
      </footer>
    </section></div>,document.body)}
  </>;
}
