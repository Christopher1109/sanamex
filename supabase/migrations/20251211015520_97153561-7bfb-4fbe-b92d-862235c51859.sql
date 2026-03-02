-- Tabla para guardar insumos adicionales que excedan los límites establecidos
CREATE TABLE IF NOT EXISTS public.folios_insumos_adicionales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folio_id UUID NOT NULL REFERENCES public.folios(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad INTEGER NOT NULL DEFAULT 1,
  motivo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Habilitar RLS
ALTER TABLE public.folios_insumos_adicionales ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuarios pueden ver insumos adicionales" 
ON public.folios_insumos_adicionales 
FOR SELECT 
USING (true);

CREATE POLICY "Usuarios autenticados pueden crear insumos adicionales" 
ON public.folios_insumos_adicionales 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar insumos adicionales" 
ON public.folios_insumos_adicionales 
FOR UPDATE 
USING (true);

-- Índices
CREATE INDEX idx_folios_insumos_adicionales_folio ON public.folios_insumos_adicionales(folio_id);
CREATE INDEX idx_folios_insumos_adicionales_insumo ON public.folios_insumos_adicionales(insumo_id);