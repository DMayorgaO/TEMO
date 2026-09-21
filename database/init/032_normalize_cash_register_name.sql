BEGIN;

-- La etiqueta operativa conserva unicamente el numero de caja disponible.
UPDATE temo.cajas
SET nombre = 'Caja 2',
    fecha_modificacion = CURRENT_TIMESTAMP
WHERE codigo = 'CAJA_2'
  AND nombre IS DISTINCT FROM 'Caja 2';

INSERT INTO temo.migraciones_sistema (codigo)
VALUES ('032_NORMALIZE_CASH_REGISTER_NAME')
ON CONFLICT (codigo) DO NOTHING;

COMMIT;
