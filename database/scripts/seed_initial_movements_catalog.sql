-- Catalogo inicial de movimientos por entidad, basado en el archivo actual de Miscelanea Olivera.
-- Ejecutar despues de tener creadas entidades bancarias, monedas y cuentas bancarias NIO/USD.

BEGIN;

SET search_path TO temo, public;

DROP TABLE IF EXISTS tmp_catalogo_movimientos;

CREATE TEMP TABLE tmp_catalogo_movimientos (
  banco_codigo VARCHAR(40) NOT NULL,
  movimiento_codigo VARCHAR(80) NOT NULL,
  nombre VARCHAR(180) NOT NULL,
  codigo_operativo VARCHAR(40) NOT NULL,
  direccion VARCHAR(20) NOT NULL CHECK (direccion IN ('INGRESO', 'SALIDA')),
  prioridad INTEGER NOT NULL
);

INSERT INTO tmp_catalogo_movimientos
  (banco_codigo, movimiento_codigo, nombre, codigo_operativo, direccion, prioridad)
VALUES
  -- BAC
  ('BAC', 'DEPOSITOS_A_CUENTA', 'Depositos a cuenta', 'DC', 'INGRESO', 10),
  ('BAC', 'PAGO_DE_PRESTAMOS', 'Pago de prestamos', 'PP', 'INGRESO', 20),
  ('BAC', 'PAGO_DE_SERVICIOS_BASICOS', 'Pago de servicios basicos', 'PSB', 'INGRESO', 30),
  ('BAC', 'PAGO_DE_TARJETAS_DE_CREDITO', 'Pago de tarjetas de credito', 'PTC', 'INGRESO', 40),
  ('BAC', 'CASA_VISION', 'Casa Vision', 'CV', 'INGRESO', 50),
  ('BAC', 'TIGO_HOGAR', 'Tigo Hogar', 'TH', 'INGRESO', 60),
  ('BAC', 'TIGO_MOVIL', 'Tigo Movil', 'TM', 'INGRESO', 70),
  ('BAC', 'CLARO', 'Claro', 'C', 'INGRESO', 80),
  ('BAC', 'RETIRO_CON_TARJETA', 'Retiro con tarjeta', 'RT', 'SALIDA', 90),
  ('BAC', 'RETIRO_CON_CODIGO', 'Retiro con codigo', 'RC', 'SALIDA', 100),
  ('BAC', 'YOTA_CORDOBAS', 'Yota Cordobas', 'YC', 'INGRESO', 110),
  ('BAC', 'YOTA_DOLARES', 'Yota Dolares', 'YD', 'INGRESO', 120),
  ('BAC', 'INSS', 'INSS', 'I', 'INGRESO', 130),

  -- BANPRO
  ('BANPRO', 'OTRO_NICARAGUA', 'Otro Nicaragua', 'L', 'INGRESO', 10),
  ('BANPRO', 'DEPOSITO_DE_BILLETERA_MOVIL', 'Deposito de billetera movil', 'DBM', 'INGRESO', 20),
  ('BANPRO', 'DEPOSITO_MI_FAMILIA', 'Deposito Mi Familia', 'DMF', 'INGRESO', 30),
  ('BANPRO', 'DEPOSITOS_A_CUENTA', 'Depositos a cuenta', 'DC', 'INGRESO', 40),
  ('BANPRO', 'PAGO_DE_IMPUESTOS', 'Pago de impuestos', 'DGI', 'INGRESO', 50),
  ('BANPRO', 'PAGO_DE_PRESTAMOS', 'Pago de prestamos', 'PP', 'INGRESO', 60),
  ('BANPRO', 'PAGO_DE_SERVICIOS_BASICOS', 'Pago de servicios basicos', 'PSB', 'INGRESO', 70),
  ('BANPRO', 'PAGO_DE_SERVICIOS_POLICIALES', 'Pago de servicios policiales', 'PSP', 'INGRESO', 80),
  ('BANPRO', 'PAGO_DE_TARJETAS_DE_CREDITO', 'Pago de tarjetas de credito', 'PTC', 'INGRESO', 90),
  ('BANPRO', 'REMESA_INTERNACIONAL', 'Remesa internacional', 'RI', 'SALIDA', 100),
  ('BANPRO', 'RETIRO_DE_BILLETERA_MOVIL', 'Retiro de billetera movil', 'RBM', 'SALIDA', 110),
  ('BANPRO', 'RETIRO_DE_EFECTIVO', 'Retiro de efectivo', 'RE', 'SALIDA', 120),
  ('BANPRO', 'RETIRO_MI_FAMILIA', 'Retiro Mi Familia', 'RMF', 'SALIDA', 130),
  ('BANPRO', 'AVON', 'Avon', 'A', 'INGRESO', 140),
  ('BANPRO', 'INSTA_CREDIT', 'Insta Credit', 'IC', 'INGRESO', 150),
  ('BANPRO', 'GALLO_MAS_GALLO', 'Gallo Mas Gallo', 'GMG', 'INGRESO', 160),
  ('BANPRO', 'COMPRA_DE_RECARGA', 'Compra de recarga', 'CR', 'INGRESO', 170),
  ('BANPRO', 'REPOSICION_DE_CEDULA', 'Reposicion de cedula', 'RDC', 'INGRESO', 180),
  ('BANPRO', 'RETIRO_AGB', 'Retiro AGB', 'R', 'SALIDA', 190),
  ('BANPRO', 'ENVIO_AGB', 'Envio AGB', 'E', 'INGRESO', 200),
  ('BANPRO', 'POLICIA_NACIONAL', 'Policia Nacional', 'PN', 'INGRESO', 210),
  ('BANPRO', 'SEGURO_FACULTATIVO', 'Seguro facultativo', 'SF', 'INGRESO', 220),
  ('BANPRO', 'DGI', 'DGI', 'D', 'INGRESO', 230),
  ('BANPRO', 'PAGO_CLARO_RECARGAS', 'Pago Claro recargas', 'PCR', 'INGRESO', 240),
  ('BANPRO', 'FINANCIERA_FAMA', 'Financiera Fama', 'FF', 'INGRESO', 250),
  ('BANPRO', 'ALCALDIA_MANAGUA', 'Alcaldia Managua', 'AM', 'INGRESO', 260),
  ('BANPRO', 'INSS', 'INSS', 'I', 'INGRESO', 270),
  ('BANPRO', 'FAMA', 'Fama', 'F', 'INGRESO', 280),
  ('BANPRO', 'FINANCIERA_FDL', 'Financiera FDL', 'FDL', 'INGRESO', 290),
  ('BANPRO', 'DEPOSITO_BDF', 'Deposito BDF', 'DBDF', 'INGRESO', 300),
  ('BANPRO', 'RETIRO_BDF', 'Retiro BDF', 'RBDF', 'SALIDA', 310),
  ('BANPRO', 'PAGO_PRESTAMO_BDF', 'Pago prestamo BDF', 'PPBDF', 'INGRESO', 320),
  ('BANPRO', 'PAGO_TARJETA_BDF', 'Pago tarjeta BDF', 'PTBDF', 'INGRESO', 330),
  ('BANPRO', 'RETIRO_DIGITAL', 'Retiro digital', 'RD', 'SALIDA', 340),

  -- LAFISE
  ('LAFISE', 'DEPOSITOS_A_CUENTA', 'Depositos a cuenta', 'DC', 'INGRESO', 10),
  ('LAFISE', 'PAGO_DE_PRESTAMOS', 'Pago de prestamos', 'PP', 'INGRESO', 20),
  ('LAFISE', 'PAGO_DE_SERVICIOS_BASICOS', 'Pago de servicios basicos', 'PSB', 'INGRESO', 30),
  ('LAFISE', 'PAGO_DE_TARJETAS_DE_CREDITO', 'Pago de tarjetas de credito', 'PTC', 'INGRESO', 40),
  ('LAFISE', 'RECARGA_TARJETA_PREPAGO_JOVEN_VISA', 'Recarga de tarjeta prepago de Joven Visa', 'PRE', 'INGRESO', 50),
  ('LAFISE', 'REMESA_INTERNACIONAL', 'Remesa internacional', 'RI', 'SALIDA', 60),
  ('LAFISE', 'RETIRO_DE_EFECTIVO', 'Retiro de efectivo', 'RE', 'SALIDA', 70),
  ('LAFISE', 'ENVIO_VELOZ', 'Envio veloz', 'EV', 'INGRESO', 80),
  ('LAFISE', 'RETIRO_VELOZ', 'Retiro veloz', 'RV', 'SALIDA', 90),
  ('LAFISE', 'AVON', 'Avon', 'A', 'INGRESO', 100),
  ('LAFISE', 'SEGURO_OBLIGATORIO', 'Seguro obligatorio', 'SO', 'INGRESO', 110),

  -- TELEDOLAR
  ('TELEDOLAR', 'PAGO_REMESAS', 'Pago remesas', 'PR', 'SALIDA', 10),
  ('TELEDOLAR', 'ENVIO_REMESAS', 'Envio remesas', 'ER', 'INGRESO', 20),

  -- PEX
  ('PEX', 'PAGO_TARJETAS_FICOHSA', 'Pago tarjetas Ficohsa', 'PTF', 'INGRESO', 10),
  ('PEX', 'PAGO_TARJETA_BDF', 'Pago tarjeta BDF', 'PTBDF', 'INGRESO', 20),
  ('PEX', 'PAGO_TARJETAS_AVANZ', 'Pago tarjetas Avanz', 'PTA', 'INGRESO', 30),
  ('PEX', 'PAGO_PRESTAMO_FICOHSA', 'Pago prestamo Ficohsa', 'PPF', 'INGRESO', 40),
  ('PEX', 'PAGO_PRESTAMO_BDF', 'Pago prestamo BDF', 'PPBDF', 'INGRESO', 50),
  ('PEX', 'PAGO_PRESTAMO_AVANZ', 'Pago prestamo Avanz', 'PPA', 'INGRESO', 60),
  ('PEX', 'FINANCIERA_FDL', 'Financiera FDL', 'FDL', 'INGRESO', 70),
  ('PEX', 'FAMA', 'Fama', 'FA', 'INGRESO', 80),
  ('PEX', 'PAGO_DE_SERVICIOS_BASICOS', 'Pago de servicios basicos', 'PSB', 'INGRESO', 90),
  ('PEX', 'RETIRO_DE_EFECTIVO', 'Retiro de efectivo', 'RE', 'SALIDA', 100),
  ('PEX', 'DEPOSITO_FICOHSA', 'Deposito Ficohsa', 'DF', 'INGRESO', 110),
  ('PEX', 'DEPOSITO_BDF', 'Deposito BDF', 'DBDF', 'INGRESO', 120),
  ('PEX', 'DEPOSITO_AVANZ', 'Deposito Avanz', 'DA', 'INGRESO', 130);

-- El catalogo queda agrupado por movimiento base; el codigo operativo se conserva por entidad.
INSERT INTO movimientos (codigo, nombre, descripcion, estado)
SELECT DISTINCT
  movimiento_codigo,
  nombre,
  'Catalogo inicial desde Registro.xlsm',
  'ACTIVO'::estado_registro
FROM tmp_catalogo_movimientos
ON CONFLICT (codigo) DO UPDATE
SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  estado = 'ACTIVO'::estado_registro,
  fecha_modificacion = now();

-- Este script define el catalogo inicial de movimientos por cuenta; reemplaza las asociaciones iniciales.
DELETE FROM efectos_movimientos
WHERE id_cuenta_movimiento IN (SELECT id_cuenta_movimiento FROM cuentas_movimientos);

DELETE FROM cuentas_movimientos;

INSERT INTO cuentas_movimientos
  (id_cuenta, id_movimiento, codigo_operativo, nombre_operativo, prioridad, estado)
SELECT
  c.id_cuenta,
  m.id_movimiento,
  tc.codigo_operativo,
  tc.nombre,
  tc.prioridad,
  'ACTIVO'::estado_registro
FROM tmp_catalogo_movimientos tc
JOIN entidades_bancarias e ON e.codigo = tc.banco_codigo
JOIN cuentas_bancarias c ON c.id_entidad = e.id_entidad
JOIN monedas mo ON mo.id_moneda = c.id_moneda AND mo.codigo IN ('NIO', 'USD')
JOIN movimientos m ON m.codigo = tc.movimiento_codigo
ON CONFLICT (id_cuenta, id_movimiento) DO UPDATE
SET
  codigo_operativo = EXCLUDED.codigo_operativo,
  nombre_operativo = EXCLUDED.nombre_operativo,
  prioridad = EXCLUDED.prioridad,
  estado = 'ACTIVO'::estado_registro,
  fecha_modificacion = now();

INSERT INTO efectos_movimientos
  (id_cuenta_movimiento, afecta_efectivo, direccion_efectivo, afecta_cuenta, direccion_cuenta, observaciones)
SELECT
  cm.id_cuenta_movimiento,
  true,
  CASE tc.direccion
    WHEN 'INGRESO' THEN 'ENTRA'::direccion_monto
    ELSE 'SALE'::direccion_monto
  END,
  false,
  NULL,
  'Direccion tomada del catalogo inicial'
FROM cuentas_movimientos cm
JOIN cuentas_bancarias c ON c.id_cuenta = cm.id_cuenta
JOIN entidades_bancarias e ON e.id_entidad = c.id_entidad
JOIN movimientos m ON m.id_movimiento = cm.id_movimiento
JOIN tmp_catalogo_movimientos tc
  ON tc.banco_codigo = e.codigo
 AND tc.movimiento_codigo = m.codigo
 AND tc.codigo_operativo = cm.codigo_operativo
ON CONFLICT (id_cuenta_movimiento) DO UPDATE
SET
  afecta_efectivo = EXCLUDED.afecta_efectivo,
  direccion_efectivo = EXCLUDED.direccion_efectivo,
  afecta_cuenta = EXCLUDED.afecta_cuenta,
  direccion_cuenta = EXCLUDED.direccion_cuenta,
  observaciones = EXCLUDED.observaciones;

COMMIT;

SELECT
  (SELECT count(*) FROM movimientos WHERE codigo IN (SELECT DISTINCT movimiento_codigo FROM tmp_catalogo_movimientos)) AS movimientos_agrupados,
  (SELECT count(*) FROM cuentas_movimientos) AS asociaciones_por_cuenta,
  (SELECT count(*) FROM efectos_movimientos) AS efectos_registrados;
