SET search_path TO temo, public;
ALTER TABLE abonos_pendientes ADD COLUMN IF NOT EXISTS id_lote_liquidacion UUID NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_abonos_lote ON abonos_pendientes(id_lote_liquidacion);

-- Recover only batches explicitly recorded by the same database transaction.
UPDATE abonos_pendientes ap SET id_lote_liquidacion=b.id_bitacora
FROM bitacora b
WHERE b.tabla='pagos_pendientes' AND b.datos_nuevos ? 'pendingIds'
  AND jsonb_typeof(b.datos_nuevos->'pendingIds')='array'
  AND b.datos_nuevos->'pendingIds' ? ap.id_pendiente::text
  AND ap.fecha_abono=b.fecha_creacion AND ap.id_usuario_creacion=b.id_usuario;

UPDATE abonos_pendientes ap SET id_lote_liquidacion=t.id_grupo_transacciones
FROM transacciones t
WHERE ap.id_transaccion=t.id_transaccion
  AND ap.observaciones='Compensación con saldo a favor de una transacción en curso';
