-- TEMO - Asignacion directa de usuarios a sucursales.
-- Evita inferir la ubicacion actual de un usuario a partir de turnos historicos.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO temo, public;

CREATE TABLE IF NOT EXISTS usuarios_sucursales (
  id_usuario UUID NOT NULL
    REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  id_sucursal UUID NOT NULL
    REFERENCES sucursales(id_sucursal) ON DELETE CASCADE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_usuario, id_sucursal)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_sucursales_sucursal
  ON usuarios_sucursales(id_sucursal);

-- Conserva como asignaciones iniciales las relaciones observadas en turnos existentes.
INSERT INTO usuarios_sucursales (id_usuario, id_sucursal)
SELECT DISTINCT t.id_cajero, t.id_sucursal
FROM turnos t
ON CONFLICT (id_usuario, id_sucursal) DO NOTHING;
