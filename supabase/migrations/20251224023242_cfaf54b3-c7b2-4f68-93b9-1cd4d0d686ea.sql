-- Tabla de presupuestos mensuales por hospital
CREATE TABLE public.presupuestos_hospital (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id) ON DELETE CASCADE,
  mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  anio INTEGER NOT NULL CHECK (anio >= 2020 AND anio <= 2100),
  presupuesto_asignado DECIMAL(12,2) NOT NULL DEFAULT 0,
  presupuesto_ejecutado DECIMAL(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(hospital_id, mes, anio)
);

-- Tabla de precios de insumos para cálculo de costos
CREATE TABLE public.precios_insumos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id) ON DELETE CASCADE,
  precio_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
  moneda TEXT DEFAULT 'MXN',
  vigente_desde DATE NOT NULL DEFAULT CURRENT_DATE,
  vigente_hasta DATE,
  activo BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para optimización
CREATE INDEX idx_presupuestos_hospital_periodo ON public.presupuestos_hospital(hospital_id, anio, mes);
CREATE INDEX idx_precios_insumos_catalogo ON public.precios_insumos(insumo_catalogo_id, activo);

-- Habilitar RLS
ALTER TABLE public.presupuestos_hospital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.precios_insumos ENABLE ROW LEVEL SECURITY;

-- Políticas para presupuestos_hospital
CREATE POLICY "Finanzas y gerentes pueden ver presupuestos"
ON public.presupuestos_hospital FOR SELECT
USING (
  has_role(auth.uid(), 'finanzas'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR
  has_role(auth.uid(), 'gerente'::app_role)
);

CREATE POLICY "Finanzas puede crear presupuestos"
ON public.presupuestos_hospital FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'finanzas'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role)
);

CREATE POLICY "Finanzas puede actualizar presupuestos"
ON public.presupuestos_hospital FOR UPDATE
USING (
  has_role(auth.uid(), 'finanzas'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role)
);

CREATE POLICY "Finanzas puede eliminar presupuestos"
ON public.presupuestos_hospital FOR DELETE
USING (
  has_role(auth.uid(), 'finanzas'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role)
);

-- Políticas para precios_insumos
CREATE POLICY "Finanzas y gerentes pueden ver precios"
ON public.precios_insumos FOR SELECT
USING (
  has_role(auth.uid(), 'finanzas'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR
  has_role(auth.uid(), 'gerente'::app_role) OR
  has_role(auth.uid(), 'gerente_almacen'::app_role)
);

CREATE POLICY "Finanzas puede gestionar precios"
ON public.precios_insumos FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'finanzas'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role)
);

CREATE POLICY "Finanzas puede actualizar precios"
ON public.precios_insumos FOR UPDATE
USING (
  has_role(auth.uid(), 'finanzas'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role)
);

CREATE POLICY "Finanzas puede eliminar precios"
ON public.precios_insumos FOR DELETE
USING (
  has_role(auth.uid(), 'finanzas'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role)
);

-- Trigger para updated_at
CREATE TRIGGER update_presupuestos_hospital_updated_at
  BEFORE UPDATE ON public.presupuestos_hospital
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_precios_insumos_updated_at
  BEFORE UPDATE ON public.precios_insumos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();