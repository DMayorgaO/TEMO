CREATE TABLE IF NOT EXISTS temo.solicitudes_financieras (
  id_usuario UUID NOT NULL REFERENCES temo.usuarios(id_usuario),
  operacion VARCHAR(32) NOT NULL CHECK (operacion IN ('CREAR_TRANSACCIONES','CREAR_TRANSFERENCIA')),
  id_solicitud UUID NOT NULL,
  huella CHAR(64) NOT NULL CHECK (huella ~ '^[a-f0-9]{64}$'),
  resultado JSONB NOT NULL CHECK (jsonb_typeof(resultado)='object'),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_usuario,operacion,id_solicitud)
);

-- Un recibo confirmado no se modifica ni se recicla como una operacion nueva.
CREATE OR REPLACE FUNCTION temo.proteger_recibo_financiero() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Los recibos financieros confirmados son inmutables.';
END $$;
DROP TRIGGER IF EXISTS proteger_recibo_financiero ON temo.solicitudes_financieras;
CREATE TRIGGER proteger_recibo_financiero BEFORE UPDATE OR DELETE ON temo.solicitudes_financieras
  FOR EACH ROW EXECUTE FUNCTION temo.proteger_recibo_financiero();

REVOKE ALL ON TABLE temo.solicitudes_financieras FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON TABLE temo.solicitudes_financieras FROM %I',role_name);
  END LOOP;
END $$;
