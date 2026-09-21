-- TEMO - Permite al cajero consultar las compras de dolares de su turno activo.
SET search_path TO temo, public;

INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
JOIN permisos p ON p.codigo = 'VER_DOLLAR_PURCHASES'
WHERE r.codigo = 'CAJERO'
ON CONFLICT DO NOTHING;

INSERT INTO migraciones_sistema (codigo)
VALUES ('033_CASHIER_DOLLAR_PURCHASES')
ON CONFLICT (codigo) DO NOTHING;
