ALTER TABLE public.cfdi_emitidos ADD COLUMN IF NOT EXISTS pedido_id uuid;
CREATE INDEX IF NOT EXISTS idx_cfdi_pedido ON public.cfdi_emitidos(pedido_id);