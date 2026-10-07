ALTER TABLE temo.saldos_turno_cuentas
  ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION temo.touch_balance_reading()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR
    (NEW.saldo_inicial, NEW.saldo_final_calculado, NEW.saldo_final_sistema,
     NEW.saldo_ingresos_sistema, NEW.saldo_egresos_sistema)
    IS DISTINCT FROM
    (OLD.saldo_inicial, OLD.saldo_final_calculado, OLD.saldo_final_sistema,
     OLD.saldo_ingresos_sistema, OLD.saldo_egresos_sistema) THEN
    NEW.fecha_actualizacion := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS balance_reading_updated ON temo.saldos_turno_cuentas;
CREATE TRIGGER balance_reading_updated
BEFORE INSERT OR UPDATE ON temo.saldos_turno_cuentas
FOR EACH ROW EXECUTE FUNCTION temo.touch_balance_reading();
