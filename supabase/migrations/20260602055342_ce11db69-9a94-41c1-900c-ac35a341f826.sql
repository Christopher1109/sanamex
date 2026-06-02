
-- 1) Proveedores: plazo_pago_dias obligatorio
UPDATE public.proveedores SET plazo_pago_dias = 0 WHERE plazo_pago_dias IS NULL;
ALTER TABLE public.proveedores ALTER COLUMN plazo_pago_dias SET DEFAULT 0;
ALTER TABLE public.proveedores ALTER COLUMN plazo_pago_dias SET NOT NULL;

-- 2) Lotes: vinculo con compra + fechas
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS compra_id uuid;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS fecha_recepcion date;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS fecha_pago_proveedor date;
CREATE INDEX IF NOT EXISTS idx_lotes_compra_id ON public.lotes(compra_id);
CREATE INDEX IF NOT EXISTS idx_lotes_fecha_pago_proveedor ON public.lotes(fecha_pago_proveedor);

-- 3) Compras: gestión de pago
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS fecha_factura date;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS fecha_pago_limite date;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS pagada boolean NOT NULL DEFAULT false;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS fecha_pago_real date;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS notas_pago text;
CREATE INDEX IF NOT EXISTS idx_compras_pagada ON public.compras(pagada);
CREATE INDEX IF NOT EXISTS idx_compras_fecha_pago_limite ON public.compras(fecha_pago_limite);

-- 4) Marcar pagada las compras que ya tienen estado='pagada' o 'cerrada'
UPDATE public.compras SET pagada = true
WHERE pagada = false AND estado IN ('pagada','cerrada');

-- 5) Backfill: vincular lotes existentes a su compra por numero_lote en compra_lineas
UPDATE public.lotes l
SET compra_id = cl.compra_id
FROM public.compra_lineas cl
WHERE l.compra_id IS NULL
  AND cl.lote_asignado IS NOT NULL
  AND cl.lote_asignado = l.numero_lote
  AND cl.producto_id = l.producto_id;

-- 6) Backfill: fecha_recepcion para lotes vinculados = updated_at de la compra
UPDATE public.lotes l
SET fecha_recepcion = c.updated_at::date
FROM public.compras c
WHERE l.compra_id = c.id AND l.fecha_recepcion IS NULL;

-- 7) Backfill: fecha_pago_proveedor en lotes = fecha_recepcion + plazo del proveedor
UPDATE public.lotes l
SET fecha_pago_proveedor = l.fecha_recepcion + (COALESCE(p.plazo_pago_dias,0) * INTERVAL '1 day')
FROM public.proveedores p
WHERE l.proveedor_id = p.id
  AND l.fecha_recepcion IS NOT NULL
  AND l.fecha_pago_proveedor IS NULL;
