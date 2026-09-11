-- TEMO - Arqueos independientes para cada transaccion de un grupo.

SET search_path TO temo, public;

BEGIN;

ALTER TABLE arqueos
  ADD COLUMN IF NOT EXISTS id_transaccion UUID
    REFERENCES transacciones(id_transaccion) ON DELETE CASCADE;

DROP INDEX IF EXISTS uq_arqueos_transaccion_tipo_moneda;
CREATE UNIQUE INDEX uq_arqueos_transaccion_tipo_moneda
  ON arqueos(id_transaccion, tipo, id_moneda)
  WHERE id_transaccion IS NOT NULL;

ALTER TABLE arqueos DROP CONSTRAINT IF EXISTS ck_arqueos_alcance;
ALTER TABLE arqueos
  ADD CONSTRAINT ck_arqueos_alcance CHECK (
    num_nonnulls(id_turno, id_jornada, id_grupo_transacciones, id_abono_pendiente, id_transaccion) = 1
  );

ALTER TABLE arqueos DROP CONSTRAINT IF EXISTS ck_arqueos_transaccion;
ALTER TABLE arqueos
  ADD CONSTRAINT ck_arqueos_transaccion CHECK (
    (
      tipo IN ('TRANSACCION_RECIBIDO', 'TRANSACCION_ENTREGADO', 'TRANSACCION_VUELTO')
      AND num_nonnulls(id_grupo_transacciones, id_transaccion) = 1
      AND id_abono_pendiente IS NULL
      AND monto_esperado IS NOT NULL
      AND tipo_tasa IS NOT NULL
      AND tasa_usada IS NOT NULL
    )
    OR
    (
      tipo IN ('PENDIENTE_RECIBIDO', 'PENDIENTE_ENTREGADO', 'PENDIENTE_VUELTO')
      AND id_abono_pendiente IS NOT NULL
      AND id_grupo_transacciones IS NULL
      AND id_transaccion IS NULL
      AND monto_esperado IS NOT NULL
      AND tipo_tasa IS NOT NULL
      AND tasa_usada IS NOT NULL
    )
    OR
    (
      tipo NOT IN (
        'TRANSACCION_RECIBIDO', 'TRANSACCION_ENTREGADO', 'TRANSACCION_VUELTO',
        'PENDIENTE_RECIBIDO', 'PENDIENTE_ENTREGADO', 'PENDIENTE_VUELTO'
      )
      AND id_grupo_transacciones IS NULL
      AND id_abono_pendiente IS NULL
      AND id_transaccion IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_arqueos_transaccion
  ON arqueos(id_transaccion)
  WHERE id_transaccion IS NOT NULL;

COMMENT ON COLUMN arqueos.id_transaccion IS
  'Transaccion propietaria del arqueo independiente dentro de un grupo.';

COMMIT;
