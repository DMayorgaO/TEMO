-- Conserva únicamente códigos cifrados y de vigencia corta para recuperar cuentas de Jefa.
SET search_path TO temo, public;

CREATE TABLE IF NOT EXISTS recuperaciones_contrasena (
  id_recuperacion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  codigo_hash VARCHAR(64) NOT NULL,
  vence_en TIMESTAMPTZ NOT NULL,
  consumido_en TIMESTAMPTZ,
  intentos SMALLINT NOT NULL DEFAULT 0,
  direccion_ip INET,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recuperaciones_intentos_validos CHECK (intentos BETWEEN 0 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_recuperaciones_usuario_vigencia
  ON recuperaciones_contrasena(id_usuario, vence_en DESC);

REVOKE ALL ON recuperaciones_contrasena FROM anon, authenticated;

