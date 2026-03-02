-- Verificar y agregar el valor gerente_operaciones al enum si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'gerente_operaciones'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'gerente_operaciones';
  END IF;
END $$;