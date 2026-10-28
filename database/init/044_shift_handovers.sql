SET search_path TO temo, public;

CREATE TABLE IF NOT EXISTS traspasos_turno (
  id_traspaso UUID PRIMARY KEY,
  id_turno_origen UUID NOT NULL REFERENCES turnos(id_turno),
  id_turno_destino UUID UNIQUE REFERENCES turnos(id_turno),
  id_emisor UUID NOT NULL REFERENCES usuarios(id_usuario),
  id_receptor UUID NOT NULL REFERENCES usuarios(id_usuario),
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','ACEPTADO','RECHAZADO','CANCELADO','VENCIDO')),
  resumen JSONB NOT NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_limite TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes',
  fecha_resolucion TIMESTAMPTZ,
  CHECK (id_emisor <> id_receptor),
  CHECK ((estado = 'ACEPTADO') = (id_turno_destino IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_traspaso_origen_pendiente
  ON traspasos_turno(id_turno_origen) WHERE estado='PENDIENTE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_traspaso_receptor_pendiente
  ON traspasos_turno(id_receptor) WHERE estado='PENDIENTE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_traspaso_origen_aceptado
  ON traspasos_turno(id_turno_origen) WHERE estado='ACEPTADO';

-- No corrige datos existentes: si hay turnos duplicados, la migracion exige revisarlos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_turno_cajero_vigente
  ON turnos(id_cajero) WHERE estado IN ('ABIERTO','PENDIENTE_APROBACION','PENDIENTE_APERTURA');

ALTER TABLE notificaciones_usuarios DROP CONSTRAINT IF EXISTS ck_notificaciones_tipo;
ALTER TABLE notificaciones_usuarios ADD CONSTRAINT ck_notificaciones_tipo
  CHECK (tipo IN ('PENDIENTE_PAGADO','TRANSFERENCIA_REGISTRADA','TRASPASO_TURNO'));

-- Comparte el bloqueo del turno con los traspasos; protege escrituras tardias.
-- No modifica las correcciones historicas por anotacion separada de transacciones.
CREATE OR REPLACE FUNCTION proteger_turno_traspasado() RETURNS trigger
LANGUAGE plpgsql SET search_path=temo,pg_catalog AS $$
DECLARE turno UUID; origen UUID; destino UUID; fila JSONB; estado_actual TEXT;
BEGIN
  fila := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  turno := nullif(fila->>'id_turno','')::uuid;
  IF turno IS NULL AND fila->>'id_arqueo' IS NOT NULL THEN
    SELECT a.id_turno INTO turno FROM temo.arqueos a WHERE a.id_arqueo=(fila->>'id_arqueo')::uuid;
  END IF;
  IF TG_TABLE_NAME='abonos_pendientes' THEN
    turno := nullif(fila->>'id_turno_aplicacion','')::uuid;
  ELSIF turno IS NULL AND fila->>'id_transaccion' IS NOT NULL THEN
    SELECT t.id_turno INTO turno FROM temo.transacciones t WHERE t.id_transaccion=(fila->>'id_transaccion')::uuid;
  END IF;
  IF TG_TABLE_NAME<>'abonos_pendientes' AND turno IS NULL AND fila->>'id_transferencia' IS NOT NULL THEN
    SELECT t.id_turno INTO turno FROM temo.transferencias t WHERE t.id_transferencia=(fila->>'id_transferencia')::uuid;
  END IF;
  IF fila->>'id_turno_aplicacion' IS NOT NULL THEN turno := (fila->>'id_turno_aplicacion')::uuid; END IF;
  IF turno IS NOT NULL THEN
    SELECT t.estado::text INTO estado_actual FROM temo.turnos t WHERE t.id_turno=turno FOR UPDATE;
    SELECT h.id_turno_origen,h.id_turno_destino INTO origen,destino FROM temo.traspasos_turno h
      WHERE h.id_turno_origen=turno AND h.estado='ACEPTADO';
    IF origen IS NOT NULL AND estado_actual='CERRADO' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='El turno ya fue traspasado. No se pueden alterar sus existencias.';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

DO $$ DECLARE tabla TEXT; BEGIN
  FOREACH tabla IN ARRAY ARRAY['arqueos','arqueos_denominaciones','saldos_turno_cuentas',
    'transacciones','transacciones_montos','transferencias','movimientos_cuentas','movimientos_efectivo','abonos_pendientes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS proteger_traspaso ON temo.%I',tabla);
    EXECUTE format('CREATE TRIGGER proteger_traspaso BEFORE INSERT OR UPDATE OR DELETE ON temo.%I FOR EACH ROW EXECUTE FUNCTION temo.proteger_turno_traspasado()',tabla);
  END LOOP;
END $$;
