-- TEMO - Acceso a la pantalla centralizada de pendientes.
-- Repetible: no duplica permisos ni asignaciones.

SET search_path TO temo, public;

BEGIN;

INSERT INTO permisos (codigo, nombre, descripcion)
VALUES (
  'VER_PENDING',
  'Ver Pendientes',
  'Permite consultar y liquidar los pendientes autorizados.'
)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  estado = 'ACTIVO';

INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
JOIN permisos p ON p.codigo = 'VER_PENDING'
WHERE r.codigo IN ('JEFA', 'CAJERO')
ON CONFLICT DO NOTHING;

-- Completa el primer evento de los pendientes creados antes de incorporar
-- esta pantalla, preservando una cronologia uniforme para todos los registros.
INSERT INTO historial_pendientes (
  id_pendiente,
  estado_anterior,
  estado_nuevo,
  id_usuario,
  motivo,
  fecha_cambio
)
SELECT
  pp.id_pendiente,
  null,
  pp.estado,
  pp.id_usuario_creacion,
  'Estado inicial recuperado por migracion',
  pp.fecha_creacion
FROM pagos_pendientes pp
WHERE NOT EXISTS (
  SELECT 1
  FROM historial_pendientes hp
  WHERE hp.id_pendiente = pp.id_pendiente
);

COMMIT;
