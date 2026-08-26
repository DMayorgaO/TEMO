-- TEMO - Saldos bancarios de apertura y cierre por turno.
-- Cada cuenta aparece una sola vez por turno; la moneda y entidad se obtienen
-- desde cuentas_bancarias para evitar duplicacion de catalogos.

SET search_path TO temo, public;

CREATE TABLE IF NOT EXISTS saldos_turno_cuentas (
  id_saldo_turno UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_turno UUID NOT NULL
    REFERENCES turnos(id_turno) ON DELETE CASCADE,
  id_cuenta UUID NOT NULL
    REFERENCES cuentas_bancarias(id_cuenta),
  saldo_inicial NUMERIC(16, 4) NOT NULL DEFAULT 0,
  saldo_final_calculado NUMERIC(16, 4),
  saldo_final_sistema NUMERIC(16, 4),
  diferencia NUMERIC(16, 4)
    GENERATED ALWAYS AS (
      saldo_final_sistema - saldo_final_calculado
    ) STORED,
  fecha_registro_apertura TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_registro_cierre TIMESTAMPTZ,
  CONSTRAINT uq_saldos_turno_cuenta UNIQUE (id_turno, id_cuenta),
  CONSTRAINT ck_saldos_turno_inicial CHECK (saldo_inicial >= 0),
  CONSTRAINT ck_saldos_turno_final_calculado CHECK (
    saldo_final_calculado IS NULL OR saldo_final_calculado >= 0
  ),
  CONSTRAINT ck_saldos_turno_final_sistema CHECK (
    saldo_final_sistema IS NULL OR saldo_final_sistema >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_saldos_turno_cuentas_cuenta
  ON saldos_turno_cuentas(id_cuenta);

CREATE INDEX IF NOT EXISTS idx_saldos_turno_cuentas_turno
  ON saldos_turno_cuentas(id_turno);

CREATE OR REPLACE VIEW vw_saldos_turnos_cuentas AS
SELECT
  stc.id_saldo_turno,
  stc.id_turno,
  t.fecha_apertura,
  t.fecha_cierre,
  t.estado AS estado_turno,
  s.id_sucursal,
  s.nombre AS sucursal,
  c.id_caja,
  c.nombre AS caja,
  u.id_usuario AS id_cajero,
  u.nombre_completo AS cajero,
  cb.id_cuenta,
  cb.alias AS cuenta,
  eb.id_entidad,
  eb.codigo AS entidad,
  m.id_moneda,
  m.codigo AS moneda,
  stc.saldo_inicial,
  stc.saldo_final_calculado,
  stc.saldo_final_sistema,
  stc.diferencia,
  stc.fecha_registro_apertura,
  stc.fecha_registro_cierre
FROM saldos_turno_cuentas stc
JOIN turnos t ON t.id_turno = stc.id_turno
JOIN sucursales s ON s.id_sucursal = t.id_sucursal
JOIN cajas c ON c.id_caja = t.id_caja
JOIN usuarios u ON u.id_usuario = t.id_cajero
JOIN cuentas_bancarias cb ON cb.id_cuenta = stc.id_cuenta
JOIN entidades_bancarias eb ON eb.id_entidad = cb.id_entidad
JOIN monedas m ON m.id_moneda = cb.id_moneda;
