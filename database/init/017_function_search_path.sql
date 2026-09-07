BEGIN;

-- Las funciones PL/pgSQL creadas dentro de TEMO usan tablas del mismo esquema.
-- Se fija su contexto para que funcionen igual con PostgreSQL local y Supabase.
DO $$
DECLARE
  funcion RECORD;
BEGIN
  FOR funcion IN
    SELECT p.oid::regprocedure AS firma
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'temo'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = temo, extensions, public',
      funcion.firma
    );
  END LOOP;
END;
$$;

COMMIT;
