-- TEMO - Conciliacion diaria separada de TELEDOLAR y aperturas negativas.
SET search_path TO temo, public;

ALTER TABLE saldos_turno_cuentas
  DROP CONSTRAINT IF EXISTS ck_saldos_turno_inicial;

ALTER TABLE saldos_turno_cuentas
  ADD COLUMN IF NOT EXISTS saldo_ingresos_sistema NUMERIC(16, 4),
  ADD COLUMN IF NOT EXISTS saldo_egresos_sistema NUMERIC(16, 4);

COMMENT ON COLUMN saldos_turno_cuentas.saldo_inicial IS
  'Saldo de apertura; puede ser negativo para conservar sobregiros entre turnos.';
COMMENT ON COLUMN saldos_turno_cuentas.saldo_ingresos_sistema IS
  'Total de ingresos observado en plataformas que concilian movimientos diarios por separado.';
COMMENT ON COLUMN saldos_turno_cuentas.saldo_egresos_sistema IS
  'Total de egresos observado en plataformas que concilian movimientos diarios por separado.';

INSERT INTO migraciones_sistema (codigo)
VALUES ('034_TELEDOLAR_DAILY_BALANCES_NEGATIVE_OPENING')
ON CONFLICT (codigo) DO NOTHING;
