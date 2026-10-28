ALTER TABLE temo.grupos_transacciones
  ADD COLUMN IF NOT EXISTS version_edicion BIGINT NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION temo.incrementar_version_grupo() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  NEW.version_edicion := OLD.version_edicion + 1;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS version_grupo ON temo.grupos_transacciones;
CREATE TRIGGER version_grupo BEFORE UPDATE ON temo.grupos_transacciones
  FOR EACH ROW EXECUTE FUNCTION temo.incrementar_version_grupo();

-- Invalidate only related groups, not unrelated operations or shift polling.
CREATE OR REPLACE FUNCTION temo.invalidar_edicion_grupos() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE affected UUID;
BEGIN
  FOR affected IN
    WITH refs AS (
      SELECT (item->>'id_grupo_transacciones')::uuid AS group_id,
        (item->>'id_transaccion')::uuid AS transaction_id,
        (item->>'id_pendiente')::uuid AS pending_id,
        (item->>'id_arqueo')::uuid AS cash_id,
        coalesce(item->>'id_abono',item->>'id_abono_pendiente')::uuid AS payment_id
      FROM jsonb_array_elements(jsonb_build_array(
        CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END,
        CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END
      )) item
    ), cash AS (
      SELECT a.id_grupo_transacciones,a.id_transaccion,a.id_abono_pendiente
      FROM temo.arqueos a WHERE a.id_arqueo IN (SELECT cash_id FROM refs)
    ), payments AS (
      SELECT ap.id_transaccion,ap.id_pendiente FROM temo.abonos_pendientes ap
      WHERE ap.id_abono IN (SELECT payment_id FROM refs UNION SELECT id_abono_pendiente FROM cash)
        OR ap.id_pendiente IN (SELECT pending_id FROM refs)
    ), transactions AS (
      SELECT transaction_id AS id FROM refs UNION SELECT id_transaccion FROM cash
      UNION SELECT id_transaccion FROM payments
      UNION SELECT pp.id_transaccion FROM temo.pagos_pendientes pp
        WHERE pp.id_pendiente IN (SELECT pending_id FROM refs UNION SELECT id_pendiente FROM payments)
    ), groups AS (
      SELECT group_id AS id FROM refs UNION SELECT id_grupo_transacciones FROM cash
      UNION SELECT t.id_grupo_transacciones FROM temo.transacciones t WHERE t.id_transaccion IN (SELECT id FROM transactions)
    )
    SELECT id FROM groups WHERE id IS NOT NULL ORDER BY id
  LOOP
    UPDATE temo.grupos_transacciones SET version_edicion=version_edicion WHERE id_grupo_transacciones=affected;
  END LOOP;
  RETURN NULL;
END $$;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['transacciones','transacciones_montos','pagos_pendientes',
    'abonos_pendientes','arqueos','arqueos_denominaciones','correcciones_transacciones_cerradas']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS version_edicion_grupos ON temo.%I',table_name);
    EXECUTE format('CREATE TRIGGER version_edicion_grupos AFTER INSERT OR UPDATE OR DELETE ON temo.%I
      FOR EACH ROW EXECUTE FUNCTION temo.invalidar_edicion_grupos()',table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION temo.invalidar_edicion_por_estado_turno() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE affected UUID;
BEGIN
  FOR affected IN SELECT id_grupo_transacciones FROM temo.grupos_transacciones
    WHERE id_turno=NEW.id_turno ORDER BY id_grupo_transacciones
  LOOP
    UPDATE temo.grupos_transacciones SET version_edicion=version_edicion WHERE id_grupo_transacciones=affected;
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS version_edicion_estado_turno ON temo.turnos;
CREATE TRIGGER version_edicion_estado_turno AFTER UPDATE OF estado ON temo.turnos
  FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION temo.invalidar_edicion_por_estado_turno();
