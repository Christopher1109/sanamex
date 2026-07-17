
-- 1) Rutas de PDF/XML en recibos_nomina
ALTER TABLE public.recibos_nomina
  ADD COLUMN IF NOT EXISTS xml_storage_path text,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text;

-- 2) Marcar conceptos base (los 13 SAT que usa el cálculo)
ALTER TABLE public.conceptos_nomina
  ADD COLUMN IF NOT EXISTS es_base boolean NOT NULL DEFAULT false;

UPDATE public.conceptos_nomina
   SET es_base = true
 WHERE clave IN ('001','002','012','019D2','001D','010','019','019D','019F','019H','019T','021','038','RT');

-- Bloquear edición/borrado de conceptos base vía RLS (mantener lectura)
DROP POLICY IF EXISTS "conceptos_nomina no update base" ON public.conceptos_nomina;
CREATE POLICY "conceptos_nomina no update base"
  ON public.conceptos_nomina
  FOR UPDATE
  TO authenticated
  USING (NOT es_base)
  WITH CHECK (NOT es_base);

DROP POLICY IF EXISTS "conceptos_nomina no delete base" ON public.conceptos_nomina;
CREATE POLICY "conceptos_nomina no delete base"
  ON public.conceptos_nomina
  FOR DELETE
  TO authenticated
  USING (NOT es_base);

-- 3) Lectura del bucket cfdi para usuarios con acceso al módulo nómina
DROP POLICY IF EXISTS "cfdi nomina read" ON storage.objects;
CREATE POLICY "cfdi nomina read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'cfdi'
    AND public.has_module_access(auth.uid(), 'nomina', 'consultar')
  );
