ALTER TABLE temo.traspasos_turno ADD COLUMN IF NOT EXISTS modo VARCHAR(20) NOT NULL DEFAULT 'CON_CIERRE'
  CHECK (modo IN ('CON_CIERRE','EN_REVISION'));
ALTER TABLE temo.saldos_turno_cuentas
  ADD COLUMN IF NOT EXISTS traspaso_base_ingresos NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS traspaso_base_egresos NUMERIC(18,4);

-- Todo turno de revision conserva la relacion con la entrega; no se puede reabrir.
CREATE OR REPLACE FUNCTION temo.proteger_estado_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=temo,pg_catalog AS $$
BEGIN
  IF OLD.estado::text='EN_REVISION' AND NEW.estado::text NOT IN ('EN_REVISION','CERRADO') THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Un turno traspasado en revision solo admite correcciones o cierre administrativo.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS proteger_estado_revision ON temo.turnos;
CREATE TRIGGER proteger_estado_revision BEFORE UPDATE OF estado ON temo.turnos
  FOR EACH ROW EXECUTE FUNCTION temo.proteger_estado_revision();
