import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { isIP } from 'node:net';
import { z } from 'zod';
import { AuthenticatedUser } from '../modules/auth/auth.service';
import { DatabaseService } from '../modules/database/database.service';

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
  if (user.roleCode !== 'JEFA' && (administrative || user.roleCode !== 'CAJERO')) {
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
  const ip = (request.ip ?? '').replace(/^::ffff:/, '');
  // Fail closed: no export dataset is returned if its audit record cannot be stored.
  await db.query(`insert into temo.bitacora(id_usuario,accion,tabla,id_registro,datos_nuevos,direccion_ip)
    values($1,'EXPORTAR','seguridad',$1,jsonb_build_object('evento','EXPORTACION_AUTORIZADA',
    'formato',$2::text,'apartado',$3::text,'filas_verificadas',$4::integer),$5::inet)`,
  [request.user.id, format, section, count, isIP(ip) ? ip : null]);
}
