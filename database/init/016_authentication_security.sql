SET search_path TO temo, public;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS version_sesion INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS contrasena_modificada_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_version_sesion_positiva'
  ) THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_version_sesion_positiva
      CHECK (version_sesion > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_intentos_fallidos_no_negativos'
  ) THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_intentos_fallidos_no_negativos
      CHECK (intentos_fallidos >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS intentos_inicio_sesion (
  id_intento BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_normalizado VARCHAR(60) NOT NULL,
  direccion_ip INET,
  exitoso BOOLEAN NOT NULL,
  agente_usuario TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intentos_inicio_usuario_fecha
  ON intentos_inicio_sesion(usuario_normalizado, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_intentos_inicio_ip_fecha
  ON intentos_inicio_sesion(direccion_ip, fecha_creacion DESC);

INSERT INTO migraciones_sistema (codigo)
VALUES ('016_AUTHENTICATION_SECURITY')
ON CONFLICT (codigo) DO NOTHING;
