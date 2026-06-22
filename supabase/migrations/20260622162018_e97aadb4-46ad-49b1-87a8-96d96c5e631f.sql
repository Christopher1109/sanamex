
-- ============ 1. cfdi_emitidos: columnas nuevas y marcado de demos ============
ALTER TABLE public.cfdi_emitidos
  ADD COLUMN IF NOT EXISTS es_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS facturapi_id text,
  ADD COLUMN IF NOT EXISTS tipo_comprobante text NOT NULL DEFAULT 'I',
  ADD COLUMN IF NOT EXISTS relacionado_uuid text,
  ADD COLUMN IF NOT EXISTS tipo_relacion text,
  ADD COLUMN IF NOT EXISTS xml_storage_path text,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text;

-- Backfill facturapi_id desde pac_response cuando exista
UPDATE public.cfdi_emitidos
   SET facturapi_id = (pac_response->>'id')
 WHERE facturapi_id IS NULL AND pac_response IS NOT NULL;

-- Marcar demo a los seed (sin pac_response y sin facturapi_id)
UPDATE public.cfdi_emitidos
   SET es_demo = true
 WHERE pac_response IS NULL AND facturapi_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cfdi_es_demo ON public.cfdi_emitidos(es_demo);
CREATE INDEX IF NOT EXISTS idx_cfdi_facturapi_id ON public.cfdi_emitidos(facturapi_id);

-- ============ 2. pagos_recibidos (REP) ============
CREATE TABLE IF NOT EXISTS public.pagos_recibidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid NOT NULL REFERENCES public.cfdi_emitidos(id) ON DELETE CASCADE,
  fecha_pago timestamptz NOT NULL DEFAULT now(),
  monto numeric NOT NULL CHECK (monto > 0),
  forma_pago text NOT NULL,
  moneda text NOT NULL DEFAULT 'MXN',
  num_parcialidad integer NOT NULL DEFAULT 1,
  rep_cfdi_id uuid REFERENCES public.cfdi_emitidos(id) ON DELETE SET NULL,
  rep_facturapi_id text,
  rep_uuid_sat text,
  estado text NOT NULL DEFAULT 'registrado',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_recibidos TO authenticated;
GRANT ALL ON public.pagos_recibidos TO service_role;

ALTER TABLE public.pagos_recibidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados ven pagos recibidos" ON public.pagos_recibidos;
CREATE POLICY "Autenticados ven pagos recibidos" ON public.pagos_recibidos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Operativos crean pagos recibidos" ON public.pagos_recibidos;
CREATE POLICY "Operativos crean pagos recibidos" ON public.pagos_recibidos
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admin gestiona pagos recibidos" ON public.pagos_recibidos;
CREATE POLICY "Admin gestiona pagos recibidos" ON public.pagos_recibidos
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'super_admin'::app_role)
      OR has_role(auth.uid(),'gerente'::app_role));

DROP TRIGGER IF EXISTS trg_pagos_recibidos_updated ON public.pagos_recibidos;
CREATE TRIGGER trg_pagos_recibidos_updated BEFORE UPDATE ON public.pagos_recibidos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 3. Rol contador ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='app_role'::regtype AND enumlabel='contador') THEN
    ALTER TYPE app_role ADD VALUE 'contador';
  END IF;
END$$;

-- Permisos del contador (rol es TEXT en role_permissions, no usa enum)
INSERT INTO public.role_permissions(rol, modulo, submodulo, permitido) VALUES
  ('contador','consultas','_all',true),
  ('contador','operaciones','factura_cfdi',true),
  ('contador','reportes','_all',true),
  ('contador','configuracion','_all',false)
ON CONFLICT (rol, modulo, submodulo) DO UPDATE SET permitido = EXCLUDED.permitido;

-- ============ 4. Storage policies para bucket privado 'cfdi' ============
DROP POLICY IF EXISTS "cfdi service role all" ON storage.objects;
CREATE POLICY "cfdi service role all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'cfdi') WITH CHECK (bucket_id = 'cfdi');

DROP POLICY IF EXISTS "cfdi authenticated read" ON storage.objects;
CREATE POLICY "cfdi authenticated read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cfdi');
