BEGIN;
ALTER TABLE temo.solicitudes_financieras DROP CONSTRAINT IF EXISTS solicitudes_financieras_operacion_check;
ALTER TABLE temo.solicitudes_financieras ADD CONSTRAINT solicitudes_financieras_operacion_check CHECK (operacion IN (
  'CREAR_TRANSACCIONES','CREAR_TRANSFERENCIA','LIQUIDAR_PENDIENTE','LIQUIDAR_PENDIENTES',
  'EDITAR_TRANSACCION','ANULAR_TRANSACCION','EDITAR_GRUPO','EDITAR_TRANSFERENCIA','ANULAR_TRANSFERENCIA'
));

ALTER TABLE temo.transferencias ADD COLUMN IF NOT EXISTS version_edicion BIGINT NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION temo.incrementar_version_transferencia() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  NEW.version_edicion := OLD.version_edicion + 1;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS version_transferencia ON temo.transferencias;
CREATE TRIGGER version_transferencia BEFORE UPDATE ON temo.transferencias
  FOR EACH ROW EXECUTE FUNCTION temo.incrementar_version_transferencia();

CREATE OR REPLACE FUNCTION temo.invalidar_edicion_transferencia() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE affected UUID;
BEGIN
  FOR affected IN SELECT DISTINCT (item->>'id_transferencia')::uuid
    FROM jsonb_array_elements(jsonb_build_array(
      CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END,
      CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END
    )) item WHERE item->>'id_transferencia' IS NOT NULL ORDER BY 1
  LOOP
    UPDATE temo.transferencias SET version_edicion=version_edicion WHERE id_transferencia=affected;
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS version_edicion_transferencia ON temo.transferencias_denominaciones;
CREATE TRIGGER version_edicion_transferencia AFTER INSERT OR UPDATE OR DELETE ON temo.transferencias_denominaciones
  FOR EACH ROW EXECUTE FUNCTION temo.invalidar_edicion_transferencia();
COMMIT;
