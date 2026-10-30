import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';

type CaptureStatus = {
  scope: string; startedAt: string; hasObservedGaps: boolean;
  categories: Record<string,{failed:number;overloaded:number}>;
};

export function AuditCaptureStatus({ request }: { request: <T>(path:string)=>Promise<T> }) {
  const [status,setStatus]=useState<CaptureStatus|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let mounted=true,running=false;
    const load=async()=>{
      if(running||document.hidden)return;
      running=true;
      try{
        const next=await request<CaptureStatus>('/catalogs/auditoria/estado-captura');
        if(next?.scope!=='current-process'||typeof next.startedAt!=='string'||!Number.isFinite(Date.parse(next.startedAt))
          ||typeof next.hasObservedGaps!=='boolean'||!['ACCESO_DENEGADO','LECTURA_SENSIBLE'].every(key=>{
            const row=next.categories?.[key];return row&&Number.isSafeInteger(row.failed)&&row.failed>=0&&Number.isSafeInteger(row.overloaded)&&row.overloaded>=0;
          }))throw new Error('Invalid audit status');
        if(mounted){setStatus(next);setError(false);}
      }
      catch{if(mounted)setError(true);}
      finally{running=false;}
    };
    void load();const timer=window.setInterval(()=>void load(),60000);
    const visible=()=>{if(!document.hidden)void load();};
    document.addEventListener('visibilitychange',visible);
    return()=>{mounted=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[request]);
  if(error)return <p className="audit-capture-warning" role="status"><TriangleAlert size={16}/><span>No se pudo comprobar el registro de accesos y consultas.</span></p>;
  if(!status?.hasObservedGaps)return null;
  const counts=['ACCESO_DENEGADO','LECTURA_SENSIBLE'].map(key=>status.categories[key]);
  return <p className="audit-capture-warning" role="status"><TriangleAlert size={16}/>
    <span>Registro parcial de accesos y consultas desde el reinicio de API: {counts.reduce((sum,row)=>sum+row.failed,0)} fallos y {counts.reduce((sum,row)=>sum+row.overloaded,0)} omisiones por carga.</span>
  </p>;
}
