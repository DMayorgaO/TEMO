-- TEMO - Rol exclusivo para registrar transferencias sobre turnos activos.

SET search_path TO temo, public;

INSERT INTO roles (codigo, nombre, descripcion, estado)
VALUES (
  'TRANSFERISTA',
  'Operador de transferencias',
  'Acceso exclusivo al registro y consulta de transferencias para cajeros con turno activo.',
  'ACTIVO'
)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  estado = 'ACTIVO',
  fecha_modificacion = now();

INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
JOIN permisos p ON p.codigo = 'VER_TRANSFERS'
WHERE r.codigo = 'TRANSFERISTA'
ON CONFLICT DO NOTHING;

INSERT INTO migraciones_sistema (codigo)
VALUES ('029_TRANSFER_OPERATOR_ROLE')
ON CONFLICT (codigo) DO NOTHING;
