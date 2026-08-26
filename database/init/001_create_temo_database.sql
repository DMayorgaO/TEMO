-- TEMO - Sistema Web de Transacciones Economicas de Miscelanea Olivera
-- Motor recomendado: PostgreSQL 16+
-- Modelo base en espanol para etapa local.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS temo;
SET search_path TO temo, public;

-- =========================================================
-- Enumeraciones
-- =========================================================

DO $$ BEGIN
  CREATE TYPE estado_registro AS ENUM ('ACTIVO', 'INACTIVO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_usuario AS ENUM ('ACTIVO', 'INACTIVO', 'BLOQUEADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_entidad_bancaria AS ENUM ('BANCO_REAL', 'SERVICIO_FINANCIERO', 'SERVICIO_REMESAS', 'OTRO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_cuenta_bancaria AS ENUM ('CUENTA_REAL', 'SALDO_OPERATIVO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alcance_cuenta AS ENUM ('GLOBAL', 'SUCURSAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_turno AS ENUM ('ABIERTO', 'PENDIENTE_APROBACION', 'CERRADO', 'ANULADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_transaccion AS ENUM ('REGISTRADA', 'ANULADA', 'CORREGIDA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE direccion_monto AS ENUM ('ENTRA', 'SALE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE medio_monto AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'CREDITO', 'CUENTA_BANCARIA', 'AJUSTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_metodo_pago AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'CREDITO', 'MIXTO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_pendiente AS ENUM ('POR_COBRAR', 'POR_PAGAR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_pendiente AS ENUM ('PENDIENTE', 'ABONADO', 'PAGADO', 'VENCIDO', 'CANCELADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_calculo_comision AS ENUM ('PORCENTAJE', 'FIJO', 'RANGO', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_aprobacion AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_arqueo AS ENUM (
    'APERTURA',
    'CIERRE_CALCULADO',
    'CIERRE_CONTADO',
    'AJUSTE',
    'TRANSACCION_RECIBIDO',
    'TRANSACCION_ENTREGADO',
    'TRANSACCION_VUELTO',
    'PENDIENTE_RECIBIDO',
    'PENDIENTE_ENTREGADO',
    'PENDIENTE_VUELTO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_grupo_transacciones AS ENUM ('ABIERTO', 'COMPLETADO', 'ANULADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_tasa_aplicada AS ENUM ('COMPRA', 'VENTA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_cierre AS ENUM ('ABIERTO', 'PENDIENTE_REVISION', 'CERRADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE accion_bitacora AS ENUM ('CREAR', 'ACTUALIZAR', 'ANULAR', 'CORREGIR', 'APROBAR', 'RECHAZAR', 'INICIAR_SESION', 'CERRAR_SESION', 'IMPORTAR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- Funciones utilitarias
-- =========================================================

CREATE OR REPLACE FUNCTION actualizar_fecha_modificacion()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fecha_modificacion = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- Seguridad
-- =========================================================

CREATE TABLE IF NOT EXISTS roles (
  id_rol UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(40) NOT NULL UNIQUE,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  descripcion TEXT,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permisos (
  id_permiso UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(80) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles_permisos (
  id_rol UUID NOT NULL REFERENCES roles(id_rol) ON DELETE CASCADE,
  id_permiso UUID NOT NULL REFERENCES permisos(id_permiso) ON DELETE CASCADE,
  PRIMARY KEY (id_rol, id_permiso)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_rol UUID NOT NULL REFERENCES roles(id_rol),
  nombres VARCHAR(80) NOT NULL,
  apellidos VARCHAR(120) NOT NULL,
  nombre_completo VARCHAR(180) GENERATED ALWAYS AS (trim(nombres || ' ' || apellidos)) STORED,
  usuario VARCHAR(60) NOT NULL UNIQUE,
  correo VARCHAR(160) UNIQUE,
  contrasena_hash TEXT NOT NULL,
  debe_cambiar_contrasena BOOLEAN NOT NULL DEFAULT true,
  estado estado_usuario NOT NULL DEFAULT 'ACTIVO',
  ultimo_acceso TIMESTAMPTZ,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispositivos (
  id_dispositivo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID REFERENCES usuarios(id_usuario),
  nombre_dispositivo VARCHAR(120),
  huella_dispositivo VARCHAR(255) UNIQUE,
  direccion_ip INET,
  agente_usuario TEXT,
  primera_vez TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_vez TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- Organizacion fisica
-- =========================================================

CREATE TABLE IF NOT EXISTS sucursales (
  id_sucursal UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(30) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  direccion TEXT,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cajas (
  id_caja UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_sucursal UUID NOT NULL REFERENCES sucursales(id_sucursal),
  codigo VARCHAR(30) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cajas_sucursal_codigo UNIQUE (id_sucursal, codigo)
);

-- =========================================================
-- Catalogos financieros medulares
-- =========================================================

CREATE TABLE IF NOT EXISTS monedas (
  id_moneda UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo CHAR(3) NOT NULL UNIQUE,
  nombre VARCHAR(80) NOT NULL,
  simbolo VARCHAR(8) NOT NULL,
  decimales SMALLINT NOT NULL DEFAULT 2 CHECK (decimales BETWEEN 0 AND 6),
  estado estado_registro NOT NULL DEFAULT 'ACTIVO'
);

CREATE TABLE IF NOT EXISTS denominaciones (
  id_denominacion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_moneda UUID NOT NULL REFERENCES monedas(id_moneda),
  valor NUMERIC(14, 2) NOT NULL CHECK (valor > 0),
  etiqueta VARCHAR(40) NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT uq_denominaciones_moneda_valor UNIQUE (id_moneda, valor)
);

CREATE TABLE IF NOT EXISTS entidades_bancarias (
  id_entidad UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(30) NOT NULL UNIQUE,
  nombre_corto VARCHAR(40) NOT NULL,
  nombre_largo VARCHAR(180) NOT NULL,
  tipo tipo_entidad_bancaria NOT NULL,
  mostrar_como_banco BOOLEAN NOT NULL DEFAULT true,
  maneja_saldo BOOLEAN NOT NULL DEFAULT true,
  maneja_comision BOOLEAN NOT NULL DEFAULT true,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cuentas_bancarias (
  id_cuenta UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_entidad UUID NOT NULL REFERENCES entidades_bancarias(id_entidad),
  id_moneda UUID NOT NULL REFERENCES monedas(id_moneda),
  tipo_cuenta tipo_cuenta_bancaria NOT NULL DEFAULT 'CUENTA_REAL',
  consecutivo INTEGER NOT NULL CHECK (consecutivo > 0),
  alias VARCHAR(80) NOT NULL,
  numero_cuenta VARCHAR(80),
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cuentas_entidad_moneda_consecutivo UNIQUE (id_entidad, id_moneda, consecutivo),
  CONSTRAINT uq_cuentas_alias UNIQUE (alias)
);

CREATE TABLE IF NOT EXISTS cuentas_sucursales (
  id_cuenta UUID NOT NULL REFERENCES cuentas_bancarias(id_cuenta) ON DELETE CASCADE,
  id_sucursal UUID NOT NULL REFERENCES sucursales(id_sucursal) ON DELETE CASCADE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_cuenta, id_sucursal)
);

CREATE TABLE IF NOT EXISTS movimientos (
  id_movimiento UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(40) NOT NULL UNIQUE,
  nombre VARCHAR(160) NOT NULL,
  descripcion TEXT,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cuentas_movimientos (
  id_cuenta_movimiento UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cuenta UUID NOT NULL REFERENCES cuentas_bancarias(id_cuenta) ON DELETE CASCADE,
  id_movimiento UUID NOT NULL REFERENCES movimientos(id_movimiento),
  codigo_operativo VARCHAR(40) NOT NULL,
  nombre_operativo VARCHAR(180) NOT NULL,
  prioridad INTEGER NOT NULL DEFAULT 100,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cuentas_movimientos UNIQUE (id_cuenta, id_movimiento),
  CONSTRAINT uq_cuentas_codigo_operativo UNIQUE (id_cuenta, codigo_operativo)
);

CREATE TABLE IF NOT EXISTS reglas_comisiones (
  id_comision UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_entidad UUID NOT NULL REFERENCES entidades_bancarias(id_entidad),
  id_moneda UUID NOT NULL REFERENCES monedas(id_moneda),
  id_movimiento UUID NOT NULL REFERENCES movimientos(id_movimiento),
  id_moneda_comision UUID REFERENCES monedas(id_moneda),
  tipo_calculo tipo_calculo_comision NOT NULL,
  porcentaje NUMERIC(9, 6) CHECK (porcentaje IS NULL OR porcentaje >= 0),
  monto_fijo NUMERIC(14, 4) CHECK (monto_fijo IS NULL OR monto_fijo >= 0),
  rango_inicio NUMERIC(16, 4) CHECK (rango_inicio IS NULL OR rango_inicio >= 0),
  rango_fin NUMERIC(16, 4) CHECK (rango_fin IS NULL OR rango_fin > rango_inicio),
  incluida_en_monto_transaccion BOOLEAN NOT NULL DEFAULT true,
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin DATE,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  id_usuario_creacion UUID REFERENCES usuarios(id_usuario),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_comisiones_vigencia CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT ck_comisiones_porcentaje CHECK (
    tipo_calculo NOT IN ('PORCENTAJE', 'RANGO') OR porcentaje IS NOT NULL
  ),
  CONSTRAINT ck_comisiones_fijo CHECK (
    tipo_calculo <> 'FIJO' OR (monto_fijo IS NOT NULL AND id_moneda_comision IS NOT NULL)
  ),
  CONSTRAINT ck_comisiones_rango CHECK (
    tipo_calculo <> 'RANGO' OR rango_inicio IS NOT NULL
  )
);

-- =========================================================
-- Reglas de efecto operativo por movimiento de cuenta
-- =========================================================

CREATE TABLE IF NOT EXISTS efectos_movimientos (
  id_efecto UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cuenta_movimiento UUID NOT NULL UNIQUE REFERENCES cuentas_movimientos(id_cuenta_movimiento) ON DELETE CASCADE,
  afecta_efectivo BOOLEAN NOT NULL DEFAULT true,
  direccion_efectivo direccion_monto,
  afecta_cuenta BOOLEAN NOT NULL DEFAULT true,
  direccion_cuenta direccion_monto,
  genera_pendiente BOOLEAN NOT NULL DEFAULT false,
  tipo_pendiente tipo_pendiente,
  requiere_contraparte BOOLEAN NOT NULL DEFAULT false,
  permite_conversion BOOLEAN NOT NULL DEFAULT false,
  permite_credito BOOLEAN NOT NULL DEFAULT false,
  observaciones TEXT,
  CONSTRAINT ck_efectos_efectivo CHECK (
    (afecta_efectivo = false AND direccion_efectivo IS NULL)
    OR (afecta_efectivo = true AND direccion_efectivo IS NOT NULL)
  ),
  CONSTRAINT ck_efectos_cuenta CHECK (
    (afecta_cuenta = false AND direccion_cuenta IS NULL)
    OR (afecta_cuenta = true AND direccion_cuenta IS NOT NULL)
  ),
  CONSTRAINT ck_efectos_pendiente CHECK (
    (genera_pendiente = false AND tipo_pendiente IS NULL)
    OR (genera_pendiente = true AND tipo_pendiente IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS metodos_pago (
  id_metodo_pago UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(40) NOT NULL UNIQUE,
  nombre VARCHAR(80) NOT NULL,
  tipo tipo_metodo_pago NOT NULL,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO'
);

CREATE TABLE IF NOT EXISTS contrapartes (
  id_contraparte UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(160) NOT NULL,
  tipo VARCHAR(40) NOT NULL DEFAULT 'CLIENTE_PROVEEDOR',
  telefono VARCHAR(40),
  observaciones TEXT,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_contrapartes_nombre_tipo UNIQUE (nombre, tipo)
);

-- =========================================================
-- Tipo de cambio, jornadas, turnos y arqueos
-- =========================================================

CREATE TABLE IF NOT EXISTS tipos_cambio (
  id_tipo_cambio UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tasa_compra NUMERIC(14, 6) NOT NULL CHECK (tasa_compra > 0),
  tasa_venta NUMERIC(14, 6) NOT NULL CHECK (tasa_venta > 0),
  vigente_desde TIMESTAMPTZ NOT NULL DEFAULT now(),
  id_usuario_creacion UUID NOT NULL REFERENCES usuarios(id_usuario),
  observaciones TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jornadas (
  id_jornada UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  id_sucursal UUID REFERENCES sucursales(id_sucursal),
  id_usuario_apertura UUID NOT NULL REFERENCES usuarios(id_usuario),
  id_usuario_cierre UUID REFERENCES usuarios(id_usuario),
  estado estado_cierre NOT NULL DEFAULT 'ABIERTO',
  fecha_apertura TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_cierre TIMESTAMPTZ,
  observaciones TEXT,
  CONSTRAINT uq_jornadas_fecha_sucursal UNIQUE (fecha, id_sucursal)
);

CREATE TABLE IF NOT EXISTS saldos_jornada_cuentas (
  id_saldo_jornada UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_jornada UUID NOT NULL REFERENCES jornadas(id_jornada) ON DELETE CASCADE,
  id_cuenta UUID NOT NULL REFERENCES cuentas_bancarias(id_cuenta),
  saldo_inicial NUMERIC(16, 4) NOT NULL DEFAULT 0,
  saldo_final_calculado NUMERIC(16, 4),
  saldo_final_contado NUMERIC(16, 4),
  diferencia NUMERIC(16, 4),
  CONSTRAINT uq_saldos_jornada_cuenta UNIQUE (id_jornada, id_cuenta)
);

CREATE TABLE IF NOT EXISTS turnos (
  id_turno UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_jornada UUID NOT NULL REFERENCES jornadas(id_jornada),
  id_sucursal UUID NOT NULL REFERENCES sucursales(id_sucursal),
  id_caja UUID NOT NULL REFERENCES cajas(id_caja),
  id_cajero UUID NOT NULL REFERENCES usuarios(id_usuario),
  id_usuario_apertura UUID NOT NULL REFERENCES usuarios(id_usuario),
  id_usuario_cierre UUID REFERENCES usuarios(id_usuario),
  id_usuario_aprobacion UUID REFERENCES usuarios(id_usuario),
  estado estado_turno NOT NULL DEFAULT 'ABIERTO',
  fecha_apertura TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_cierre TIMESTAMPTZ,
  fecha_aprobacion TIMESTAMPTZ,
  efectivo_inicial_nio NUMERIC(16, 4) NOT NULL DEFAULT 0,
  efectivo_inicial_usd NUMERIC(16, 4) NOT NULL DEFAULT 0,
  efectivo_final_nio NUMERIC(16, 4),
  efectivo_final_usd NUMERIC(16, 4),
  observaciones_apertura TEXT,
  observaciones_cierre TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grupos_transacciones (
  id_grupo_transacciones UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_operacion BIGINT GENERATED BY DEFAULT AS IDENTITY UNIQUE,
  id_turno UUID NOT NULL REFERENCES turnos(id_turno),
  id_contraparte UUID REFERENCES contrapartes(id_contraparte),
  estado estado_grupo_transacciones NOT NULL DEFAULT 'ABIERTO',
  id_tipo_cambio_vuelto UUID REFERENCES tipos_cambio(id_tipo_cambio),
  tipo_tasa_vuelto tipo_tasa_aplicada,
  tasa_vuelto_usada NUMERIC(14, 6) CHECK (tasa_vuelto_usada IS NULL OR tasa_vuelto_usada > 0),
  observaciones TEXT,
  id_usuario_creacion UUID NOT NULL REFERENCES usuarios(id_usuario),
  id_usuario_modificacion UUID REFERENCES usuarios(id_usuario),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_grupos_tasa_vuelto CHECK (
    (tipo_tasa_vuelto IS NULL AND tasa_vuelto_usada IS NULL)
    OR (tipo_tasa_vuelto IS NOT NULL AND tasa_vuelto_usada IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS arqueos (
  id_arqueo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_turno UUID REFERENCES turnos(id_turno) ON DELETE CASCADE,
  id_jornada UUID REFERENCES jornadas(id_jornada) ON DELETE CASCADE,
  id_grupo_transacciones UUID REFERENCES grupos_transacciones(id_grupo_transacciones) ON DELETE CASCADE,
  id_caja UUID REFERENCES cajas(id_caja),
  tipo tipo_arqueo NOT NULL,
  id_moneda UUID NOT NULL REFERENCES monedas(id_moneda),
  monto_total NUMERIC(16, 4) NOT NULL DEFAULT 0,
  id_tipo_cambio UUID REFERENCES tipos_cambio(id_tipo_cambio),
  tipo_tasa tipo_tasa_aplicada,
  tasa_usada NUMERIC(14, 6),
  monto_esperado NUMERIC(16, 4),
  diferencia NUMERIC(16, 4)
    GENERATED ALWAYS AS (monto_total - COALESCE(monto_esperado, monto_total)) STORED,
  id_usuario_creacion UUID NOT NULL REFERENCES usuarios(id_usuario),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  observaciones TEXT,
  CONSTRAINT ck_arqueos_alcance CHECK (
    num_nonnulls(id_turno, id_jornada, id_grupo_transacciones) = 1
  ),
  CONSTRAINT ck_arqueos_tasa CHECK (
    (tipo_tasa IS NULL AND tasa_usada IS NULL)
    OR (tipo_tasa IS NOT NULL AND tasa_usada IS NOT NULL AND tasa_usada > 0)
  ),
  CONSTRAINT ck_arqueos_monto_esperado CHECK (
    monto_esperado IS NULL OR monto_esperado >= 0
  ),
  CONSTRAINT ck_arqueos_transaccion CHECK (
    (
      tipo IN ('TRANSACCION_RECIBIDO', 'TRANSACCION_ENTREGADO', 'TRANSACCION_VUELTO')
      AND id_grupo_transacciones IS NOT NULL
      AND monto_esperado IS NOT NULL
      AND tipo_tasa IS NOT NULL
      AND tasa_usada IS NOT NULL
    )
    OR
    (
      tipo NOT IN ('TRANSACCION_RECIBIDO', 'TRANSACCION_ENTREGADO', 'TRANSACCION_VUELTO')
      AND id_grupo_transacciones IS NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS arqueos_denominaciones (
  id_arqueo_denominacion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_arqueo UUID NOT NULL REFERENCES arqueos(id_arqueo) ON DELETE CASCADE,
  id_denominacion UUID NOT NULL REFERENCES denominaciones(id_denominacion),
  cantidad INTEGER NOT NULL CHECK (cantidad >= 0),
  monto NUMERIC(16, 4) NOT NULL CHECK (monto >= 0),
  montones_25 INTEGER NOT NULL DEFAULT 0 CHECK (montones_25 >= 0),
  sueltos INTEGER NOT NULL DEFAULT 0 CHECK (sueltos >= 0),
  CONSTRAINT uq_arqueos_denominaciones UNIQUE (id_arqueo, id_denominacion)
);

-- =========================================================
-- Transacciones
-- =========================================================

CREATE TABLE IF NOT EXISTS transacciones (
  id_transaccion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_turno UUID NOT NULL REFERENCES turnos(id_turno),
  id_sucursal UUID NOT NULL REFERENCES sucursales(id_sucursal),
  id_caja UUID NOT NULL REFERENCES cajas(id_caja),
  id_cajero UUID NOT NULL REFERENCES usuarios(id_usuario),
  id_grupo_transacciones UUID NOT NULL REFERENCES grupos_transacciones(id_grupo_transacciones),
  orden_grupo SMALLINT NOT NULL CHECK (orden_grupo > 0),
  id_cuenta_movimiento UUID NOT NULL REFERENCES cuentas_movimientos(id_cuenta_movimiento),
  id_contraparte UUID REFERENCES contrapartes(id_contraparte),
  id_metodo_pago UUID NOT NULL REFERENCES metodos_pago(id_metodo_pago),
  id_moneda_original UUID NOT NULL REFERENCES monedas(id_moneda),
  monto_original NUMERIC(16, 4) NOT NULL CHECK (monto_original > 0),
  id_tipo_cambio UUID REFERENCES tipos_cambio(id_tipo_cambio),
  tasa_compra_usada NUMERIC(14, 6),
  tasa_venta_usada NUMERIC(14, 6),
  descripcion TEXT,
  estado estado_transaccion NOT NULL DEFAULT 'REGISTRADA',
  consecutivo_turno INTEGER,
  fecha_transaccion TIMESTAMPTZ NOT NULL DEFAULT now(),
  id_usuario_creacion UUID NOT NULL REFERENCES usuarios(id_usuario),
  id_usuario_modificacion UUID REFERENCES usuarios(id_usuario),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_transacciones_turno_consecutivo UNIQUE (id_turno, consecutivo_turno),
  CONSTRAINT uq_transacciones_grupo_orden UNIQUE (id_grupo_transacciones, orden_grupo)
);

CREATE TABLE IF NOT EXISTS transacciones_montos (
  id_transaccion_monto UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_transaccion UUID NOT NULL REFERENCES transacciones(id_transaccion) ON DELETE CASCADE,
  direccion direccion_monto NOT NULL,
  medio medio_monto NOT NULL,
  id_moneda UUID NOT NULL REFERENCES monedas(id_moneda),
  monto NUMERIC(16, 4) NOT NULL CHECK (monto > 0),
  id_cuenta UUID REFERENCES cuentas_bancarias(id_cuenta),
  observaciones TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_transacciones_montos_cuenta CHECK (
    (medio = 'CUENTA_BANCARIA' AND id_cuenta IS NOT NULL)
    OR (medio <> 'CUENTA_BANCARIA')
  )
);

CREATE TABLE IF NOT EXISTS transacciones_comisiones (
  id_transaccion_comision UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_transaccion UUID NOT NULL UNIQUE REFERENCES transacciones(id_transaccion) ON DELETE CASCADE,
  id_comision UUID REFERENCES reglas_comisiones(id_comision),
  id_moneda UUID NOT NULL REFERENCES monedas(id_moneda),
  monto NUMERIC(16, 4) NOT NULL CHECK (monto >= 0),
  detalle_calculo JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculada_automaticamente BOOLEAN NOT NULL DEFAULT true,
  oculta_para_cajero BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS movimientos_efectivo (
  id_movimiento_efectivo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_transaccion UUID REFERENCES transacciones(id_transaccion),
  id_grupo_transacciones UUID REFERENCES grupos_transacciones(id_grupo_transacciones),
  id_turno UUID NOT NULL REFERENCES turnos(id_turno),
  id_caja UUID NOT NULL REFERENCES cajas(id_caja),
  id_moneda UUID NOT NULL REFERENCES monedas(id_moneda),
  direccion direccion_monto NOT NULL,
  monto NUMERIC(16, 4) NOT NULL CHECK (monto > 0),
  es_reverso BOOLEAN NOT NULL DEFAULT false,
  id_movimiento_reversado UUID REFERENCES movimientos_efectivo(id_movimiento_efectivo),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS movimientos_cuentas (
  id_movimiento_cuenta UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_transaccion UUID REFERENCES transacciones(id_transaccion),
  id_cuenta UUID NOT NULL REFERENCES cuentas_bancarias(id_cuenta),
  id_moneda UUID NOT NULL REFERENCES monedas(id_moneda),
  direccion direccion_monto NOT NULL,
  monto NUMERIC(16, 4) NOT NULL CHECK (monto > 0),
  es_reverso BOOLEAN NOT NULL DEFAULT false,
  id_movimiento_reversado UUID REFERENCES movimientos_cuentas(id_movimiento_cuenta),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transferencias internas de efectivo o saldos digitales por turno.
CREATE TABLE IF NOT EXISTS transferencias (
  id_transferencia UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_transferencia BIGINT GENERATED BY DEFAULT AS IDENTITY UNIQUE,
  id_turno UUID NOT NULL REFERENCES turnos(id_turno),
  tipo medio_monto NOT NULL,
  direccion direccion_monto NOT NULL,
  id_moneda UUID NOT NULL REFERENCES monedas(id_moneda),
  id_cuenta UUID REFERENCES cuentas_bancarias(id_cuenta),
  monto NUMERIC(16, 4) NOT NULL CHECK (monto > 0),
  descripcion TEXT,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  motivo_anulacion TEXT,
  id_usuario_creacion UUID NOT NULL REFERENCES usuarios(id_usuario),
  id_usuario_modificacion UUID REFERENCES usuarios(id_usuario),
  id_usuario_anulacion UUID REFERENCES usuarios(id_usuario),
  fecha_transferencia TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_anulacion TIMESTAMPTZ,
  CONSTRAINT ck_transferencias_tipo CHECK (tipo IN ('EFECTIVO', 'CUENTA_BANCARIA')),
  CONSTRAINT ck_transferencias_cuenta CHECK (
    (tipo = 'EFECTIVO' AND id_cuenta IS NULL)
    OR (tipo = 'CUENTA_BANCARIA' AND id_cuenta IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS transferencias_denominaciones (
  id_transferencia UUID NOT NULL REFERENCES transferencias(id_transferencia) ON DELETE CASCADE,
  id_denominacion UUID NOT NULL REFERENCES denominaciones(id_denominacion),
  montones_25 INTEGER NOT NULL DEFAULT 0 CHECK (montones_25 >= 0),
  sueltos INTEGER NOT NULL DEFAULT 0 CHECK (sueltos >= 0),
  PRIMARY KEY (id_transferencia, id_denominacion)
);

-- Directorio de destinatarios frecuentes. Los valores repetibles se almacenan
-- en tablas hijas para mantener tercera forma normal y mostrarse agrupados en UI.
CREATE TABLE IF NOT EXISTS directorio_destinatarios (
  id_destinatario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_destinatario BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  nombre VARCHAR(180) NOT NULL,
  observaciones TEXT,
  estado estado_registro NOT NULL DEFAULT 'ACTIVO',
  id_usuario_creacion UUID REFERENCES usuarios(id_usuario),
  id_usuario_modificacion UUID REFERENCES usuarios(id_usuario),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS directorio_identificadores (
  id_identificador UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_destinatario UUID NOT NULL REFERENCES directorio_destinatarios(id_destinatario) ON DELETE CASCADE,
  institucion VARCHAR(100) NOT NULL DEFAULT '',
  tipo VARCHAR(100) NOT NULL,
  numero VARCHAR(100) NOT NULL,
  id_moneda UUID REFERENCES monedas(id_moneda),
  orden SMALLINT NOT NULL DEFAULT 1 CHECK (orden > 0),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_destinatario, institucion, tipo, numero)
);

CREATE TABLE IF NOT EXISTS directorio_cedulas (
  id_cedula UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_destinatario UUID NOT NULL REFERENCES directorio_destinatarios(id_destinatario) ON DELETE CASCADE,
  numero VARCHAR(20) NOT NULL,
  titular VARCHAR(180),
  orden SMALLINT NOT NULL DEFAULT 1 CHECK (orden > 0),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_destinatario, numero)
);

CREATE TABLE IF NOT EXISTS directorio_referencias (
  id_referencia UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_destinatario UUID NOT NULL REFERENCES directorio_destinatarios(id_destinatario) ON DELETE CASCADE,
  referencia VARCHAR(180) NOT NULL,
  orden SMALLINT NOT NULL DEFAULT 1 CHECK (orden > 0),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_destinatario, referencia)
);

CREATE TABLE IF NOT EXISTS directorio_fuentes_importacion (
  id_fuente UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_destinatario UUID NOT NULL REFERENCES directorio_destinatarios(id_destinatario) ON DELETE CASCADE,
  hoja VARCHAR(120) NOT NULL,
  fila INTEGER NOT NULL CHECK (fila > 0),
  datos_originales JSONB NOT NULL DEFAULT '[]'::jsonb,
  fecha_importacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_destinatario, hoja, fila)
);

ALTER TABLE movimientos_efectivo
  ADD COLUMN IF NOT EXISTS id_transferencia UUID REFERENCES transferencias(id_transferencia);
ALTER TABLE movimientos_cuentas
  ADD COLUMN IF NOT EXISTS id_transferencia UUID REFERENCES transferencias(id_transferencia);

-- =========================================================
-- Pendientes, anulaciones, correcciones y cierres
-- =========================================================

CREATE TABLE IF NOT EXISTS pagos_pendientes (
  id_pendiente UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_transaccion UUID NOT NULL UNIQUE REFERENCES transacciones(id_transaccion),
  tipo tipo_pendiente NOT NULL,
  id_contraparte UUID NOT NULL REFERENCES contrapartes(id_contraparte),
  id_moneda UUID NOT NULL REFERENCES monedas(id_moneda),
  monto_original NUMERIC(16, 4) NOT NULL CHECK (monto_original > 0),
  saldo_pendiente NUMERIC(16, 4) NOT NULL CHECK (saldo_pendiente >= 0),
  fecha_vencimiento DATE,
  estado estado_pendiente NOT NULL DEFAULT 'PENDIENTE',
  observaciones TEXT,
  id_usuario_creacion UUID NOT NULL REFERENCES usuarios(id_usuario),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_pendientes_saldo CHECK (saldo_pendiente <= monto_original)
);

CREATE TABLE IF NOT EXISTS abonos_pendientes (
  id_abono UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_pendiente UUID NOT NULL REFERENCES pagos_pendientes(id_pendiente) ON DELETE CASCADE,
  id_transaccion UUID NOT NULL REFERENCES transacciones(id_transaccion),
  id_turno_aplicacion UUID REFERENCES turnos(id_turno),
  id_moneda UUID NOT NULL REFERENCES monedas(id_moneda),
  monto NUMERIC(16, 4) NOT NULL CHECK (monto > 0),
  id_tipo_cambio UUID REFERENCES tipos_cambio(id_tipo_cambio),
  tasa_compra_usada NUMERIC(14, 6),
  tasa_venta_usada NUMERIC(14, 6),
  fecha_abono TIMESTAMPTZ NOT NULL DEFAULT now(),
  id_usuario_creacion UUID NOT NULL REFERENCES usuarios(id_usuario),
  observaciones TEXT
);

ALTER TABLE arqueos
  ADD COLUMN IF NOT EXISTS id_abono_pendiente UUID
    REFERENCES abonos_pendientes(id_abono) ON DELETE CASCADE;

ALTER TABLE arqueos DROP CONSTRAINT IF EXISTS ck_arqueos_alcance;
ALTER TABLE arqueos
  ADD CONSTRAINT ck_arqueos_alcance CHECK (
    num_nonnulls(id_turno, id_jornada, id_grupo_transacciones, id_abono_pendiente) = 1
  );

ALTER TABLE arqueos DROP CONSTRAINT IF EXISTS ck_arqueos_transaccion;
ALTER TABLE arqueos
  ADD CONSTRAINT ck_arqueos_transaccion CHECK (
    (
      tipo IN ('TRANSACCION_RECIBIDO', 'TRANSACCION_ENTREGADO', 'TRANSACCION_VUELTO')
      AND id_grupo_transacciones IS NOT NULL
      AND id_abono_pendiente IS NULL
      AND monto_esperado IS NOT NULL
      AND tipo_tasa IS NOT NULL
      AND tasa_usada IS NOT NULL
    )
    OR
    (
      tipo IN ('PENDIENTE_RECIBIDO', 'PENDIENTE_ENTREGADO', 'PENDIENTE_VUELTO')
      AND id_abono_pendiente IS NOT NULL
      AND id_grupo_transacciones IS NULL
      AND monto_esperado IS NOT NULL
      AND tipo_tasa IS NOT NULL
      AND tasa_usada IS NOT NULL
    )
    OR
    (
      tipo NOT IN (
        'TRANSACCION_RECIBIDO', 'TRANSACCION_ENTREGADO', 'TRANSACCION_VUELTO',
        'PENDIENTE_RECIBIDO', 'PENDIENTE_ENTREGADO', 'PENDIENTE_VUELTO'
      )
      AND id_grupo_transacciones IS NULL
      AND id_abono_pendiente IS NULL
    )
  );

ALTER TABLE movimientos_efectivo
  ADD COLUMN IF NOT EXISTS id_abono_pendiente UUID
    REFERENCES abonos_pendientes(id_abono) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS notificaciones_usuarios (
  id_notificacion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario_destino UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  tipo VARCHAR(40) NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  mensaje TEXT NOT NULL,
  id_pendiente UUID REFERENCES pagos_pendientes(id_pendiente) ON DELETE CASCADE,
  id_turno UUID REFERENCES turnos(id_turno) ON DELETE CASCADE,
  id_usuario_origen UUID REFERENCES usuarios(id_usuario),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_lectura TIMESTAMPTZ,
  CONSTRAINT ck_notificaciones_tipo CHECK (tipo IN ('PENDIENTE_PAGADO'))
);

CREATE TABLE IF NOT EXISTS historial_pendientes (
  id_historial UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_pendiente UUID NOT NULL REFERENCES pagos_pendientes(id_pendiente) ON DELETE CASCADE,
  estado_anterior estado_pendiente,
  estado_nuevo estado_pendiente NOT NULL,
  id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario),
  fecha_cambio TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo TEXT
);

CREATE TABLE IF NOT EXISTS anulaciones_transacciones (
  id_anulacion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_transaccion UUID NOT NULL UNIQUE REFERENCES transacciones(id_transaccion),
  id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario),
  fecha_anulacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS correcciones_transacciones (
  id_correccion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_transaccion_original UUID NOT NULL REFERENCES transacciones(id_transaccion),
  id_transaccion_correccion UUID NOT NULL UNIQUE REFERENCES transacciones(id_transaccion),
  id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario),
  fecha_correccion TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo TEXT NOT NULL,
  CONSTRAINT ck_correcciones_distintas CHECK (id_transaccion_original <> id_transaccion_correccion)
);

CREATE TABLE IF NOT EXISTS aprobaciones (
  id_aprobacion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario_solicitud UUID NOT NULL REFERENCES usuarios(id_usuario),
  id_usuario_revision UUID REFERENCES usuarios(id_usuario),
  entidad VARCHAR(80) NOT NULL,
  id_entidad_registro UUID NOT NULL,
  estado estado_aprobacion NOT NULL DEFAULT 'PENDIENTE',
  fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_revision TIMESTAMPTZ,
  motivo TEXT,
  observaciones_revision TEXT
);

CREATE TABLE IF NOT EXISTS cierres_diarios (
  id_cierre_diario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_jornada UUID NOT NULL REFERENCES jornadas(id_jornada),
  id_sucursal UUID REFERENCES sucursales(id_sucursal),
  id_usuario_cierre UUID NOT NULL REFERENCES usuarios(id_usuario),
  estado estado_cierre NOT NULL DEFAULT 'PENDIENTE_REVISION',
  total_comisiones_nio NUMERIC(16, 4) NOT NULL DEFAULT 0,
  total_comisiones_usd NUMERIC(16, 4) NOT NULL DEFAULT 0,
  observaciones TEXT,
  fecha_cierre TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cierres_diarios_alcance UNIQUE (id_jornada, id_sucursal)
);

CREATE TABLE IF NOT EXISTS cierres_diarios_detalles (
  id_cierre_detalle UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cierre_diario UUID NOT NULL REFERENCES cierres_diarios(id_cierre_diario) ON DELETE CASCADE,
  id_moneda UUID NOT NULL REFERENCES monedas(id_moneda),
  total_efectivo_calculado NUMERIC(16, 4) NOT NULL DEFAULT 0,
  total_efectivo_contado NUMERIC(16, 4) NOT NULL DEFAULT 0,
  total_cuentas_calculado NUMERIC(16, 4) NOT NULL DEFAULT 0,
  total_pendientes NUMERIC(16, 4) NOT NULL DEFAULT 0,
  total_comisiones NUMERIC(16, 4) NOT NULL DEFAULT 0,
  diferencia NUMERIC(16, 4) NOT NULL DEFAULT 0,
  CONSTRAINT uq_cierre_detalle_moneda UNIQUE (id_cierre_diario, id_moneda)
);

-- =========================================================
-- Bitacora e importacion historica
-- =========================================================

CREATE TABLE IF NOT EXISTS bitacora (
  id_bitacora UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID REFERENCES usuarios(id_usuario),
  id_dispositivo UUID REFERENCES dispositivos(id_dispositivo),
  accion accion_bitacora NOT NULL,
  tabla VARCHAR(80) NOT NULL,
  id_registro UUID,
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  direccion_ip INET,
  agente_usuario TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS importaciones_excel (
  id_importacion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_archivo TEXT NOT NULL,
  ruta_archivo TEXT,
  fecha_detectada DATE,
  sucursal_detectada VARCHAR(120),
  id_sucursal_asignada UUID REFERENCES sucursales(id_sucursal),
  id_caja_asignada UUID REFERENCES cajas(id_caja),
  id_cajero_asignado UUID REFERENCES usuarios(id_usuario),
  estado VARCHAR(40) NOT NULL DEFAULT 'PENDIENTE',
  id_usuario_importacion UUID REFERENCES usuarios(id_usuario),
  fecha_importacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  observaciones TEXT
);

CREATE TABLE IF NOT EXISTS importaciones_excel_filas (
  id_importacion_fila UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_importacion UUID NOT NULL REFERENCES importaciones_excel(id_importacion) ON DELETE CASCADE,
  hoja VARCHAR(80) NOT NULL,
  numero_fila INTEGER NOT NULL,
  datos_crudos JSONB NOT NULL,
  id_transaccion_mapeada UUID REFERENCES transacciones(id_transaccion),
  estado_validacion VARCHAR(40) NOT NULL DEFAULT 'PENDIENTE',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS importaciones_excel_errores (
  id_importacion_error UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_importacion_fila UUID REFERENCES importaciones_excel_filas(id_importacion_fila) ON DELETE CASCADE,
  id_importacion UUID NOT NULL REFERENCES importaciones_excel(id_importacion) ON DELETE CASCADE,
  codigo_error VARCHAR(80) NOT NULL,
  mensaje TEXT NOT NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- Triggers
-- =========================================================

CREATE OR REPLACE FUNCTION preparar_alias_cuenta()
RETURNS TRIGGER AS $$
DECLARE
  v_codigo_entidad VARCHAR(30);
  v_codigo_moneda CHAR(3);
  v_siguiente INTEGER;
BEGIN
  SELECT codigo INTO v_codigo_entidad FROM entidades_bancarias WHERE id_entidad = NEW.id_entidad;
  SELECT codigo INTO v_codigo_moneda FROM monedas WHERE id_moneda = NEW.id_moneda;

  IF NEW.consecutivo IS NULL THEN
    SELECT coalesce(max(consecutivo), 0) + 1
    INTO v_siguiente
    FROM cuentas_bancarias
    WHERE id_entidad = NEW.id_entidad
      AND id_moneda = NEW.id_moneda;
    NEW.consecutivo = v_siguiente;
  END IF;

  NEW.alias = v_codigo_entidad || ' ' || v_codigo_moneda || ' ' || lpad(NEW.consecutivo::text, 2, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cuentas_alias ON cuentas_bancarias;
CREATE TRIGGER trg_cuentas_alias
BEFORE INSERT OR UPDATE OF id_entidad, id_moneda, consecutivo
ON cuentas_bancarias
FOR EACH ROW
EXECUTE FUNCTION preparar_alias_cuenta();

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'roles', 'permisos', 'usuarios', 'sucursales', 'cajas',
    'entidades_bancarias', 'cuentas_bancarias', 'movimientos',
    'cuentas_movimientos', 'reglas_comisiones', 'contrapartes',
    'turnos', 'transacciones', 'pagos_pendientes'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_fecha_modificacion ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_fecha_modificacion BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_modificacion()', t, t);
  END LOOP;
END $$;

-- =========================================================
-- Indices
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(id_rol);
CREATE INDEX IF NOT EXISTS idx_cajas_sucursal ON cajas(id_sucursal);
CREATE INDEX IF NOT EXISTS idx_cuentas_entidad_moneda ON cuentas_bancarias(id_entidad, id_moneda);
CREATE INDEX IF NOT EXISTS idx_cuentas_sucursales_sucursal ON cuentas_sucursales(id_sucursal);
CREATE INDEX IF NOT EXISTS idx_cuentas_movimientos_cuenta ON cuentas_movimientos(id_cuenta);
CREATE INDEX IF NOT EXISTS idx_cuentas_movimientos_movimiento ON cuentas_movimientos(id_movimiento);
CREATE INDEX IF NOT EXISTS idx_comisiones_busqueda ON reglas_comisiones(id_entidad, id_moneda, id_movimiento, estado, fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_turnos_jornada_cajero ON turnos(id_jornada, id_cajero);
CREATE INDEX IF NOT EXISTS idx_turnos_caja_estado ON turnos(id_caja, estado);
CREATE INDEX IF NOT EXISTS idx_transacciones_turno ON transacciones(id_turno);
CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON transacciones(fecha_transaccion);
CREATE INDEX IF NOT EXISTS idx_transacciones_filtros ON transacciones(id_sucursal, id_cajero, estado);
CREATE INDEX IF NOT EXISTS idx_transacciones_montos_transaccion ON transacciones_montos(id_transaccion);
CREATE INDEX IF NOT EXISTS idx_movimientos_efectivo_turno_moneda ON movimientos_efectivo(id_turno, id_moneda);
CREATE INDEX IF NOT EXISTS idx_movimientos_cuentas_cuenta_moneda ON movimientos_cuentas(id_cuenta, id_moneda);
CREATE INDEX IF NOT EXISTS idx_transferencias_turno_fecha ON transferencias(id_turno, fecha_transferencia DESC);
CREATE INDEX IF NOT EXISTS idx_transferencias_cuenta ON transferencias(id_cuenta) WHERE id_cuenta IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_directorio_destinatarios_nombre ON directorio_destinatarios(lower(nombre));
CREATE INDEX IF NOT EXISTS idx_directorio_identificadores_numero ON directorio_identificadores(numero);
CREATE INDEX IF NOT EXISTS idx_directorio_cedulas_numero ON directorio_cedulas(numero);
CREATE INDEX IF NOT EXISTS idx_directorio_referencias_valor ON directorio_referencias(lower(referencia));
CREATE INDEX IF NOT EXISTS idx_movimientos_efectivo_transferencia ON movimientos_efectivo(id_transferencia) WHERE id_transferencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimientos_cuentas_transferencia ON movimientos_cuentas(id_transferencia) WHERE id_transferencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pendientes_estado ON pagos_pendientes(estado, tipo);
CREATE INDEX IF NOT EXISTS idx_bitacora_tabla ON bitacora(tabla, id_registro);
CREATE INDEX IF NOT EXISTS idx_bitacora_usuario_fecha ON bitacora(id_usuario, fecha_creacion);

-- =========================================================
-- Datos iniciales
-- =========================================================

INSERT INTO monedas (codigo, nombre, simbolo)
VALUES
  ('NIO', 'Cordoba Nicaraguense', 'C$'),
  ('USD', 'Dolar Estadounidense', '$')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO denominaciones (id_moneda, valor, etiqueta, orden)
SELECT m.id_moneda, d.valor, d.etiqueta, d.orden
FROM monedas m
JOIN (VALUES
  ('NIO', 1000.00, 'C$ 1000', 10),
  ('NIO', 500.00, 'C$ 500', 20),
  ('NIO', 200.00, 'C$ 200', 30),
  ('NIO', 100.00, 'C$ 100', 40),
  ('NIO', 50.00, 'C$ 50', 50),
  ('NIO', 20.00, 'C$ 20', 60),
  ('NIO', 10.00, 'C$ 10', 70),
  ('NIO', 5.00, 'C$ 5', 80),
  ('NIO', 1.00, 'C$ 1', 90),
  ('USD', 100.00, '$ 100', 10),
  ('USD', 50.00, '$ 50', 20),
  ('USD', 20.00, '$ 20', 30),
  ('USD', 10.00, '$ 10', 40),
  ('USD', 5.00, '$ 5', 50),
  ('USD', 1.00, '$ 1', 60)
) AS d(codigo_moneda, valor, etiqueta, orden)
ON m.codigo = d.codigo_moneda
ON CONFLICT (id_moneda, valor) DO NOTHING;

INSERT INTO roles (codigo, nombre, descripcion)
VALUES
  ('JEFA', 'Jefa', 'Acceso completo al sistema, comisiones y cierres.'),
  ('CAJERO', 'Cajero', 'Operacion diaria de caja sin acceso a comisiones.')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO permisos (codigo, nombre, descripcion)
VALUES
  ('GESTIONAR_USUARIOS', 'Gestionar usuarios', 'Crear, editar e inactivar usuarios.'),
  ('GESTIONAR_ROLES', 'Gestionar roles', 'Crear, editar e inactivar roles.'),
  ('GESTIONAR_PERMISOS', 'Gestionar permisos', 'Asignar permisos por rol y pantalla.'),
  ('GESTIONAR_BANCOS', 'Gestionar bancos', 'Administrar entidades bancarias y servicios.'),
  ('GESTIONAR_CUENTAS', 'Gestionar cuentas', 'Administrar cuentas y saldos operativos.'),
  ('GESTIONAR_MOVIMIENTOS', 'Gestionar movimientos', 'Administrar movimientos por cuenta.'),
  ('ADMINISTRAR_COMISIONES', 'Administrar comisiones', 'Crear y editar reglas de comision.'),
  ('VER_COMISIONES', 'Ver comisiones', 'Consultar comisiones y ganancias.'),
  ('REGISTRAR_TRANSACCIONES', 'Registrar transacciones', 'Crear transacciones durante un turno abierto.'),
  ('ANULAR_TRANSACCIONES', 'Anular transacciones', 'Anular registros con motivo y reverso.'),
  ('CORREGIR_TRANSACCIONES_CERRADAS', 'Corregir transacciones cerradas', 'Crear correcciones despues del cierre.'),
  ('APROBAR_CIERRES_CON_DIFERENCIA', 'Aprobar cierres con diferencia', 'Autorizar cierres de turno con diferencias.'),
  ('VER_REPORTES', 'Ver reportes', 'Consultar reportes operativos.'),
  ('EXPORTAR_REPORTES', 'Exportar reportes', 'Exportar reportes a Excel o PDF.'),
  ('IMPORTAR_HISTORICOS', 'Importar historicos', 'Cargar archivos Excel historicos.')
  ,('VER_TRANSFERS', 'Ver Transferencias', 'Consultar y registrar transferencias operativas por turno.')
  ,('VER_DIRECTORY', 'Ver Directorio', 'Consultar destinatarios frecuentes, cuentas, cedulas y referencias.')
  ,('ADMINISTRAR_DIRECTORY', 'Administrar Directorio', 'Crear, editar e inactivar destinatarios frecuentes.')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
CROSS JOIN permisos p
WHERE r.codigo = 'JEFA'
ON CONFLICT DO NOTHING;

INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
JOIN permisos p ON p.codigo IN (
  'REGISTRAR_TRANSACCIONES',
  'ANULAR_TRANSACCIONES',
  'VER_REPORTES',
  'EXPORTAR_REPORTES'
  ,'VER_TRANSFERS'
  ,'VER_DIRECTORY'
)
WHERE r.codigo = 'CAJERO'
ON CONFLICT DO NOTHING;

INSERT INTO usuarios (id_rol, nombres, apellidos, usuario, correo, contrasena_hash, debe_cambiar_contrasena)
SELECT r.id_rol, 'Jefa', 'Olivera', 'jefa', 'jefa@temo.local', '$2b$10$pendiente', true
FROM roles r
WHERE r.codigo = 'JEFA'
ON CONFLICT (usuario) DO NOTHING;

INSERT INTO metodos_pago (codigo, nombre, tipo)
VALUES
  ('EFECTIVO', 'Efectivo', 'EFECTIVO'),
  ('TRANSFERENCIA', 'Transferencia', 'TRANSFERENCIA'),
  ('CREDITO', 'Credito', 'CREDITO'),
  ('MIXTO', 'Mixto', 'MIXTO')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO sucursales (codigo, nombre)
VALUES
  ('TIENDA_PRINCIPAL', 'Tienda principal'),
  ('SUCURSAL_2', 'Sucursal 2')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cajas (id_sucursal, codigo, nombre)
SELECT s.id_sucursal, c.codigo, c.nombre
FROM sucursales s
JOIN (VALUES
  ('TIENDA_PRINCIPAL', 'CAJA_1', 'Caja 1'),
  ('TIENDA_PRINCIPAL', 'CAJA_2', 'Caja 2 Apoyo'),
  ('SUCURSAL_2', 'CAJA_3', 'Caja 3')
) AS c(codigo_sucursal, codigo, nombre)
ON s.codigo = c.codigo_sucursal
ON CONFLICT (id_sucursal, codigo) DO NOTHING;

INSERT INTO entidades_bancarias (codigo, nombre_corto, nombre_largo, tipo, mostrar_como_banco, maneja_saldo, maneja_comision, estado)
VALUES
  ('BAC', 'BAC', 'Banco de America Central Credomatic S.A.', 'BANCO_REAL', true, true, true, 'ACTIVO'),
  ('BANPRO', 'BANPRO', 'Banco de la Produccion S.A.', 'BANCO_REAL', true, true, true, 'ACTIVO'),
  ('LAFISE', 'LAFISE', 'Banco Lafise Bancentro S.A.', 'BANCO_REAL', true, true, true, 'ACTIVO'),
  ('BDF', 'BDF', 'Banco de Finanzas S.A.', 'BANCO_REAL', true, true, true, 'INACTIVO'),
  ('PEX', 'PEX', 'PEX Servicios Financieros', 'SERVICIO_FINANCIERO', true, true, true, 'ACTIVO'),
  ('TELEDOLAR', 'TELEDOLAR', 'Teledolar Servicios de Remesas', 'SERVICIO_REMESAS', true, true, true, 'ACTIVO')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cuentas_bancarias (id_entidad, id_moneda, tipo_cuenta, consecutivo, alias, numero_cuenta, estado)
SELECT e.id_entidad,
       m.id_moneda,
       CASE WHEN e.tipo = 'BANCO_REAL' THEN 'CUENTA_REAL'::tipo_cuenta_bancaria ELSE 'SALDO_OPERATIVO'::tipo_cuenta_bancaria END,
       1,
       e.codigo || ' ' || m.codigo || ' 01',
       NULL,
       e.estado
FROM entidades_bancarias e
CROSS JOIN monedas m
WHERE e.codigo IN ('BAC', 'BANPRO', 'LAFISE', 'BDF', 'PEX', 'TELEDOLAR')
ON CONFLICT (id_entidad, id_moneda, consecutivo) DO NOTHING;

INSERT INTO cuentas_sucursales (id_cuenta, id_sucursal)
SELECT c.id_cuenta, s.id_sucursal
FROM cuentas_bancarias c
JOIN entidades_bancarias e ON e.id_entidad = c.id_entidad
JOIN monedas m ON m.id_moneda = c.id_moneda
JOIN (VALUES
  ('BAC', 'NIO', 'TIENDA_PRINCIPAL'),
  ('BAC', 'USD', 'TIENDA_PRINCIPAL'),
  ('BANPRO', 'NIO', 'TIENDA_PRINCIPAL'),
  ('BANPRO', 'USD', 'TIENDA_PRINCIPAL'),
  ('LAFISE', 'NIO', 'SUCURSAL_2'),
  ('LAFISE', 'USD', 'SUCURSAL_2'),
  ('TELEDOLAR', 'USD', 'SUCURSAL_2')
) AS v(codigo_entidad, codigo_moneda, codigo_sucursal)
ON e.codigo = v.codigo_entidad AND m.codigo = v.codigo_moneda
JOIN sucursales s ON s.codigo = v.codigo_sucursal
ON CONFLICT DO NOTHING;

INSERT INTO movimientos (codigo, nombre)
VALUES
  ('DEPOSITO_CUENTA', 'Deposito a cuenta'),
  ('RETIRO_EFECTIVO', 'Retiro de efectivo'),
  ('RETIRO_TARJETA', 'Retiro de tarjeta'),
  ('PAGO_REMESA', 'Pago de remesa'),
  ('ENVIO_REMESA', 'Envio de remesa'),
  ('PAGO_SERVICIO_BASICO', 'Pago de servicio basico'),
  ('PAGO_TARJETA', 'Pago de tarjeta'),
  ('PAGO_PRESTAMO', 'Pago de prestamo'),
  ('DEPOSITO_BILLETERA_MOVIL', 'Deposito de billetera movil'),
  ('RETIRO_BILLETERA_MOVIL', 'Retiro de billetera movil'),
  ('OTRO_MOVIMIENTO', 'Otro movimiento')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cuentas_movimientos (id_cuenta, id_movimiento, codigo_operativo, nombre_operativo, prioridad)
SELECT c.id_cuenta, m.id_movimiento, v.codigo_operativo, m.nombre, v.prioridad
FROM cuentas_bancarias c
JOIN entidades_bancarias e ON e.id_entidad = c.id_entidad
JOIN monedas mo ON mo.id_moneda = c.id_moneda
JOIN (VALUES
  ('BAC', 'NIO', 'DEPOSITO_CUENTA', 'DC', 10),
  ('BAC', 'USD', 'DEPOSITO_CUENTA', 'DC', 10),
  ('BAC', 'NIO', 'RETIRO_TARJETA', 'RT', 20),
  ('BAC', 'USD', 'RETIRO_TARJETA', 'RT', 20),
  ('BAC', 'NIO', 'PAGO_SERVICIO_BASICO', 'PSB', 30),
  ('BANPRO', 'NIO', 'DEPOSITO_CUENTA', 'DC', 10),
  ('BANPRO', 'USD', 'DEPOSITO_CUENTA', 'DC', 10),
  ('BANPRO', 'NIO', 'RETIRO_EFECTIVO', 'RE', 20),
  ('BANPRO', 'USD', 'RETIRO_EFECTIVO', 'RE', 20),
  ('BANPRO', 'NIO', 'DEPOSITO_BILLETERA_MOVIL', 'DBM', 30),
  ('LAFISE', 'NIO', 'DEPOSITO_CUENTA', 'DC', 10),
  ('LAFISE', 'USD', 'DEPOSITO_CUENTA', 'DC', 10),
  ('LAFISE', 'NIO', 'RETIRO_EFECTIVO', 'RE', 20),
  ('LAFISE', 'USD', 'RETIRO_EFECTIVO', 'RE', 20),
  ('PEX', 'NIO', 'PAGO_TARJETA', 'PT', 10),
  ('PEX', 'USD', 'PAGO_TARJETA', 'PT', 10),
  ('PEX', 'NIO', 'RETIRO_EFECTIVO', 'RE', 20),
  ('PEX', 'USD', 'RETIRO_EFECTIVO', 'RE', 20),
  ('TELEDOLAR', 'NIO', 'PAGO_REMESA', 'PR', 10),
  ('TELEDOLAR', 'USD', 'PAGO_REMESA', 'PR', 10),
  ('TELEDOLAR', 'NIO', 'ENVIO_REMESA', 'ER', 20),
  ('TELEDOLAR', 'USD', 'ENVIO_REMESA', 'ER', 20)
) AS v(codigo_entidad, codigo_moneda, codigo_movimiento, codigo_operativo, prioridad)
ON e.codigo = v.codigo_entidad AND mo.codigo = v.codigo_moneda
JOIN movimientos m ON m.codigo = v.codigo_movimiento
ON CONFLICT (id_cuenta, id_movimiento) DO NOTHING;

INSERT INTO reglas_comisiones (id_entidad, id_moneda, id_movimiento, id_moneda_comision, tipo_calculo, porcentaje, monto_fijo, rango_inicio, rango_fin)
SELECT e.id_entidad, mo.id_moneda, m.id_movimiento, mc.id_moneda, v.tipo_calculo::tipo_calculo_comision, v.porcentaje, v.monto_fijo, v.rango_inicio, v.rango_fin
FROM (VALUES
  ('BAC', 'NIO', 'DEPOSITO_CUENTA', 'NIO', 'FIJO', NULL::NUMERIC, 5.00::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
  ('BAC', 'NIO', 'RETIRO_TARJETA', NULL, 'PORCENTAJE', 0.050000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
  ('BAC', 'USD', 'RETIRO_TARJETA', NULL, 'PORCENTAJE', 0.050000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
  ('BANPRO', 'NIO', 'RETIRO_EFECTIVO', NULL, 'PORCENTAJE', 0.030000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
  ('BANPRO', 'USD', 'RETIRO_EFECTIVO', NULL, 'PORCENTAJE', 0.030000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
  ('PEX', 'NIO', 'RETIRO_EFECTIVO', 'NIO', 'FIJO', NULL::NUMERIC, 20.00::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
  ('PEX', 'USD', 'RETIRO_EFECTIVO', 'USD', 'FIJO', NULL::NUMERIC, 1.00::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
  ('LAFISE', 'USD', 'RETIRO_EFECTIVO', 'NIO', 'FIJO', NULL::NUMERIC, 20.00::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
  ('LAFISE', 'USD', 'DEPOSITO_CUENTA', NULL, 'RANGO', 0.050000::NUMERIC, NULL::NUMERIC, 1.00::NUMERIC, 100.00::NUMERIC),
  ('LAFISE', 'USD', 'DEPOSITO_CUENTA', NULL, 'RANGO', 0.040000::NUMERIC, NULL::NUMERIC, 100.01::NUMERIC, 500.00::NUMERIC),
  ('LAFISE', 'USD', 'DEPOSITO_CUENTA', NULL, 'RANGO', 0.030000::NUMERIC, NULL::NUMERIC, 500.01::NUMERIC, 1000.00::NUMERIC),
  ('LAFISE', 'USD', 'DEPOSITO_CUENTA', NULL, 'RANGO', 0.010000::NUMERIC, NULL::NUMERIC, 1000.01::NUMERIC, NULL::NUMERIC)
) AS v(codigo_entidad, codigo_moneda, codigo_movimiento, codigo_moneda_comision, tipo_calculo, porcentaje, monto_fijo, rango_inicio, rango_fin)
JOIN entidades_bancarias e ON e.codigo = v.codigo_entidad
JOIN monedas mo ON mo.codigo = v.codigo_moneda
LEFT JOIN monedas mc ON mc.codigo = v.codigo_moneda_comision
JOIN movimientos m ON m.codigo = v.codigo_movimiento
ON CONFLICT DO NOTHING;
