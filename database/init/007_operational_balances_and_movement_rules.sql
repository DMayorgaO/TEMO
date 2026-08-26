-- TEMO - Reglas operativas para saldos bancarios y monedas de movimientos.
-- Repetible: puede ejecutarse sobre una base existente sin duplicar registros.

SET search_path TO temo, public;

BEGIN;

-- Retiro con codigo de BAC se opera solamente en cordobas.
UPDATE cuentas_movimientos cm
SET estado = 'INACTIVO', fecha_modificacion = now()
FROM cuentas_bancarias cb
JOIN entidades_bancarias eb ON eb.id_entidad = cb.id_entidad
JOIN monedas mo ON mo.id_moneda = cb.id_moneda
WHERE cm.id_cuenta = cb.id_cuenta
  AND eb.codigo = 'BAC'
  AND mo.codigo = 'USD'
  AND upper(cm.codigo_operativo) = 'RC';

-- BAC tambien ofrece Retiro de efectivo (RE) en las dos monedas.
WITH retiro AS (
  SELECT id_movimiento
  FROM movimientos
  WHERE lower(nombre) = lower('Retiro de efectivo')
  LIMIT 1
), cuentas_bac AS (
  SELECT cb.id_cuenta
  FROM cuentas_bancarias cb
  JOIN entidades_bancarias eb ON eb.id_entidad = cb.id_entidad
  JOIN monedas mo ON mo.id_moneda = cb.id_moneda
  WHERE eb.codigo = 'BAC'
    AND mo.codigo IN ('NIO', 'USD')
    AND cb.estado = 'ACTIVO'
)
INSERT INTO cuentas_movimientos (
  id_cuenta, id_movimiento, codigo_operativo, nombre_operativo, prioridad, estado
)
SELECT cb.id_cuenta, r.id_movimiento, 'RE', 'Retiro de efectivo', 100, 'ACTIVO'
FROM cuentas_bac cb
CROSS JOIN retiro r
ON CONFLICT (id_cuenta, id_movimiento) DO UPDATE
SET codigo_operativo = excluded.codigo_operativo,
    nombre_operativo = excluded.nombre_operativo,
    estado = 'ACTIVO',
    fecha_modificacion = now();

-- Completa el efecto de los RE recien asociados a BAC.
INSERT INTO efectos_movimientos (
  id_cuenta_movimiento,
  afecta_efectivo,
  direccion_efectivo,
  afecta_cuenta,
  direccion_cuenta,
  genera_pendiente,
  tipo_pendiente,
  requiere_contraparte,
  permite_conversion,
  permite_credito,
  observaciones
)
SELECT
  cm.id_cuenta_movimiento,
  true,
  'SALE',
  true,
  'SALE',
  false,
  null,
  false,
  false,
  false,
  'Direccion operativa sincronizada con el catalogo'
FROM cuentas_movimientos cm
JOIN cuentas_bancarias cb ON cb.id_cuenta = cm.id_cuenta
JOIN entidades_bancarias eb ON eb.id_entidad = cb.id_entidad
WHERE cm.estado = 'ACTIVO'
  AND eb.codigo = 'BAC'
  AND upper(cm.codigo_operativo) = 'RE'
ON CONFLICT (id_cuenta_movimiento) DO NOTHING;

-- Las operaciones del catalogo inicial alimentan ingresos y egresos de la
-- cuenta con la misma direccion mostrada en la tabla de Saldos.
UPDATE efectos_movimientos ef
SET afecta_cuenta = true,
    direccion_cuenta = ef.direccion_efectivo,
    observaciones = 'Direccion operativa sincronizada con el catalogo'
FROM cuentas_movimientos cm
WHERE cm.id_cuenta_movimiento = ef.id_cuenta_movimiento
  AND cm.estado = 'ACTIVO'
  AND ef.afecta_efectivo = true
  AND ef.direccion_efectivo IS NOT NULL;

-- Recupera el efecto bancario de transacciones ya registradas. La condicion
-- NOT EXISTS mantiene la migracion idempotente.
INSERT INTO movimientos_cuentas (
  id_transaccion, id_cuenta, id_moneda, direccion, monto
)
SELECT
  tr.id_transaccion,
  cm.id_cuenta,
  cb.id_moneda,
  ef.direccion_cuenta,
  tr.monto_original
FROM transacciones tr
JOIN cuentas_movimientos cm ON cm.id_cuenta_movimiento = tr.id_cuenta_movimiento
JOIN cuentas_bancarias cb ON cb.id_cuenta = cm.id_cuenta
JOIN efectos_movimientos ef ON ef.id_cuenta_movimiento = cm.id_cuenta_movimiento
WHERE tr.estado <> 'ANULADA'
  AND ef.afecta_cuenta
  AND ef.direccion_cuenta IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM movimientos_cuentas existing
    WHERE existing.id_transaccion = tr.id_transaccion
      AND existing.id_cuenta = cm.id_cuenta
      AND existing.es_reverso = false
  );

-- Si la migracion ya habia creado movimientos, conserva su monto pero alinea
-- la direccion con la regla vigente.
UPDATE movimientos_cuentas mc
SET direccion = ef.direccion_cuenta
FROM transacciones tr
JOIN efectos_movimientos ef ON ef.id_cuenta_movimiento = tr.id_cuenta_movimiento
WHERE mc.id_transaccion = tr.id_transaccion
  AND mc.es_reverso = false
  AND ef.afecta_cuenta
  AND ef.direccion_cuenta IS NOT NULL;

COMMIT;
