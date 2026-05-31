
ALTER TABLE public.configuracion_fiscal ALTER COLUMN sucursal_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS configuracion_fiscal_global_unique
  ON public.configuracion_fiscal ((sucursal_id IS NULL)) WHERE sucursal_id IS NULL;
