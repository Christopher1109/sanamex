
-- =====================================================
-- FLUJO DE APROBACIONES Y ALERTAS DE TRANSFERENCIA
-- =====================================================

-- 1. Agregar campos de estado de envío a documentos
ALTER TABLE public.documentos_necesidades_agrupado 
ADD COLUMN IF NOT EXISTS enviado_a_gerente_almacen BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS enviado_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS procesado_por_almacen BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS procesado_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.documentos_necesidades_segmentado 
ADD COLUMN IF NOT EXISTS enviado_a_cadena_suministros BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS enviado_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS procesado_por_cadena BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS procesado_at TIMESTAMP WITH TIME ZONE;

-- 2. Agregar estado de procesamiento a pedidos_compra
ALTER TABLE public.pedidos_compra
ADD COLUMN IF NOT EXISTS documento_origen_id UUID REFERENCES public.documentos_necesidades_agrupado(id),
ADD COLUMN IF NOT EXISTS enviado_a_cadena BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS enviado_a_cadena_at TIMESTAMP WITH TIME ZONE;

-- 3. Crear tabla de alertas de transferencia para almacenistas
CREATE TABLE IF NOT EXISTS public.alertas_transferencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transferencia_id UUID NOT NULL REFERENCES public.transferencias_central_hospital(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
    insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
    cantidad_enviada INTEGER NOT NULL DEFAULT 0,
    cantidad_aceptada INTEGER,
    cantidad_merma INTEGER DEFAULT 0,
    motivo_merma TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente, aceptada, aceptada_parcial, rechazada
    notificado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    aceptada_at TIMESTAMP WITH TIME ZONE,
    aceptada_por UUID,
    notas TEXT
);

-- 4. Enable RLS
ALTER TABLE public.alertas_transferencia ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies para alertas de transferencia
CREATE POLICY "Almacenistas pueden ver alertas de su hospital"
ON public.alertas_transferencia FOR SELECT
USING (
    has_role(auth.uid(), 'almacenista'::app_role) OR
    has_role(auth.uid(), 'lider'::app_role) OR
    has_role(auth.uid(), 'supervisor'::app_role) OR
    has_role(auth.uid(), 'gerente'::app_role) OR
    has_role(auth.uid(), 'gerente_operaciones'::app_role) OR
    has_role(auth.uid(), 'cadena_suministros'::app_role)
);

CREATE POLICY "Almacenistas pueden actualizar alertas de su hospital"
ON public.alertas_transferencia FOR UPDATE
USING (
    has_role(auth.uid(), 'almacenista'::app_role) OR
    has_role(auth.uid(), 'lider'::app_role)
);

CREATE POLICY "Cadena suministros puede crear alertas"
ON public.alertas_transferencia FOR INSERT
WITH CHECK (has_role(auth.uid(), 'cadena_suministros'::app_role));

-- 6. Agregar campos a transferencias para rastreo
ALTER TABLE public.transferencias_central_hospital
ADD COLUMN IF NOT EXISTS alerta_creada BOOLEAN DEFAULT FALSE;

-- 7. Policies para actualizar documentos
CREATE POLICY "Gerente operaciones puede actualizar documentos segmentados"
ON public.documentos_necesidades_segmentado FOR UPDATE
USING (has_role(auth.uid(), 'gerente_operaciones'::app_role));

CREATE POLICY "Gerente operaciones puede actualizar documentos agrupados"
ON public.documentos_necesidades_agrupado FOR UPDATE
USING (has_role(auth.uid(), 'gerente_operaciones'::app_role));

CREATE POLICY "Cadena suministros puede actualizar documentos segmentados"
ON public.documentos_necesidades_segmentado FOR UPDATE
USING (has_role(auth.uid(), 'cadena_suministros'::app_role));

CREATE POLICY "Gerente almacen puede actualizar documentos agrupados"
ON public.documentos_necesidades_agrupado FOR UPDATE
USING (has_role(auth.uid(), 'gerente_almacen'::app_role));

-- 8. Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_alertas_transferencia_hospital ON public.alertas_transferencia(hospital_id);
CREATE INDEX IF NOT EXISTS idx_alertas_transferencia_estado ON public.alertas_transferencia(estado);
CREATE INDEX IF NOT EXISTS idx_doc_agrupado_enviado ON public.documentos_necesidades_agrupado(enviado_a_gerente_almacen);
CREATE INDEX IF NOT EXISTS idx_doc_segmentado_enviado ON public.documentos_necesidades_segmentado(enviado_a_cadena_suministros);
