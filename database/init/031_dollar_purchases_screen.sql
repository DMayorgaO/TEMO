-- TEMO - Habilita la pantalla calculada de compras de dolares para Administrador.
SET search_path TO temo, public;

INSERT INTO permisos (codigo, nombre, descripcion, estado)
VALUES (
  'VER_DOLLAR_PURCHASES',
  'Ver Compra de Dólares',
  'Consultar dólares comprados y la ganancia generada por el diferencial cambiario.',
  'ACTIVO'
)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  estado = 'ACTIVO';

INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
JOIN permisos p ON p.codigo = 'VER_DOLLAR_PURCHASES'
WHERE r.codigo = 'JEFA'
ON CONFLICT DO NOTHING;

INSERT INTO migraciones_sistema (codigo)
VALUES ('031_DOLLAR_PURCHASES_SCREEN')
ON CONFLICT (codigo) DO NOTHING;
