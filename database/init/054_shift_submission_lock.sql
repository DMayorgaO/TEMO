begin;
alter table temo.solicitudes_cierre_turno
  add column if not exists bloquea_cambios boolean not null default false;
update temo.solicitudes_cierre_turno sc set bloquea_cambios=true
from temo.turnos t where t.id_turno=sc.id_turno and sc.estado='PENDIENTE'
  and (t.estado='PENDIENTE_APROBACION' or (t.estado='EN_REVISION' and exists(
    select 1 from temo.bitacora b where b.id_registro=t.id_turno and b.tabla='turnos'
      and b.datos_nuevos->>'evento'='SOLICITAR_CIERRE_TRAS_CORRECCIONES'
      and b.fecha_creacion>=sc.fecha_solicitud-interval '1 second'
      and b.fecha_creacion>coalesce((select max(h.fecha_resolucion) from temo.traspasos_turno h
        where h.id_turno_origen=t.id_turno and h.estado='ACEPTADO'),'-infinity'::timestamptz))));
commit;
