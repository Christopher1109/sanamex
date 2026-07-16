ALTER TABLE public.compras DROP CONSTRAINT IF EXISTS compras_estado_check;
ALTER TABLE public.compras ADD CONSTRAINT compras_estado_check
  CHECK (estado IN ('ordenada','en_transito','pedida','recibida','facturada','pagada','cerrada','cancelada'));