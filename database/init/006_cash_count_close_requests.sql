-- TEMO - Arqueo actual por turno, ajuste de cambio y solicitudes de cierre.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO temo, public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM roles WHERE codigo = 'DUENA')
     AND NOT EXISTS (SELECT 1 FROM roles WHERE codigo = 'JEFA') THEN
    UPDATE roles
    SET codigo = 'JEFA', nombre = 'Jefa', descripcion = 'Acceso completo al sistema, comisiones y cierres.'
    WHERE codigo = 'DUENA';
  END IF;
END;
$$;

UPDATE roles
SET nombre = 'Jefa', descripcion = 'Acceso completo al sistema, comisiones y cierres.'
WHERE codigo = 'JEFA';

UPDATE usuarios
SET
  nombres = 'Jefa',
  usuario = 'jefa',
  correo = 'jefa@temo.local',
  fecha_modificacion = now()
WHERE usuario = 'duena';

UPDATE sucursales
SET codigo = 'TIENDA_PRINCIPAL', nombre = 'Tienda principal'
WHERE codigo = 'SUCURSAL_1';

INSERT INTO usuarios_sucursales (id_usuario, id_sucursal)
SELECT u.id_usuario, s.id_sucursal
FROM usuarios u
JOIN sucursales s ON (
  (u.usuario IN ('jefa', 'cajero1', 'cajero2') AND s.codigo = 'TIENDA_PRINCIPAL')
  OR (u.usuario = 'cajero3' AND s.codigo = 'SUCURSAL_2')
)
ON CONFLICT DO NOTHING;

INSERT INTO cuentas_sucursales (id_cuenta, id_sucursal)
SELECT cb.id_cuenta, s.id_sucursal
FROM cuentas_bancarias cb
JOIN entidades_bancarias eb ON eb.id_entidad = cb.id_entidad
JOIN sucursales s ON (
  (eb.codigo IN ('BAC', 'BANPRO') AND s.codigo = 'TIENDA_PRINCIPAL')
  OR (eb.codigo = 'LAFISE' AND s.codigo = 'SUCURSAL_2')
)
ON CONFLICT DO NOTHING;

DELETE FROM roles_permisos rp
USING roles r, permisos p
WHERE rp.id_rol = r.id_rol
  AND rp.id_permiso = p.id_permiso
  AND r.codigo = 'CAJERO'
  AND p.codigo IN (
    'VER_SHIFTS',
    'VER_REPORTS_HUB',
    'VER_REPORTS',
    'VER_REPORTES'
  );

DO $$ BEGIN
  ALTER TYPE tipo_arqueo ADD VALUE IF NOT EXISTS 'ACTUAL';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE arqueos_denominaciones
  ADD COLUMN IF NOT EXISTS montones_25 INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sueltos INTEGER NOT NULL DEFAULT 0;

UPDATE arqueos_denominaciones
SET
  montones_25 = cantidad / 25,
  sueltos = cantidad % 25
WHERE cantidad <> montones_25 * 25 + sueltos;

ALTER TABLE arqueos_denominaciones
  DROP CONSTRAINT IF EXISTS ck_arqueos_denominaciones_desglose;

ALTER TABLE arqueos_denominaciones
  ADD CONSTRAINT ck_arqueos_denominaciones_desglose CHECK (
    montones_25 >= 0
    AND sueltos >= 0
    AND cantidad = montones_25 * 25 + sueltos
  );

ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS cambio_nio NUMERIC(16, 4) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_arqueo_actual_turno_moneda
  ON arqueos (id_turno, id_moneda)
  WHERE tipo = 'ACTUAL';

CREATE TABLE IF NOT EXISTS solicitudes_cierre_turno (
  id_solicitud_cierre UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_turno UUID NOT NULL REFERENCES turnos(id_turno) ON DELETE CASCADE,
  id_usuario_solicitud UUID NOT NULL REFERENCES usuarios(id_usuario),
  id_usuario_revision UUID REFERENCES usuarios(id_usuario),
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'ATENDIDA', 'CANCELADA')),
  fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_revision TIMESTAMPTZ,
  fecha_notificacion_cajero_leida TIMESTAMPTZ,
  observaciones_cierre TEXT,
  CONSTRAINT uq_solicitud_cierre_turno UNIQUE (id_turno)
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_cierre_pendientes
  ON solicitudes_cierre_turno (estado, fecha_solicitud);

CREATE INDEX IF NOT EXISTS idx_solicitudes_cierre_usuario
  ON solicitudes_cierre_turno (id_usuario_solicitud, fecha_revision);

INSERT INTO migraciones_sistema (codigo)
VALUES ('006_CASH_COUNT_CLOSE_REQUESTS')
ON CONFLICT (codigo) DO NOTHING;
