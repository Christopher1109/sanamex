-- Agregar precio unitario a los lotes de inventario
ALTER TABLE public.inventario_lotes
ADD COLUMN IF NOT EXISTS precio_unitario DECIMAL(12,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS orden_compra_id UUID DEFAULT NULL;

-- Crear tabla para órdenes de compra recibidas con precios
-- (complementa pedidos_compra con el precio real de cada item recibido)
ALTER TABLE public.pedido_items
ADD COLUMN IF NOT EXISTS precio_recibido DECIMAL(12,2) DEFAULT NULL;

-- Crear tabla para registrar el costo real de cada insumo consumido en un folio
CREATE TABLE IF NOT EXISTS public.folios_insumos_costos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id UUID NOT NULL REFERENCES public.folios(id) ON DELETE CASCADE,
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  lote_id UUID REFERENCES public.inventario_lotes(id),
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario DECIMAL(12,2) NOT NULL,
  costo_total DECIMAL(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_folios_insumos_costos_folio ON public.folios_insumos_costos(folio_id);
CREATE INDEX IF NOT EXISTS idx_folios_insumos_costos_fecha ON public.folios_insumos_costos(created_at);
CREATE INDEX IF NOT EXISTS idx_inventario_lotes_precio ON public.inventario_lotes(precio_unitario) WHERE precio_unitario IS NOT NULL;

-- RLS para folios_insumos_costos
ALTER TABLE public.folios_insumos_costos ENABLE ROW LEVEL SECURITY;

-- Finanzas y gerentes pueden ver los costos
CREATE POLICY "Usuarios pueden ver costos de folios"
ON public.folios_insumos_costos FOR SELECT
USING (
  has_role(auth.uid(), 'finanzas'::app_role) OR
  has_role(auth.uid(), 'gerente'::app_role) OR
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR
  has_role(auth.uid(), 'gerente_almacen'::app_role)
);

-- Sistema puede insertar costos (al consumir inventario)
CREATE POLICY "Usuarios autenticados pueden registrar costos"
ON public.folios_insumos_costos FOR INSERT
WITH CHECK (true);

COMMENT ON TABLE public.folios_insumos_costos IS 'Registra el costo real de cada insumo consumido en un folio, basado en el precio del lote FIFO';
COMMENT ON COLUMN public.inventario_lotes.precio_unitario IS 'Precio unitario del insumo en este lote específico, capturado al momento de recepción';