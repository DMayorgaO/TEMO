-- TEMO - Los saldos calculados pueden ser negativos.
-- Un valor negativo representa faltante, sobregiro o una apertura insuficiente
-- y debe conservarse para que la columna Diferencia sea trazable.

SET search_path TO temo, public;

ALTER TABLE saldos_turno_cuentas
  DROP CONSTRAINT IF EXISTS ck_saldos_turno_final_calculado;

COMMENT ON COLUMN saldos_turno_cuentas.saldo_final_calculado IS
  'Saldo inicial mas ingresos menos egresos; puede ser negativo y se compara con el saldo del sistema.';
