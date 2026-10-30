export type CaptureEvent = 'ACCESO_DENEGADO' | 'LECTURA_SENSIBLE';
type Counters = {
  attempted: number; recorded: number; grouped: number; rejected: number; overloaded: number;
  failed: number; pending: number; cacheEvictions: number; lastFailureAt: string | null; lastOverloadAt: string | null;
};
const startedAt = new Date().toISOString();
const empty = (): Counters => ({attempted:0,recorded:0,grouped:0,rejected:0,overloaded:0,failed:0,pending:0,
  cacheEvictions:0,lastFailureAt:null,lastOverloadAt:null});
const counters: Record<CaptureEvent,Counters> = {ACCESO_DENEGADO:empty(),LECTURA_SENSIBLE:empty()};

export function captureCounters(event: CaptureEvent) { return counters[event]; }

export function auditCaptureStatus() {
  const categories = {ACCESO_DENEGADO:{...counters.ACCESO_DENEGADO},LECTURA_SENSIBLE:{...counters.LECTURA_SENSIBLE}};
  return {scope:'current-process',startedAt,hasObservedGaps:Object.values(categories).some(row=>row.failed>0||row.overloaded>0),categories};
}
