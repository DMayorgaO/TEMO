import { ArrowRight, Clock3, LogIn, LogOut } from 'lucide-react';

export type HandoverIdentityData={sender:string;receiver:string;source:string;destination:string;mode:string;state?:string;observations?:string};

export function HandoverIdentity({value}:{value:HandoverIdentityData}) {
  return <div className="handover-identity" aria-label="Detalle del traspaso">
    <div className="handover-identity-people">
      <span><LogOut size={18} aria-hidden="true"/><span><small>Saliente</small><strong>{value.sender}</strong></span></span>
      <ArrowRight size={18} aria-hidden="true"/>
      <span><LogIn size={18} aria-hidden="true"/><span><small>Entrante</small><strong>{value.receiver}</strong></span></span>
    </div>
    <div className="handover-identity-turns"><span>{value.source} <ArrowRight size={14} aria-hidden="true"/> {value.destination}</span>
      <span><Clock3 size={14} aria-hidden="true"/>{value.state!=='CERRADO'&&value.mode==='EN_REVISION'?'Cierre en revision':'Cerrado'}</span></div>
  </div>;
}
