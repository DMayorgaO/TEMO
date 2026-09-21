-- TEMO - Estandariza codigos visibles de turnos y pendientes sin cambiar UUID ni relaciones.
SET search_path TO temo, public;

-- Asigna consecutivos historicos de turno respetando el orden de creacion existente.
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS codigo_turno BIGINT;
WITH ordered AS (
  SELECT id_turno, row_number() OVER (ORDER BY fecha_creacion, id_turno)::bigint AS code
  FROM turnos
)
UPDATE turnos t
SET codigo_turno = ordered.code
FROM ordered
WHERE t.id_turno = ordered.id_turno
  AND t.codigo_turno IS NULL;

CREATE SEQUENCE IF NOT EXISTS turnos_codigo_turno_seq;
SELECT setval(
  'turnos_codigo_turno_seq',
  GREATEST(COALESCE((SELECT max(codigo_turno) FROM turnos), 0), 1),
  EXISTS (SELECT 1 FROM turnos)
);
ALTER TABLE turnos ALTER COLUMN codigo_turno SET DEFAULT nextval('turnos_codigo_turno_seq');
ALTER SEQUENCE turnos_codigo_turno_seq OWNED BY turnos.codigo_turno;
ALTER TABLE turnos ALTER COLUMN codigo_turno SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_turnos_codigo_turno ON turnos (codigo_turno);

-- Asigna consecutivos historicos de pendiente respetando el orden de creacion existente.
ALTER TABLE pagos_pendientes ADD COLUMN IF NOT EXISTS codigo_pendiente BIGINT;
WITH ordered AS (
  SELECT id_pendiente, row_number() OVER (ORDER BY fecha_creacion, id_pendiente)::bigint AS code
  FROM pagos_pendientes
)
UPDATE pagos_pendientes p
SET codigo_pendiente = ordered.code
FROM ordered
WHERE p.id_pendiente = ordered.id_pendiente
  AND p.codigo_pendiente IS NULL;

CREATE SEQUENCE IF NOT EXISTS pagos_pendientes_codigo_pendiente_seq;
SELECT setval(
  'pagos_pendientes_codigo_pendiente_seq',
  GREATEST(COALESCE((SELECT max(codigo_pendiente) FROM pagos_pendientes), 0), 1),
  EXISTS (SELECT 1 FROM pagos_pendientes)
);
ALTER TABLE pagos_pendientes ALTER COLUMN codigo_pendiente SET DEFAULT nextval('pagos_pendientes_codigo_pendiente_seq');
ALTER SEQUENCE pagos_pendientes_codigo_pendiente_seq OWNED BY pagos_pendientes.codigo_pendiente;
ALTER TABLE pagos_pendientes ALTER COLUMN codigo_pendiente SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_pendientes_codigo_pendiente ON pagos_pendientes (codigo_pendiente);
