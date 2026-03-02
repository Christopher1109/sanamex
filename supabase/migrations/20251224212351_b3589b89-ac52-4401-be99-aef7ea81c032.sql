-- Tabla para configurar qué insumos aplican a cada procedimiento (catálogo global)
CREATE TABLE public.procedimiento_insumos_catalogo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  procedimiento_clave TEXT NOT NULL,
  procedimiento_nombre TEXT NOT NULL,
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id) ON DELETE CASCADE,
  cantidad_minima INTEGER DEFAULT 1,
  cantidad_maxima INTEGER DEFAULT NULL,
  cantidad_sugerida INTEGER DEFAULT 1,
  activo BOOLEAN DEFAULT true,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID,
  UNIQUE(procedimiento_clave, insumo_catalogo_id)
);

-- Habilitar RLS
ALTER TABLE public.procedimiento_insumos_catalogo ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Todos pueden ver el catálogo de procedimiento-insumos"
  ON public.procedimiento_insumos_catalogo
  FOR SELECT
  USING (true);

CREATE POLICY "Gerente operaciones puede crear configuración"
  ON public.procedimiento_insumos_catalogo
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'gerente_operaciones'::app_role));

CREATE POLICY "Gerente operaciones puede actualizar configuración"
  ON public.procedimiento_insumos_catalogo
  FOR UPDATE
  USING (has_role(auth.uid(), 'gerente_operaciones'::app_role));

CREATE POLICY "Gerente operaciones puede eliminar configuración"
  ON public.procedimiento_insumos_catalogo
  FOR DELETE
  USING (has_role(auth.uid(), 'gerente_operaciones'::app_role));

-- Trigger para updated_at
CREATE TRIGGER update_procedimiento_insumos_catalogo_updated_at
  BEFORE UPDATE ON public.procedimiento_insumos_catalogo
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();