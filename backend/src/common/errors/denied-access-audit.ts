import { isIP } from 'node:net';

type Writer = { query: (sql: string, params: unknown[]) => Promise<unknown> };

export class DeniedAccessAudit {
  private readonly seen = new Map<string, number>();
  private pending = 0;

  constructor(private readonly db: Writer, private readonly event: 'ACCESO_DENEGADO' | 'LECTURA_SENSIBLE' = 'ACCESO_DENEGADO') {}

  async record(userId: string, method: string, route: string, ip: string, recordId?: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) || !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method)) return;
    const now = Date.now();
    for (const [key, expires] of this.seen) if (expires <= now) this.seen.delete(key);
    const target = recordId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId) ? recordId : null;
    const key = `${userId}|${method}|${route}|${target ?? ''}`;
    if (this.seen.has(key) || this.seen.size >= 1000 || this.pending >= 10) return;
    this.seen.set(key, now + (this.event === 'LECTURA_SENSIBLE' ? 300000 : 60000));
    this.pending++;
    const address = ip.replace(/^::ffff:/, '');
    try {
      await this.db.query(
        `insert into temo.bitacora(id_usuario,accion,tabla,id_registro,datos_nuevos,direccion_ip)
         values($1,$7::temo.accion_bitacora,'seguridad',$1,jsonb_build_object('evento',$5::text,'metodo',$2::text,'ruta',$3::text,'registro',$6::text),$4::inet)`,
        [userId, method, route.slice(0, 200), isIP(address) ? address : null, this.event, target, this.event === 'LECTURA_SENSIBLE' ? 'CONSULTAR' : 'RECHAZAR'],
      );
    } finally {
      this.pending--;
    }
  }
}
