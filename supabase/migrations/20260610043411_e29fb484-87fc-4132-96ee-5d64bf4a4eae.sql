
-- 1) CHECK constraint con nuevo estado
ALTER TABLE public.ordenes_compra DROP CONSTRAINT IF EXISTS ordenes_compra_estado_check;
ALTER TABLE public.ordenes_compra
  ADD CONSTRAINT ordenes_compra_estado_check
  CHECK (estado IN ('borrador','pendiente_aprobacion','enviada','confirmada','parcial','recibida','cancelada'));

-- 2) Auditoría de aprobación
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS aprobada_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS fecha_aprobacion timestamptz,
  ADD COLUMN IF NOT EXISTS razon_aprobacion text;

-- 6) Tabla de configuración
CREATE TABLE IF NOT EXISTS public.cotizador_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monto_aprobacion_oc numeric NOT NULL DEFAULT 50000,
  activo boolean DEFAULT true,
  modificado_por uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT NOW()
);

GRANT SELECT ON public.cotizador_config TO authenticated;
GRANT ALL ON public.cotizador_config TO service_role;

ALTER TABLE public.cotizador_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cotizador_config_select_auth"
  ON public.cotizador_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "cotizador_config_admin_modify"
  ON public.cotizador_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Grant update on cotizador_config for admin via RLS
GRANT INSERT, UPDATE, DELETE ON public.cotizador_config TO authenticated;

INSERT INTO public.cotizador_config (monto_aprobacion_oc)
SELECT 50000
WHERE NOT EXISTS (SELECT 1 FROM public.cotizador_config);
