BEGIN;
CREATE TABLE temo.usuario_mfa (
  id_usuario uuid PRIMARY KEY REFERENCES temo.usuarios(id_usuario) ON DELETE CASCADE,
  secreto_cifrado text NOT NULL,
  activado_en timestamptz NOT NULL DEFAULT now(),
  ultimo_paso bigint NOT NULL DEFAULT -1,
  intentos_fallidos integer NOT NULL DEFAULT 0,
  bloqueado_hasta timestamptz
);
CREATE TABLE temo.desafios_mfa (
  token_hash text PRIMARY KEY,
  id_usuario uuid NOT NULL REFERENCES temo.usuarios(id_usuario) ON DELETE CASCADE,
  version_sesion integer NOT NULL,
  alta boolean NOT NULL,
  secreto_cifrado text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  vence_en timestamptz NOT NULL,
  consumido_en timestamptz,
  intentos integer NOT NULL DEFAULT 0,
  CHECK (alta = (secreto_cifrado IS NOT NULL))
);
CREATE INDEX desafios_mfa_usuario_fecha ON temo.desafios_mfa(id_usuario, creado_en);
CREATE TABLE temo.recuperacion_mfa (
  id_usuario uuid NOT NULL REFERENCES temo.usuario_mfa(id_usuario) ON DELETE CASCADE,
  codigo_hash text NOT NULL,
  consumido_en timestamptz,
  PRIMARY KEY(id_usuario, codigo_hash)
);
REVOKE ALL ON temo.usuario_mfa, temo.desafios_mfa, temo.recuperacion_mfa FROM PUBLIC, anon, authenticated;
COMMIT;
