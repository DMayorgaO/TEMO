import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { isIP } from 'node:net';
import { z } from 'zod';
import { AuthenticatedUser } from '../modules/auth/auth.service';
import { DatabaseService } from '../modules/database/database.service';
import { requireSessionVersion } from './session-version';

export const exportSelectionSchema = z.object({
  format: z.enum(['EXCEL', 'PDF']),
  ids: z.array(z.string().uuid()).max(5000).refine(ids => new Set(ids).size === ids.length),
}).strict();

export function parseExportSelection(body: unknown) {
  const result = exportSelectionSchema.safeParse(body);
  if (!result.success) throw new BadRequestException('Seleccione hasta 5000 registros distintos por exportacion.');
  return result.data;
}

export function requireExportRole(user: AuthenticatedUser, administrative = false) {
  if (user.mustChangePassword || (user.roleCode !== 'JEFA' && (administrative || user.roleCode !== 'CAJERO'))) {
    throw new ForbiddenException('No tiene permiso para esta exportacion.');
  }
}

export async function authorizedExport<T>(db: DatabaseService, request: { user: AuthenticatedUser; ip?: string },
  section: string, input: { format: 'EXCEL' | 'PDF'; ids: string[] }, rows: T[], idOf: (row: T) => string) {
  const available = new Map(rows.map(row => [idOf(row), row]));
  if (input.ids.some(id => !available.has(id))) {
    throw new ForbiddenException('Uno o mas registros ya no estan disponibles para exportar. Actualice la tabla.');
  }
  const selected = input.ids.map(id => available.get(id)!);
  await recordAuthorizedExport(db, request, section, input.format, selected.length);
  return selected;
}

export async function recordAuthorizedExport(db: DatabaseService, request: { user: AuthenticatedUser; ip?: string },
  section: string, format: 'EXCEL' | 'PDF' | 'PNG', count: number) {
  return recordExportEvent(db, request, section, format, count, false);
}

export async function recordRequestedExport(db: DatabaseService, request: { user: AuthenticatedUser; ip?: string },
  section: string, format: 'EXCEL' | 'PDF' | 'PNG', count: number) {
  return recordExportEvent(db, request, section, format, count, true);
}

async function recordExportEvent(db: DatabaseService, request: { user: AuthenticatedUser; ip?: string },
  section: string, format: 'EXCEL' | 'PDF' | 'PNG', count: number, requested: boolean) {
  requireExportRole(request.user, !['Transacciones', 'Turnos'].includes(section));
  const version = requireSessionVersion(request.user.sessionVersion);
  const ip = (request.ip ?? '').replace(/^::ffff:/, '');
  // Current identity and mandatory audit share one SQL statement and actor lock.
  const result = await db.query(`with export_actor as (
      select u.id_usuario from temo.usuarios u join temo.roles r using(id_rol)
      where u.id_usuario=$1 and u.estado='ACTIVO' and r.estado='ACTIVO'
        and r.codigo=$6 and not u.debe_cambiar_contrasena and u.version_sesion=$7::integer
      for share of u,r
    )
    insert into temo.bitacora(id_usuario,accion,tabla,id_registro,datos_nuevos,direccion_ip)
    select id_usuario,'EXPORTAR','seguridad',id_usuario,
      jsonb_build_object('evento','${requested ? 'EXPORTACION_SOLICITADA' : 'EXPORTACION_AUTORIZADA'}',
      'formato',$2::text,'apartado',$3::text,'${requested ? 'filas_declaradas' : 'filas_verificadas'}',$4::integer),$5::inet
    from export_actor returning id_usuario`,
  [request.user.id, format, section, count, isIP(ip) ? ip : null, request.user.roleCode, version]);
  if (result.rowCount !== 1) {
    throw new ForbiddenException('Su sesion o acceso cambio. Inicie sesion nuevamente antes de exportar.');
  }
}
