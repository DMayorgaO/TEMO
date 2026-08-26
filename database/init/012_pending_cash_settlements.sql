-- TEMO - Liquidacion de pendientes con arqueo y notificaciones.
-- Conserva el pago separado de la transaccion original y admite abonos futuros.

SET search_path TO temo, public;

ALTER TYPE tipo_arqueo ADD VALUE IF NOT EXISTS 'PENDIENTE_RECIBIDO';
ALTER TYPE tipo_arqueo ADD VALUE IF NOT EXISTS 'PENDIENTE_ENTREGADO';
ALTER TYPE tipo_arqueo ADD VALUE IF NOT EXISTS 'PENDIENTE_VUELTO';

BEGIN;

ALTER TABLE abonos_pendientes
  DROP CONSTRAINT IF EXISTS abonos_pendientes_id_transaccion_key;

ALTER TABLE abonos_pendientes
  ADD COLUMN IF NOT EXISTS id_turno_aplicacion UUID REFERENCES turnos(id_turno),
  ADD COLUMN IF NOT EXISTS id_tipo_cambio UUID REFERENCES tipos_cambio(id_tipo_cambio),
  ADD COLUMN IF NOT EXISTS tasa_compra_usada NUMERIC(14, 6),
  ADD COLUMN IF NOT EXISTS tasa_venta_usada NUMERIC(14, 6);

ALTER TABLE arqueos
  ADD COLUMN IF NOT EXISTS id_abono_pendiente UUID
    REFERENCES abonos_pendientes(id_abono) ON DELETE CASCADE;

ALTER TABLE arqueos DROP CONSTRAINT IF EXISTS ck_arqueos_alcance;
ALTER TABLE arqueos
  ADD CONSTRAINT ck_arqueos_alcance CHECK (
    num_nonnulls(id_turno, id_jornada, id_grupo_transacciones, id_abono_pendiente) = 1
  );

ALTER TABLE arqueos DROP CONSTRAINT IF EXISTS ck_arqueos_transaccion;
ALTER TABLE arqueos
  ADD CONSTRAINT ck_arqueos_transaccion CHECK (
    (
      tipo IN ('TRANSACCION_RECIBIDO', 'TRANSACCION_ENTREGADO', 'TRANSACCION_VUELTO')
      AND id_grupo_transacciones IS NOT NULL
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
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_arqueos_abono_tipo_moneda
  ON arqueos(id_abono_pendiente, tipo, id_moneda)
  WHERE id_abono_pendiente IS NOT NULL;

ALTER TABLE movimientos_efectivo
  ADD COLUMN IF NOT EXISTS id_abono_pendiente UUID
    REFERENCES abonos_pendientes(id_abono);

ALTER TABLE movimientos_efectivo
  DROP CONSTRAINT IF EXISTS movimientos_efectivo_id_abono_pendiente_fkey;
ALTER TABLE movimientos_efectivo
  ADD CONSTRAINT movimientos_efectivo_id_abono_pendiente_fkey
  FOREIGN KEY (id_abono_pendiente)
  REFERENCES abonos_pendientes(id_abono) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_movimientos_efectivo_abono
  ON movimientos_efectivo(id_abono_pendiente)
  WHERE id_abono_pendiente IS NOT NULL;

CREATE TABLE IF NOT EXISTS notificaciones_usuarios (
  id_notificacion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario_destino UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  tipo VARCHAR(40) NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  mensaje TEXT NOT NULL,
  id_pendiente UUID REFERENCES pagos_pendientes(id_pendiente) ON DELETE CASCADE,
  id_turno UUID REFERENCES turnos(id_turno) ON DELETE CASCADE,
  id_usuario_origen UUID REFERENCES usuarios(id_usuario),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_lectura TIMESTAMPTZ,
  CONSTRAINT ck_notificaciones_tipo CHECK (tipo IN ('PENDIENTE_PAGADO'))
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuarios_pendientes
  ON notificaciones_usuarios(id_usuario_destino, fecha_creacion)
  WHERE fecha_lectura IS NULL;

COMMENT ON TABLE abonos_pendientes IS
  'Liquidaciones parciales o totales aplicadas a una cuenta pendiente.';
COMMENT ON COLUMN abonos_pendientes.id_turno_aplicacion IS
  'Turno activo cuyo arqueo recibio el efecto del pago; puede ser nulo.';
COMMENT ON COLUMN arqueos.id_abono_pendiente IS
  'Abono que origino el conteo fisico recibido, entregado o devuelto.';

COMMIT;
