-- TEMO - Autenticacion inicial para el entorno local de desarrollo.
-- Las claves se almacenan exclusivamente como hashes bcrypt con sal aleatoria.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO temo, public;

CREATE TABLE IF NOT EXISTS migraciones_sistema (
  codigo VARCHAR(80) PRIMARY KEY,
  fecha_aplicacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO permisos (codigo, nombre, descripcion)
VALUES
  ('VER_DASHBOARD', 'Ver Panel General', 'Permite abrir la pantalla Panel General.'),
  ('VER_SHIFTS', 'Ver Turnos', 'Permite abrir la pantalla Turnos.'),
  ('VER_CASH_COUNT', 'Ver Arqueo', 'Permite abrir la pantalla Arqueo.'),
  ('VER_TRANSACTIONS', 'Ver Transacciones', 'Permite abrir la pantalla Transacciones.'),
  ('VER_GENERAL_CONSOLIDATION', 'Ver Saldos', 'Permite abrir la pantalla Saldos.'),
  ('VER_BANKS', 'Ver Bancos', 'Permite abrir la pantalla Bancos.'),
  ('VER_BRANCHES', 'Ver Sucursales', 'Permite abrir la pantalla Sucursales.'),
  ('VER_ACCOUNTS', 'Ver Cuentas', 'Permite abrir la pantalla Cuentas.'),
  ('VER_CATALOGS', 'Ver Movimientos', 'Permite abrir la pantalla Movimientos.'),
  ('VER_COMMISSIONS', 'Ver Comisiones', 'Permite abrir la pantalla Comisiones.'),
  ('VER_EXCHANGE_RATE', 'Ver Tasa de Cambio', 'Permite abrir la pantalla Tasa de Cambio.'),
  ('VER_REPORTS_HUB', 'Ver Reportes', 'Permite abrir el apartado Reportes.'),
  ('VER_REPORTS', 'Ver Reportes operativos', 'Permite abrir los reportes operativos.'),
  ('VER_COMMISSION_REPORTS', 'Ver Reporte comisiones', 'Permite abrir el reporte de comisiones.'),
  ('VER_USERS', 'Ver Gestion usuarios', 'Permite abrir la gestion de usuarios.'),
  ('VER_ROLE_PERMISSIONS', 'Ver Roles y permisos', 'Permite abrir la gestion de roles y permisos.'),
  ('VER_AUDIT', 'Ver Auditoria', 'Permite abrir la auditoria.'),
  ('VER_IMPORTS', 'Ver Importaciones', 'Permite abrir la importacion de historicos.')
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  estado = 'ACTIVO';

INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
CROSS JOIN permisos p
WHERE r.codigo = 'JEFA'
ON CONFLICT DO NOTHING;

INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
JOIN permisos p ON p.codigo IN (
  'REGISTRAR_TRANSACCIONES',
  'ANULAR_TRANSACCIONES',
  'VER_REPORTES',
  'VER_REPORTS',
  'EXPORTAR_REPORTES',
  'VER_CASH_COUNT',
  'VER_TRANSACTIONS',
  'VER_GENERAL_CONSOLIDATION'
)
WHERE r.codigo = 'CAJERO'
ON CONFLICT DO NOTHING;

INSERT INTO usuarios (
  id_rol,
  nombres,
  apellidos,
  usuario,
  contrasena_hash,
  debe_cambiar_contrasena
)
SELECT
  r.id_rol,
  datos.nombres,
  datos.apellidos,
  datos.usuario,
  crypt(convert_from(decode('74656d70313233', 'hex'), 'UTF8'), gen_salt('bf', 10)),
  true
FROM roles r
CROSS JOIN (
  VALUES
    ('Cajero', 'Principal', 'cajero1'),
    ('Cajero', 'Apoyo', 'cajero2'),
    ('Cajero', 'Sucursal 2', 'cajero3')
) AS datos(nombres, apellidos, usuario)
WHERE r.codigo = 'CAJERO'
ON CONFLICT (usuario) DO NOTHING;

UPDATE usuarios
SET
  contrasena_hash = crypt(
    convert_from(decode('74656d70313233', 'hex'), 'UTF8'),
    gen_salt('bf', 10)
  ),
  debe_cambiar_contrasena = true,
  fecha_modificacion = now()
WHERE usuario IN ('jefa', 'cajero1', 'cajero2', 'cajero3')
  AND NOT EXISTS (
    SELECT 1
    FROM migraciones_sistema
    WHERE codigo = '005_DEVELOPMENT_AUTHENTICATION'
  );

INSERT INTO migraciones_sistema (codigo)
VALUES ('005_DEVELOPMENT_AUTHENTICATION')
ON CONFLICT (codigo) DO NOTHING;
