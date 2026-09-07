BEGIN;

SET search_path TO temo, extensions, public;

CREATE TEMP TABLE catalogo_operativo_inicial (
  entidad_codigo text NOT NULL,
  movimiento_codigo text NOT NULL,
  nombre text NOT NULL,
  codigo_operativo text NOT NULL,
  direccion direccion_monto NOT NULL,
  prioridad integer NOT NULL,
  monedas text[] NOT NULL DEFAULT ARRAY['NIO', 'USD']::text[]
) ON COMMIT DROP;

INSERT INTO catalogo_operativo_inicial
  (entidad_codigo, movimiento_codigo, nombre, codigo_operativo, direccion, prioridad, monedas)
VALUES
  ('BAC', 'DEPOSITO_CUENTA', 'Depositos a cuenta', 'DC', 'ENTRA', 10, ARRAY['NIO','USD']),
  ('BAC', 'PAGO_PRESTAMO', 'Pago de prestamos', 'PP', 'ENTRA', 20, ARRAY['NIO','USD']),
  ('BAC', 'PAGO_SERVICIO_BASICO', 'Pago de servicios basicos', 'PSB', 'ENTRA', 30, ARRAY['NIO','USD']),
  ('BAC', 'PAGO_TARJETAS_CREDITO', 'Pago de tarjetas de credito', 'PTC', 'ENTRA', 40, ARRAY['NIO','USD']),
  ('BAC', 'CASA_VISION', 'Casa Vision', 'CV', 'ENTRA', 50, ARRAY['NIO','USD']),
  ('BAC', 'TIGO_HOGAR', 'Tigo Hogar', 'TH', 'ENTRA', 60, ARRAY['NIO','USD']),
  ('BAC', 'TIGO_MOVIL', 'Tigo Movil', 'TM', 'ENTRA', 70, ARRAY['NIO','USD']),
  ('BAC', 'RETIRO_EFECTIVO', 'Retiro efectivo', 'RE', 'SALE', 80, ARRAY['NIO','USD']),
  ('BAC', 'RETIRO_CON_CODIGO', 'Retiro con codigo', 'RC', 'SALE', 90, ARRAY['NIO']),
  ('BAC', 'YOTA_CORDOBAS', 'Yota Cordobas', 'YC', 'ENTRA', 100, ARRAY['NIO','USD']),
  ('BAC', 'SEGURO_FACULTATIVO', 'Seguro facultativo', 'SF', 'ENTRA', 110, ARRAY['NIO','USD']),

  ('BANPRO', 'LOTO_NICARAGUA', 'Loto Nicaragua', 'L', 'ENTRA', 10, ARRAY['NIO','USD']),
  ('BANPRO', 'DEPOSITO_BILLETERA_MOVIL', 'Deposito de billetera movil', 'DBM', 'ENTRA', 20, ARRAY['NIO','USD']),
  ('BANPRO', 'DEPOSITO_MI_FAMILIA', 'Deposito Mi Familia', 'DMF', 'ENTRA', 30, ARRAY['NIO','USD']),
  ('BANPRO', 'DEPOSITO_CUENTA', 'Depositos a cuenta', 'DC', 'ENTRA', 40, ARRAY['NIO','USD']),
  ('BANPRO', 'PAGO_IMPUESTOS', 'Pago de impuestos', 'DGI', 'ENTRA', 50, ARRAY['NIO','USD']),
  ('BANPRO', 'PAGO_PRESTAMO', 'Pago de prestamos', 'PP', 'ENTRA', 60, ARRAY['NIO','USD']),
  ('BANPRO', 'PAGO_SERVICIO_BASICO', 'Pago de servicios basicos', 'PSB', 'ENTRA', 70, ARRAY['NIO','USD']),
  ('BANPRO', 'PAGO_TARJETAS_CREDITO', 'Pago de tarjetas de credito', 'PTC', 'ENTRA', 80, ARRAY['NIO','USD']),
  ('BANPRO', 'REMESA_INTERNACIONAL', 'Remesa internacional', 'RI', 'SALE', 90, ARRAY['NIO','USD']),
  ('BANPRO', 'RETIRO_BILLETERA_MOVIL', 'Retiro de billetera movil', 'RBM', 'SALE', 100, ARRAY['NIO','USD']),
  ('BANPRO', 'RETIRO_EFECTIVO', 'Retiro efectivo', 'RE', 'SALE', 110, ARRAY['NIO','USD']),
  ('BANPRO', 'RETIRO_MI_FAMILIA', 'Retiro Mi Familia', 'RMF', 'SALE', 120, ARRAY['NIO','USD']),
  ('BANPRO', 'AVON', 'Avon', 'A', 'ENTRA', 130, ARRAY['NIO','USD']),
  ('BANPRO', 'INSTA_CREDIT', 'Insta Credit', 'IC', 'ENTRA', 140, ARRAY['NIO','USD']),
  ('BANPRO', 'GALLO_MAS_GALLO', 'Gallo Mas Gallo', 'GMG', 'ENTRA', 150, ARRAY['NIO','USD']),
  ('BANPRO', 'TGR_REPOSICION_CEDULA', 'TGR Reposicion Cedula', 'TGR', 'ENTRA', 160, ARRAY['NIO','USD']),
  ('BANPRO', 'RETIRO_AGB', 'Retiro AGB', 'R', 'SALE', 170, ARRAY['NIO','USD']),
  ('BANPRO', 'ENVIO_AGB', 'Envio AGB', 'E', 'ENTRA', 180, ARRAY['NIO','USD']),
  ('BANPRO', 'POLICIA_NACIONAL', 'Policia Nacional', 'PN', 'ENTRA', 190, ARRAY['NIO','USD']),
  ('BANPRO', 'SEGURO_FACULTATIVO', 'Seguro facultativo', 'SF', 'ENTRA', 200, ARRAY['NIO','USD']),
  ('BANPRO', 'FINANCIERA_FAMA', 'Financiera Fama', 'FF', 'ENTRA', 210, ARRAY['NIO','USD']),
  ('BANPRO', 'FINANCIERA_FDL', 'Financiera FDL', 'FDL', 'ENTRA', 220, ARRAY['NIO','USD']),
  ('BANPRO', 'DEPOSITO_BDF', 'Deposito BDF', 'DBDF', 'ENTRA', 230, ARRAY['NIO','USD']),
  ('BANPRO', 'PAGO_PRESTAMO_BDF', 'Pago prestamo BDF', 'PPBDF', 'ENTRA', 240, ARRAY['NIO','USD']),
  ('BANPRO', 'PAGO_TARJETA_BDF', 'Pago Tarjeta BDF', 'PTBDF', 'ENTRA', 250, ARRAY['NIO','USD']),
  ('BANPRO', 'RETIRO_DIGITAL', 'Retiro digital', 'RD', 'SALE', 260, ARRAY['NIO','USD']),

  ('LAFISE', 'DEPOSITO_CUENTA', 'Depositos a cuenta', 'DC', 'ENTRA', 10, ARRAY['NIO','USD']),
  ('LAFISE', 'PAGO_PRESTAMO', 'Pago de prestamos', 'PP', 'ENTRA', 20, ARRAY['NIO','USD']),
  ('LAFISE', 'PAGO_SERVICIO_BASICO', 'Pago de servicios basicos', 'PSB', 'ENTRA', 30, ARRAY['NIO','USD']),
  ('LAFISE', 'PAGO_TARJETAS_CREDITO', 'Pago de tarjetas de credito', 'PTC', 'ENTRA', 40, ARRAY['NIO','USD']),
  ('LAFISE', 'RECARGA_TARJETA_JOVEN_VISA', 'Recarga de tarjeta prepago de Joven Visa', 'PRE', 'ENTRA', 50, ARRAY['NIO','USD']),
  ('LAFISE', 'REMESA_INTERNACIONAL', 'Remesa internacional', 'RI', 'SALE', 60, ARRAY['NIO','USD']),
  ('LAFISE', 'RETIRO_EFECTIVO', 'Retiro efectivo', 'RE', 'SALE', 70, ARRAY['NIO','USD']),
  ('LAFISE', 'ENVIO_VELOZ', 'Envio Veloz', 'EV', 'ENTRA', 80, ARRAY['NIO','USD']),
  ('LAFISE', 'RETIRO_VELOZ', 'Retiro Veloz', 'RV', 'SALE', 90, ARRAY['NIO','USD']),
  ('LAFISE', 'SEGURO_OBLIGATORIO', 'Seguro obligatorio', 'SO', 'ENTRA', 100, ARRAY['NIO','USD']),

  ('TELEDOLAR', 'PAGO_REMESA', 'Pago Remesas', 'PR', 'SALE', 10, ARRAY['NIO','USD']),
  ('TELEDOLAR', 'ENVIO_REMESA', 'Envio Remesas', 'ER', 'ENTRA', 20, ARRAY['NIO','USD']),

  ('PEX', 'PAGO_TARJETAS_FICOHSA', 'Pago Tarjetas Ficohsa', 'PTF', 'ENTRA', 10, ARRAY['NIO','USD']),
  ('PEX', 'PAGO_TARJETAS_AVANZ', 'Pago Tarjetas Avanz', 'PTA', 'ENTRA', 20, ARRAY['NIO','USD']),
  ('PEX', 'PAGO_PRESTAMO_FICOHSA', 'Pago prestamo Ficohsa', 'PPF', 'ENTRA', 30, ARRAY['NIO','USD']),
  ('PEX', 'PAGO_PRESTAMO_AVANZ', 'Pago prestamo Avanz', 'PPA', 'ENTRA', 40, ARRAY['NIO','USD']),
  ('PEX', 'FDL', 'FDL', 'FDL', 'ENTRA', 50, ARRAY['NIO','USD']),
  ('PEX', 'FINANCIERA_FAMA', 'Financiera Fama', 'FF', 'ENTRA', 60, ARRAY['NIO','USD']),
  ('PEX', 'PAGO_SERVICIO_BASICO', 'Pago de servicios basicos', 'PSB', 'ENTRA', 70, ARRAY['NIO','USD']),
  ('PEX', 'RETIRO_EFECTIVO', 'Retiro efectivo', 'RE', 'SALE', 80, ARRAY['NIO','USD']),
  ('PEX', 'DEPOSITO_FICOHSA', 'Deposito Ficohsa', 'DF', 'ENTRA', 90, ARRAY['NIO','USD']),
  ('PEX', 'DEPOSITO_AVANZ', 'Deposito Avanz', 'DA', 'ENTRA', 100, ARRAY['NIO','USD']);

INSERT INTO movimientos (codigo, nombre, descripcion, estado)
SELECT DISTINCT movimiento_codigo, nombre, 'Catalogo operativo inicial TEMO', 'ACTIVO'::estado_registro
FROM catalogo_operativo_inicial
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cuentas_movimientos
  (id_cuenta, id_movimiento, codigo_operativo, nombre_operativo, prioridad, estado)
SELECT
  cb.id_cuenta,
  mv.id_movimiento,
  catalogo.codigo_operativo,
  catalogo.nombre,
  catalogo.prioridad,
  'ACTIVO'::estado_registro
FROM catalogo_operativo_inicial catalogo
JOIN entidades_bancarias entidad
  ON entidad.codigo = catalogo.entidad_codigo
JOIN cuentas_bancarias cb
  ON cb.id_entidad = entidad.id_entidad
JOIN monedas moneda
  ON moneda.id_moneda = cb.id_moneda
 AND moneda.codigo = ANY(catalogo.monedas)
JOIN movimientos mv
  ON mv.codigo = catalogo.movimiento_codigo
ON CONFLICT (id_cuenta, id_movimiento) DO NOTHING;

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
  catalogo.direccion,
  true,
  CASE catalogo.direccion WHEN 'ENTRA' THEN 'SALE'::direccion_monto ELSE 'ENTRA'::direccion_monto END,
  false,
  'Efecto restaurado desde el catalogo operativo inicial'
FROM catalogo_operativo_inicial catalogo
JOIN entidades_bancarias entidad
  ON entidad.codigo = catalogo.entidad_codigo
JOIN cuentas_bancarias cb
  ON cb.id_entidad = entidad.id_entidad
JOIN monedas moneda
  ON moneda.id_moneda = cb.id_moneda
 AND moneda.codigo = ANY(catalogo.monedas)
JOIN movimientos mv
  ON mv.codigo = catalogo.movimiento_codigo
JOIN cuentas_movimientos cm
  ON cm.id_cuenta = cb.id_cuenta
 AND cm.id_movimiento = mv.id_movimiento
ON CONFLICT (id_cuenta_movimiento) DO NOTHING;

COMMIT;
