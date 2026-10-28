import { ConflictException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AuthenticatedUser } from '../modules/auth/auth.service';

// Serialize with close requests and handover proposals before inspecting their state.
export async function assertShiftNotSubmitted(client: PoolClient, shiftId: string, actor?: AuthenticatedUser) {
  if (!actor || actor.roleCode !== 'CAJERO') return;
  const shift = await client.query('select id_cajero,estado from temo.turnos where id_turno=$1 for update',[shiftId]);
  if (shift.rows[0]?.id_cajero !== actor.id) return;
  const pending = await client.query(`select 1 where
    exists(select 1 from temo.solicitudes_cierre_turno where id_turno=$1 and estado='PENDIENTE' and bloquea_cambios)
    or exists(select 1 from temo.traspasos_turno where id_turno_origen=$1 and estado='PENDIENTE' and fecha_limite>clock_timestamp())`,[shiftId]);
  if (shift.rows[0].estado === 'PENDIENTE_APROBACION' || pending.rowCount) {
    throw new ConflictException({code:'TUR-SOL-409',message:'El turno tiene una solicitud pendiente. Cancele el cierre o el traspaso antes de corregir sus datos.'});
  }
}
