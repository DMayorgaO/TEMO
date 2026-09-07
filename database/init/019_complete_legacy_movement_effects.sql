-- Complete operational effects omitted from the original movement seed.
SET search_path TO temo, public;

INSERT INTO efectos_movimientos (
  id_cuenta_movimiento,
  afecta_efectivo,
  direccion_efectivo,
  afecta_cuenta,
  direccion_cuenta,
  genera_pendiente,
  observaciones
)
SELECT
  cm.id_cuenta_movimiento,
  true,
  CASE mv.codigo
    WHEN 'RETIRO_TARJETA' THEN 'SALE'::direccion_monto
    WHEN 'PAGO_TARJETA' THEN 'ENTRA'::direccion_monto
  END,
  true,
  CASE mv.codigo
    WHEN 'RETIRO_TARJETA' THEN 'ENTRA'::direccion_monto
    WHEN 'PAGO_TARJETA' THEN 'SALE'::direccion_monto
  END,
  false,
  'Efecto completado para configuracion operativa heredada'
FROM cuentas_movimientos cm
JOIN movimientos mv ON mv.id_movimiento = cm.id_movimiento
LEFT JOIN efectos_movimientos ef
  ON ef.id_cuenta_movimiento = cm.id_cuenta_movimiento
WHERE cm.estado = 'ACTIVO'
  AND mv.codigo IN ('RETIRO_TARJETA', 'PAGO_TARJETA')
  AND ef.id_efecto IS NULL
ON CONFLICT (id_cuenta_movimiento) DO NOTHING;

