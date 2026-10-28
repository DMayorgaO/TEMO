SET search_path TO temo, public;

-- Conserva los identificadores existentes y no recalcula arqueos historicos.
INSERT INTO denominaciones(id_moneda,valor,etiqueta,orden,estado)
SELECT m.id_moneda,d.valor,d.etiqueta,d.orden,'ACTIVO'
FROM monedas m
CROSS JOIN (VALUES (0.50,'C$ 0.50',100),(0.25,'C$ 0.25',110)) d(valor,etiqueta,orden)
WHERE m.codigo='NIO'
ON CONFLICT(id_moneda,valor) DO UPDATE
SET etiqueta=excluded.etiqueta,orden=excluded.orden,estado=excluded.estado;
