-- Replace only the exact system-generated prefix; preserve all user observations.
with labels as (
  select h.id_turno_origen, h.id_turno_destino,
    format('Traspaso %s; emisor %s; receptor %s. ',h.id_traspaso,h.id_emisor,h.id_receptor) as old_prefix,
    format('Traspaso del turno TUR-%s: %s entrega a %s. ',
      lpad(t.codigo_turno::text,6,'0'),sender.nombre_completo,receiver.nombre_completo) as new_prefix
  from temo.traspasos_turno h
  join temo.turnos t on t.id_turno=h.id_turno_origen
  join temo.usuarios sender on sender.id_usuario=h.id_emisor
  join temo.usuarios receiver on receiver.id_usuario=h.id_receptor
  where h.estado='ACEPTADO'
), replacements as (
  select t.id_turno,
    case when starts_with(t.observaciones_cierre,outgoing.old_prefix)
      then outgoing.new_prefix || substr(t.observaciones_cierre,length(outgoing.old_prefix)+1)
      else t.observaciones_cierre end as closing,
    case when starts_with(t.observaciones_apertura,incoming.old_prefix)
      then incoming.new_prefix || substr(t.observaciones_apertura,length(incoming.old_prefix)+1)
      else t.observaciones_apertura end as opening
  from temo.turnos t
  left join labels outgoing on outgoing.id_turno_origen=t.id_turno
  left join labels incoming on incoming.id_turno_destino=t.id_turno
  where starts_with(t.observaciones_cierre,outgoing.old_prefix)
    or starts_with(t.observaciones_apertura,incoming.old_prefix)
), updated_notes as (
  update temo.turnos t set observaciones_cierre=r.closing,observaciones_apertura=r.opening
  from replacements r where t.id_turno=r.id_turno
)
update temo.solicitudes_cierre_turno sc
set observaciones_cierre=l.new_prefix || substr(sc.observaciones_cierre,length(l.old_prefix)+1)
from labels l where sc.id_turno=l.id_turno_origen and starts_with(sc.observaciones_cierre,l.old_prefix);
