-- TEMO - Corrige la direccion bancaria de los retiros BAC y recompone sus saldos.

SET search_path TO temo, public;

BEGIN;

-- Un retiro BAC entrega efectivo y aumenta el saldo disponible en la cuenta bancaria.
UPDATE efectos_movimientos ef
SET direccion_cuenta = 'ENTRA'
FROM cuentas_movimientos cm
JOIN cuentas_bancarias cb ON cb.id_cuenta = cm.id_cuenta
JOIN entidades_bancarias eb ON eb.id_entidad = cb.id_entidad
WHERE ef.id_cuenta_movimiento = cm.id_cuenta_movimiento
  AND eb.codigo = 'BAC'
  AND cm.codigo_operativo = 'RE'
  AND ef.afecta_cuenta = true
  AND ef.direccion_efectivo = 'SALE';

-- Reclasifica los movimientos originales generados con la configuracion incorrecta.
UPDATE movimientos_cuentas mc
SET direccion = 'ENTRA'
FROM transacciones tr
JOIN cuentas_movimientos cm ON cm.id_cuenta_movimiento = tr.id_cuenta_movimiento
JOIN cuentas_bancarias cb ON cb.id_cuenta = cm.id_cuenta
JOIN entidades_bancarias eb ON eb.id_entidad = cb.id_entidad
WHERE mc.id_transaccion = tr.id_transaccion
  AND mc.es_reverso = false
  AND eb.codigo = 'BAC'
  AND cm.codigo_operativo = 'RE';

-- Mantiene opuestos los asientos reversos de transacciones BAC anuladas.
UPDATE movimientos_cuentas reverse_mc
SET direccion = (
  CASE original_mc.direccion WHEN 'ENTRA' THEN 'SALE' ELSE 'ENTRA' END
)::direccion_monto
FROM movimientos_cuentas original_mc
WHERE reverse_mc.id_movimiento_reversado = original_mc.id_movimiento_cuenta
  AND reverse_mc.es_reverso = true;

-- Recalcula cada saldo usando transacciones vigentes y transferencias digitales activas.
UPDATE saldos_turno_cuentas stc
SET saldo_final_calculado = stc.saldo_inicial + COALESCE((
  SELECT SUM(CASE movements.direccion WHEN 'ENTRA' THEN movements.monto ELSE -movements.monto END)
  FROM (
    SELECT mc.direccion, mc.monto
    FROM movimientos_cuentas mc
    JOIN transacciones tr ON tr.id_transaccion = mc.id_transaccion
    WHERE mc.id_cuenta = stc.id_cuenta
      AND tr.id_turno = stc.id_turno
      AND tr.estado <> 'ANULADA'
    UNION ALL
    SELECT mc.direccion, mc.monto
    FROM movimientos_cuentas mc
    JOIN transferencias tf ON tf.id_transferencia = mc.id_transferencia
    WHERE mc.id_cuenta = stc.id_cuenta
      AND tf.id_turno = stc.id_turno
      AND tf.estado = 'ACTIVO'
  ) movements
), 0);

COMMIT;
