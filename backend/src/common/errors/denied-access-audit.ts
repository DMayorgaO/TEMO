import { isIP } from 'node:net';
import { Logger } from '@nestjs/common';
import { captureCounters, CaptureEvent } from './audit-capture-status';

type Writer = { query: (sql: string, params: unknown[]) => Promise<unknown> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class DeniedAccessAudit {
  private readonly seen = new Map<string, number>();
  private readonly inFlight = new Set<string>();
  private readonly logger = new Logger(DeniedAccessAudit.name);
  private warnedAt?: number;
  private pending = 0;

  constructor(private readonly db: Writer, private readonly event: CaptureEvent = 'ACCESO_DENEGADO') {}

  async record(userId: string, method: string, route: string, ip: string, recordId?: string) {
    const metrics = captureCounters(this.event);
    metrics.attempted++;
    if (typeof userId !== 'string' || !uuid.test(userId)
      || typeof method !== 'string' || !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method)
      || typeof route !== 'string' || route.length>200
      || route.split('/').some(segment=>uuid.test(segment))
      || !(route==='/ruta-no-identificada' || /^\/api\/(?:[A-Za-z][A-Za-z0-9_-]*|:[A-Za-z_][A-Za-z0-9_]*)(?:\/(?:[A-Za-z][A-Za-z0-9_-]*|:[A-Za-z_][A-Za-z0-9_]*))*$/.test(route))) {
      metrics.rejected++; return 'invalid';
    }
    const now = Date.now();
    for (const [key, expires] of this.seen) if (expires <= now) this.seen.delete(key);
    const target = typeof recordId==='string' && uuid.test(recordId) ? recordId : null;
    const key = `${userId.toLowerCase()}|${method}|${route}|${target?.toLowerCase() ?? ''}`;
    if (this.seen.has(key) || this.inFlight.has(key)) { metrics.grouped++; return 'grouped'; }
    if (this.pending >= 10) {
      metrics.overloaded++; metrics.lastOverloadAt=new Date(now).toISOString();
      this.warn('Registro de accesos saturado; algunos eventos no se persistieron.');
      return 'busy';
    }
    this.inFlight.add(key);
    this.pending++;
    metrics.pending++;
    const address = typeof ip==='string' ? ip.replace(/^::ffff:/, '') : '';
    try {
      const result = await this.db.query(
        `insert into temo.bitacora(id_usuario,accion,tabla,id_registro,datos_nuevos,direccion_ip)
         values($1,$7::temo.accion_bitacora,'seguridad',$1,jsonb_build_object('evento',$5::text,'metodo',$2::text,'ruta',$3::text,'registro',$6::text),$4::inet)`,
        [userId, method, route.slice(0, 200), isIP(address) ? address : null, this.event, target, this.event === 'LECTURA_SENSIBLE' ? 'CONSULTAR' : 'RECHAZAR'],
      );
      if (!result || typeof result!=='object' || !('rowCount' in result) || result.rowCount!==1) {
        throw new Error('Audit insert was not confirmed');
      }
      if (this.seen.size >= 1000) {
        const oldest = this.seen.keys().next().value;
        if (oldest!==undefined) this.seen.delete(oldest);
        metrics.cacheEvictions++;
      }
      this.seen.set(key, Date.now()+(this.event==='LECTURA_SENSIBLE'?300000:60000));
      metrics.recorded++;
      return 'recorded';
    } catch {
      metrics.failed++; metrics.lastFailureAt=new Date().toISOString();
      this.warn('No se pudo persistir un evento de auditoria de accesos.');
      return 'failed';
    } finally {
      this.pending--;
      metrics.pending--;
      this.inFlight.delete(key);
    }
  }

  private warn(message: string) {
    const now=Date.now();
    if (this.warnedAt===undefined || now-this.warnedAt>=60000) {
      this.warnedAt=now; this.logger.warn(`${this.event}: ${message}`);
    }
  }
}
