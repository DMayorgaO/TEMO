ALTER TABLE temo.solicitudes_financieras
  DROP CONSTRAINT IF EXISTS solicitudes_financieras_operacion_check;
ALTER TABLE temo.solicitudes_financieras
  ADD CONSTRAINT solicitudes_financieras_operacion_check CHECK (operacion IN (
    'CREAR_TRANSACCIONES','CREAR_TRANSFERENCIA','LIQUIDAR_PENDIENTE','LIQUIDAR_PENDIENTES',
    'EDITAR_TRANSACCION','ANULAR_TRANSACCION','EDITAR_GRUPO'
  ));
