
-- =====================================================
-- FASE 1: Sistema de Alertas Automáticas Mejorado
-- =====================================================

-- 1. Crear tabla para documentos de necesidades segmentadas (por hospital)
CREATE TABLE IF NOT EXISTS public.documentos_necesidades_segmentado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha_generacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    generado_por UUID REFERENCES auth.users(id),
    estado TEXT NOT NULL DEFAULT 'generado',
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Crear tabla para detalles del documento segmentado
CREATE TABLE IF NOT EXISTS public.documento_segmentado_detalle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_id UUID NOT NULL REFERENCES public.documentos_necesidades_segmentado(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
    insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
    existencia_actual INTEGER NOT NULL DEFAULT 0,
    minimo INTEGER NOT NULL DEFAULT 0,
    faltante_requerido INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Crear tabla para documentos de necesidades agrupadas (total)
CREATE TABLE IF NOT EXISTS public.documentos_necesidades_agrupado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha_generacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    generado_por UUID REFERENCES auth.users(id),
    estado TEXT NOT NULL DEFAULT 'generado',
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Crear tabla para detalles del documento agrupado
CREATE TABLE IF NOT EXISTS public.documento_agrupado_detalle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_id UUID NOT NULL REFERENCES public.documentos_necesidades_agrupado(id) ON DELETE CASCADE,
    insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
    total_faltante_requerido INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Crear tabla para almacén central México
CREATE TABLE IF NOT EXISTS public.almacen_central (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
    cantidad_disponible INTEGER NOT NULL DEFAULT 0,
    ubicacion TEXT DEFAULT 'Almacén Central México',
    lote TEXT,
    fecha_caducidad DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(insumo_catalogo_id, lote)
);

-- 6. Crear tabla para transferencias del almacén central a hospitales
CREATE TABLE IF NOT EXISTS public.transferencias_central_hospital (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_destino_id UUID NOT NULL REFERENCES public.hospitales(id),
    insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
    cantidad_enviada INTEGER NOT NULL DEFAULT 0,
    fecha TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    estado TEXT NOT NULL DEFAULT 'pendiente',
    enviado_por UUID REFERENCES auth.users(id),
    recibido_por UUID REFERENCES auth.users(id),
    recibido_at TIMESTAMP WITH TIME ZONE,
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Mejorar la función de recálculo de alertas
CREATE OR REPLACE FUNCTION public.recalcular_alerta_insumo(p_hospital_id UUID, p_insumo_catalogo_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existencia_actual INTEGER;
    v_minimo INTEGER;
    v_inventario_id UUID;
    v_alerta_existente UUID;
    v_faltante INTEGER;
BEGIN
    -- Obtener existencia actual y mínimo del inventario
    SELECT 
        ih.id,
        COALESCE(SUM(ih.cantidad_actual), 0),
        COALESCE(MAX(ih.cantidad_minima), 10)
    INTO v_inventario_id, v_existencia_actual, v_minimo
    FROM public.inventario_hospital ih
    WHERE ih.hospital_id = p_hospital_id 
    AND ih.insumo_catalogo_id = p_insumo_catalogo_id
    GROUP BY ih.id
    LIMIT 1;

    -- Si no hay inventario, salir
    IF v_inventario_id IS NULL THEN
        RETURN;
    END IF;

    -- Calcular faltante
    v_faltante := v_minimo - v_existencia_actual;

    -- Buscar alerta activa existente
    SELECT id INTO v_alerta_existente
    FROM public.insumos_alertas
    WHERE hospital_id = p_hospital_id
    AND insumo_catalogo_id = p_insumo_catalogo_id
    AND estado = 'activa'
    LIMIT 1;

    IF v_existencia_actual <= v_minimo THEN
        -- Crear o actualizar alerta
        IF v_alerta_existente IS NULL THEN
            INSERT INTO public.insumos_alertas (
                hospital_id,
                insumo_catalogo_id,
                inventario_id,
                cantidad_actual,
                minimo_permitido,
                prioridad,
                estado
            ) VALUES (
                p_hospital_id,
                p_insumo_catalogo_id,
                v_inventario_id,
                v_existencia_actual,
                v_minimo,
                CASE 
                    WHEN v_existencia_actual = 0 THEN 'critica'
                    WHEN v_existencia_actual < (v_minimo * 0.5) THEN 'alta'
                    WHEN v_existencia_actual < (v_minimo * 0.75) THEN 'media'
                    ELSE 'baja'
                END,
                'activa'
            );
        ELSE
            UPDATE public.insumos_alertas
            SET cantidad_actual = v_existencia_actual,
                minimo_permitido = v_minimo,
                prioridad = CASE 
                    WHEN v_existencia_actual = 0 THEN 'critica'
                    WHEN v_existencia_actual < (v_minimo * 0.5) THEN 'alta'
                    WHEN v_existencia_actual < (v_minimo * 0.75) THEN 'media'
                    ELSE 'baja'
                END,
                updated_at = now()
            WHERE id = v_alerta_existente;
        END IF;
    ELSE
        -- Resolver alerta si existe
        IF v_alerta_existente IS NOT NULL THEN
            UPDATE public.insumos_alertas
            SET estado = 'resuelta',
                resuelto_at = now(),
                updated_at = now()
            WHERE id = v_alerta_existente;
        END IF;
    END IF;
END;
$$;

-- 8. Trigger mejorado para inventario_hospital
CREATE OR REPLACE FUNCTION public.trigger_check_inventario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Recalcular alerta para este insumo/hospital
    PERFORM public.recalcular_alerta_insumo(NEW.hospital_id, NEW.insumo_catalogo_id);
    RETURN NEW;
END;
$$;

-- Eliminar trigger existente si hay
DROP TRIGGER IF EXISTS check_inventario_trigger ON public.inventario_hospital;

-- Crear nuevo trigger
CREATE TRIGGER check_inventario_trigger
AFTER INSERT OR UPDATE OF cantidad_actual, cantidad_minima ON public.inventario_hospital
FOR EACH ROW
EXECUTE FUNCTION public.trigger_check_inventario();

-- 9. Enable RLS en nuevas tablas
ALTER TABLE public.documentos_necesidades_segmentado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_segmentado_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_necesidades_agrupado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_agrupado_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almacen_central ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencias_central_hospital ENABLE ROW LEVEL SECURITY;

-- 10. Políticas RLS para documentos segmentados
CREATE POLICY "Gerentes pueden ver documentos segmentados"
ON public.documentos_necesidades_segmentado FOR SELECT
USING (
    has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
    has_role(auth.uid(), 'cadena_suministros'::app_role)
);

CREATE POLICY "Gerente operaciones puede crear documentos segmentados"
ON public.documentos_necesidades_segmentado FOR INSERT
WITH CHECK (has_role(auth.uid(), 'gerente_operaciones'::app_role));

CREATE POLICY "Gerentes pueden ver detalles segmentados"
ON public.documento_segmentado_detalle FOR SELECT
USING (
    has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
    has_role(auth.uid(), 'cadena_suministros'::app_role)
);

CREATE POLICY "Gerente operaciones puede crear detalles segmentados"
ON public.documento_segmentado_detalle FOR INSERT
WITH CHECK (has_role(auth.uid(), 'gerente_operaciones'::app_role));

-- 11. Políticas RLS para documentos agrupados
CREATE POLICY "Gerentes pueden ver documentos agrupados"
ON public.documentos_necesidades_agrupado FOR SELECT
USING (
    has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
    has_role(auth.uid(), 'gerente_almacen'::app_role)
);

CREATE POLICY "Gerente operaciones puede crear documentos agrupados"
ON public.documentos_necesidades_agrupado FOR INSERT
WITH CHECK (has_role(auth.uid(), 'gerente_operaciones'::app_role));

CREATE POLICY "Gerentes pueden ver detalles agrupados"
ON public.documento_agrupado_detalle FOR SELECT
USING (
    has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
    has_role(auth.uid(), 'gerente_almacen'::app_role)
);

CREATE POLICY "Gerente operaciones puede crear detalles agrupados"
ON public.documento_agrupado_detalle FOR INSERT
WITH CHECK (has_role(auth.uid(), 'gerente_operaciones'::app_role));

-- 12. Políticas RLS para almacén central
CREATE POLICY "Gerentes globales pueden ver almacén central"
ON public.almacen_central FOR SELECT
USING (
    has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
    has_role(auth.uid(), 'gerente_almacen'::app_role) OR
    has_role(auth.uid(), 'cadena_suministros'::app_role)
);

CREATE POLICY "Gerente almacén puede modificar almacén central"
ON public.almacen_central FOR INSERT
WITH CHECK (has_role(auth.uid(), 'gerente_almacen'::app_role));

CREATE POLICY "Gerente almacén puede actualizar almacén central"
ON public.almacen_central FOR UPDATE
USING (has_role(auth.uid(), 'gerente_almacen'::app_role));

-- 13. Políticas RLS para transferencias
CREATE POLICY "Gerentes globales pueden ver transferencias"
ON public.transferencias_central_hospital FOR SELECT
USING (
    has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
    has_role(auth.uid(), 'gerente_almacen'::app_role) OR
    has_role(auth.uid(), 'cadena_suministros'::app_role)
);

CREATE POLICY "Cadena suministros puede crear transferencias"
ON public.transferencias_central_hospital FOR INSERT
WITH CHECK (has_role(auth.uid(), 'cadena_suministros'::app_role));

CREATE POLICY "Cadena suministros puede actualizar transferencias"
ON public.transferencias_central_hospital FOR UPDATE
USING (has_role(auth.uid(), 'cadena_suministros'::app_role));

-- 14. Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_insumos_alertas_estado ON public.insumos_alertas(estado);
CREATE INDEX IF NOT EXISTS idx_insumos_alertas_hospital ON public.insumos_alertas(hospital_id);
CREATE INDEX IF NOT EXISTS idx_insumos_alertas_prioridad ON public.insumos_alertas(prioridad);
CREATE INDEX IF NOT EXISTS idx_almacen_central_insumo ON public.almacen_central(insumo_catalogo_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_estado ON public.transferencias_central_hospital(estado);
CREATE INDEX IF NOT EXISTS idx_transferencias_hospital ON public.transferencias_central_hospital(hospital_destino_id);
