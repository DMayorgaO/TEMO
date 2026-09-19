SET search_path TO temo, public;

-- Alinea instalaciones antiguas que conservaron ADMINISTRADOR con el codigo JEFA usado por la API.
DO $$
DECLARE
  legacy_role UUID;
  boss_role UUID;
BEGIN
  SELECT id_rol INTO legacy_role FROM roles WHERE codigo = 'ADMINISTRADOR' LIMIT 1;
  SELECT id_rol INTO boss_role FROM roles WHERE codigo = 'JEFA' LIMIT 1;

  IF legacy_role IS NOT NULL AND boss_role IS NULL THEN
    UPDATE roles
    SET codigo = 'JEFA', nombre = 'Jefa', descripcion = 'Acceso completo al sistema, comisiones y cierres.'
    WHERE id_rol = legacy_role;
  ELSIF legacy_role IS NOT NULL AND boss_role IS NOT NULL THEN
    UPDATE usuarios SET id_rol = boss_role WHERE id_rol = legacy_role;
    INSERT INTO roles_permisos (id_rol, id_permiso)
    SELECT boss_role, id_permiso FROM roles_permisos WHERE id_rol = legacy_role
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

