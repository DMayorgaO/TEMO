-- TEMO - Completa y recalcula los saldos bancarios vivos de cada turno.
-- Repetible: puede ejecutarse nuevamente sin duplicar cuentas por turno.

SET search_path TO temo, public;

BEGIN;

-- Todo turno abierto conserva una fila por cada cuenta activa global o
-- asociada a su sucursal, aunque el saldo inicial haya sido cero.
INSERT INTO saldos_turno_cuentas (id_turno, id_cuenta, saldo_inicial)
SELECT t.id_turno, cb.id_cuenta, 0
FROM turnos t
CROSS JOIN cuentas_bancarias cb
WHERE t.estado IN ('ABIERTO', 'PENDIENTE_APROBACION')
  AND cb.estado = 'ACTIVO'
  AND (
    NOT EXISTS (
      SELECT 1 FROM cuentas_sucursales cs
      WHERE cs.id_cuenta = cb.id_cuenta
    )
    OR EXISTS (
      SELECT 1 FROM cuentas_sucursales cs
      WHERE cs.id_cuenta = cb.id_cuenta
        AND cs.id_sucursal = t.id_sucursal
    )
  )
ON CONFLICT (id_turno, id_cuenta) DO NOTHING;

-- También recupera cuentas afectadas por movimientos históricos, incluso si
-- la asociación de sucursal cambió después de registrar la transacción.
INSERT INTO saldos_turno_cuentas (id_turno, id_cuenta, saldo_inicial)
SELECT DISTINCT tr.id_turno, mc.id_cuenta, 0
FROM movimientos_cuentas mc
JOIN transacciones tr ON tr.id_transaccion = mc.id_transaccion
WHERE tr.estado <> 'ANULADA'
ON CONFLICT (id_turno, id_cuenta) DO NOTHING;

UPDATE saldos_turno_cuentas stc
SET saldo_final_calculado = stc.saldo_inicial + COALESCE((
  SELECT SUM(CASE mc.direccion WHEN 'ENTRA' THEN mc.monto ELSE -mc.monto END)
  FROM movimientos_cuentas mc
  JOIN transacciones tr ON tr.id_transaccion = mc.id_transaccion
  WHERE mc.id_cuenta = stc.id_cuenta
    AND tr.id_turno = stc.id_turno
    AND tr.estado <> 'ANULADA'
), 0);

COMMIT;
