-- TEMO - Directorio normalizado de destinatarios frecuentes.
SET search_path TO temo, public;

CREATE TABLE IF NOT EXISTS directorio_destinatarios (
  id_destinatario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_destinatario BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  nombre VARCHAR(180) NOT NULL,
  observaciones TEXT,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  id_usuario_creacion UUID REFERENCES usuarios(id_usuario),
  id_usuario_modificacion UUID REFERENCES usuarios(id_usuario),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS directorio_identificadores (
  id_identificador UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_destinatario UUID NOT NULL REFERENCES directorio_destinatarios(id_destinatario) ON DELETE CASCADE,
  institucion VARCHAR(100) NOT NULL DEFAULT '',
  tipo VARCHAR(100) NOT NULL,
  numero VARCHAR(100) NOT NULL,
  id_moneda UUID REFERENCES monedas(id_moneda),
  orden SMALLINT NOT NULL DEFAULT 1 CHECK (orden > 0),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_destinatario, institucion, tipo, numero)
);

CREATE TABLE IF NOT EXISTS directorio_cedulas (
  id_cedula UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_destinatario UUID NOT NULL REFERENCES directorio_destinatarios(id_destinatario) ON DELETE CASCADE,
  numero VARCHAR(20) NOT NULL,
  titular VARCHAR(180),
  orden SMALLINT NOT NULL DEFAULT 1 CHECK (orden > 0),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_destinatario, numero)
);

CREATE TABLE IF NOT EXISTS directorio_referencias (
  id_referencia UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_destinatario UUID NOT NULL REFERENCES directorio_destinatarios(id_destinatario) ON DELETE CASCADE,
  referencia VARCHAR(180) NOT NULL,
  orden SMALLINT NOT NULL DEFAULT 1 CHECK (orden > 0),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_destinatario, referencia)
);

CREATE TABLE IF NOT EXISTS directorio_fuentes_importacion (
  id_fuente UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_destinatario UUID NOT NULL REFERENCES directorio_destinatarios(id_destinatario) ON DELETE CASCADE,
  hoja VARCHAR(120) NOT NULL,
  fila INTEGER NOT NULL CHECK (fila > 0),
  datos_originales JSONB NOT NULL DEFAULT '[]'::jsonb,
  fecha_importacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_destinatario, hoja, fila)
);

CREATE INDEX IF NOT EXISTS idx_directorio_destinatarios_nombre
  ON directorio_destinatarios (lower(nombre));
CREATE INDEX IF NOT EXISTS idx_directorio_identificadores_numero
  ON directorio_identificadores (numero);
CREATE INDEX IF NOT EXISTS idx_directorio_cedulas_numero
  ON directorio_cedulas (numero);
CREATE INDEX IF NOT EXISTS idx_directorio_referencias_valor
  ON directorio_referencias (lower(referencia));

INSERT INTO permisos (codigo, nombre, descripcion)
VALUES
  ('VER_DIRECTORY', 'Ver Directorio', 'Consultar destinatarios frecuentes, cuentas, cedulas y referencias.'),
  ('ADMINISTRAR_DIRECTORY', 'Administrar Directorio', 'Crear, editar e inactivar destinatarios frecuentes.')
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  estado = 'ACTIVO';

INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
JOIN permisos p ON p.codigo IN ('VER_DIRECTORY', 'ADMINISTRAR_DIRECTORY')
WHERE r.codigo = 'JEFA'
ON CONFLICT DO NOTHING;

INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
JOIN permisos p ON p.codigo = 'VER_DIRECTORY'
WHERE r.codigo = 'CAJERO'
ON CONFLICT DO NOTHING;

