ALTER TABLE temo.saldos_turno_cuentas
  ADD COLUMN IF NOT EXISTS ingresos_referencia_sistema numeric(18,2),
  ADD COLUMN IF NOT EXISTS egresos_referencia_sistema numeric(18,2);
