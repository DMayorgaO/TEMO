-- Permite registrar el saldo real negativo de una cuenta al cerrar un turno.
SET search_path TO temo, public;

ALTER TABLE saldos_turno_cuentas
  DROP CONSTRAINT IF EXISTS ck_saldos_turno_final_sistema;

COMMENT ON COLUMN saldos_turno_cuentas.saldo_final_sistema IS
  'Saldo observado al cierre; puede ser negativo por sobregiro y se compara con el saldo calculado.';

