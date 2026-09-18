SET search_path TO temo, public;

-- Relaciona los avisos con la transferencia que afecto el turno del cajero.
ALTER TABLE notificaciones_usuarios
  ADD COLUMN IF NOT EXISTS id_transferencia UUID
  REFERENCES transferencias(id_transferencia) ON DELETE CASCADE;

-- Amplia los tipos permitidos sin alterar los avisos de pendientes existentes.
ALTER TABLE notificaciones_usuarios
  DROP CONSTRAINT IF EXISTS ck_notificaciones_tipo;

ALTER TABLE notificaciones_usuarios
  ADD CONSTRAINT ck_notificaciones_tipo
  CHECK (tipo IN ('PENDIENTE_PAGADO', 'TRANSFERENCIA_REGISTRADA'));

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuarios_transferencia
  ON notificaciones_usuarios(id_transferencia)
  WHERE id_transferencia IS NOT NULL;

