BEGIN;
CREATE SEQUENCE IF NOT EXISTS temo.bitacora_numero_seq;
ALTER TABLE temo.bitacora ADD COLUMN IF NOT EXISTS numero_auditoria bigint;
WITH numbered AS (
  SELECT id_bitacora, row_number() OVER (ORDER BY fecha_creacion, id_bitacora) AS numero
  FROM temo.bitacora
)
UPDATE temo.bitacora b SET numero_auditoria = n.numero
FROM numbered n WHERE b.id_bitacora = n.id_bitacora AND b.numero_auditoria IS NULL;
SELECT setval('temo.bitacora_numero_seq', coalesce(max(numero_auditoria), 0) + 1, false) FROM temo.bitacora;
ALTER TABLE temo.bitacora ALTER COLUMN numero_auditoria SET DEFAULT nextval('temo.bitacora_numero_seq');
ALTER TABLE temo.bitacora ALTER COLUMN numero_auditoria SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bitacora_numero_auditoria_unique ON temo.bitacora(numero_auditoria);
REVOKE ALL ON SEQUENCE temo.bitacora_numero_seq FROM PUBLIC, anon, authenticated;
COMMIT;
