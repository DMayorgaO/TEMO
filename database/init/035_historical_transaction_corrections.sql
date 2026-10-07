SET search_path TO temo, public;

-- Display-only revisions preserve the original ledger and every closed-shift total.
CREATE TABLE IF NOT EXISTS correcciones_transacciones_cerradas (
  id_transaccion UUID PRIMARY KEY REFERENCES transacciones(id_transaccion),
  datos JSONB,
  proyeccion JSONB NOT NULL DEFAULT '{}'::jsonb,
  anulada BOOLEAN NOT NULL DEFAULT false,
  id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now()
);
