ALTER TABLE public.cuentas_bancarias
  ADD COLUMN IF NOT EXISTS cuenta_contable_id UUID REFERENCES public.catalogo_cuentas(id);

CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_cuenta_contable_id
  ON public.cuentas_bancarias(cuenta_contable_id);