-- TEMO - Alinea los catalogos operativos visibles con PostgreSQL.
-- Conserva UUID, roles, contrasenas, turnos y asociaciones existentes.

BEGIN;

SET search_path TO temo, public;

UPDATE sucursales
SET
  nombre = CASE codigo
    WHEN 'TIENDA_PRINCIPAL' THEN 'MISCELÁNEA OLIVERA'
    WHEN 'SUCURSAL_2' THEN 'METROCENTRO'
    ELSE nombre
  END,
  fecha_modificacion = now()
WHERE codigo IN ('TIENDA_PRINCIPAL', 'SUCURSAL_2');

UPDATE usuarios
SET
  nombres = CASE
    WHEN lower(usuario) IN ('jefa', 'roxana') THEN 'ROXANA'
    WHEN lower(usuario) IN ('cajero1', 'kimberlym') THEN 'KIMBERLY'
    WHEN lower(usuario) IN ('cajero2', 'cristina') THEN 'CRISTINA'
    WHEN lower(usuario) IN ('cajero3', 'diegom') THEN 'DIEGO'
    ELSE nombres
  END,
  apellidos = CASE
    WHEN lower(usuario) IN ('jefa', 'roxana') THEN 'OLIVERA'
    WHEN lower(usuario) IN ('cajero1', 'kimberlym') THEN 'MOLINA'
    WHEN lower(usuario) IN ('cajero2', 'cristina') THEN ''
    WHEN lower(usuario) IN ('cajero3', 'diegom') THEN 'MAYORGA'
    ELSE apellidos
  END,
  usuario = CASE
    WHEN lower(usuario) IN ('jefa', 'roxana') THEN 'ROXANA'
    WHEN lower(usuario) IN ('cajero1', 'kimberlym') THEN 'KIMBERLYM'
    WHEN lower(usuario) IN ('cajero2', 'cristina') THEN 'CRISTINA'
    WHEN lower(usuario) IN ('cajero3', 'diegom') THEN 'DIEGOM'
    ELSE usuario
  END,
  fecha_modificacion = now()
WHERE lower(usuario) IN (
  'jefa', 'roxana',
  'cajero1', 'kimberlym',
  'cajero2', 'cristina',
  'cajero3', 'diegom'
);

INSERT INTO migraciones_sistema (codigo)
VALUES ('009_ALIGN_OPERATIONAL_CATALOGS')
ON CONFLICT (codigo) DO NOTHING;

COMMIT;
