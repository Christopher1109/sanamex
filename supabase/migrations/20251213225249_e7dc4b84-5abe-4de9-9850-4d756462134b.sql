-- =====================================================
-- REESTRUCTURACIÓN DE INVENTARIO: Sistema Híbrido
-- inventario_consolidado (rápido) + inventario_lotes (FIFO)
-- =====================================================

-- Step 1: Create consolidated inventory table (fast queries)
CREATE TABLE public.inventario_consolidado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  almacen_id UUID NOT NULL REFERENCES public.almacenes(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_total INTEGER NOT NULL DEFAULT 0,
  cantidad_minima INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(hospital_id, almacen_id, insumo_catalogo_id)
);

-- Step 2: Create lots table for FIFO and expiration tracking
CREATE TABLE public.inventario_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidado_id UUID NOT NULL REFERENCES public.inventario_consolidado(id) ON DELETE CASCADE,
  lote TEXT,
  fecha_caducidad DATE,
  fecha_entrada TIMESTAMPTZ DEFAULT now(),
  cantidad INTEGER NOT NULL DEFAULT 0,
  ubicacion TEXT DEFAULT 'Almacén general',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 3: Create indexes for performance
-- FIFO index: order by entry date ascending
CREATE INDEX idx_inventario_lotes_fifo 
ON public.inventario_lotes(consolidado_id, fecha_entrada ASC);

-- Expiration index: for finding items expiring soon
CREATE INDEX idx_inventario_lotes_caducidad 
ON public.inventario_lotes(fecha_caducidad ASC) 
WHERE cantidad > 0;

-- Fast lookup by hospital
CREATE INDEX idx_inventario_consolidado_hospital 
ON public.inventario_consolidado(hospital_id);

-- Fast lookup by insumo
CREATE INDEX idx_inventario_consolidado_insumo 
ON public.inventario_consolidado(insumo_catalogo_id);

-- Step 4: Migrate data from inventario_hospital to new structure
-- First, create consolidated records (one per hospital+almacen+insumo)
INSERT INTO public.inventario_consolidado (hospital_id, almacen_id, insumo_catalogo_id, cantidad_total, cantidad_minima, created_at)
SELECT 
  hospital_id,
  almacen_id,
  insumo_catalogo_id,
  SUM(COALESCE(cantidad_actual, 0)) as cantidad_total,
  COALESCE(MIN(cantidad_minima), 10) as cantidad_minima,
  MIN(created_at) as created_at
FROM public.inventario_hospital
GROUP BY hospital_id, almacen_id, insumo_catalogo_id;

-- Then, create lot records linked to consolidated (preserving FIFO data)
INSERT INTO public.inventario_lotes (consolidado_id, lote, fecha_caducidad, fecha_entrada, cantidad, ubicacion, created_at)
SELECT 
  ic.id as consolidado_id,
  ih.lote,
  ih.fecha_caducidad,
  COALESCE(ih.created_at, now()) as fecha_entrada,
  COALESCE(ih.cantidad_actual, 0) as cantidad,
  COALESCE(ih.ubicacion, 'Almacén general') as ubicacion,
  ih.created_at
FROM public.inventario_hospital ih
JOIN public.inventario_consolidado ic 
  ON ic.hospital_id = ih.hospital_id 
  AND ic.almacen_id = ih.almacen_id 
  AND ic.insumo_catalogo_id = ih.insumo_catalogo_id
WHERE ih.cantidad_actual > 0;

-- Step 5: Enable RLS on new tables
ALTER TABLE public.inventario_consolidado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_lotes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for inventario_consolidado
CREATE POLICY "Todos pueden ver inventario consolidado" 
ON public.inventario_consolidado FOR SELECT 
USING (true);

CREATE POLICY "Usuarios autenticados pueden crear inventario consolidado" 
ON public.inventario_consolidado FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar inventario consolidado" 
ON public.inventario_consolidado FOR UPDATE 
USING (true);

-- RLS Policies for inventario_lotes
CREATE POLICY "Todos pueden ver lotes de inventario" 
ON public.inventario_lotes FOR SELECT 
USING (true);

CREATE POLICY "Usuarios autenticados pueden crear lotes" 
ON public.inventario_lotes FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar lotes" 
ON public.inventario_lotes FOR UPDATE 
USING (true);

CREATE POLICY "Usuarios autenticados pueden eliminar lotes vacíos" 
ON public.inventario_lotes FOR DELETE 
USING (true);

-- Step 6: Enable realtime for consolidated table
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventario_consolidado;

-- Step 7: Add reference from alerts to new structure
ALTER TABLE public.insumos_alertas 
ADD COLUMN IF NOT EXISTS consolidado_id UUID REFERENCES public.inventario_consolidado(id);

-- Migrate existing alert references
UPDATE public.insumos_alertas a
SET consolidado_id = ic.id
FROM public.inventario_hospital ih
JOIN public.inventario_consolidado ic 
  ON ic.hospital_id = ih.hospital_id 
  AND ic.almacen_id = ih.almacen_id 
  AND ic.insumo_catalogo_id = ih.insumo_catalogo_id
WHERE a.inventario_id = ih.id
AND a.consolidado_id IS NULL;

-- Step 8: Create helper function for FIFO consumption
CREATE OR REPLACE FUNCTION public.consumir_inventario_fifo(
  p_consolidado_id UUID,
  p_cantidad INTEGER
) RETURNS TABLE(lote_id UUID, cantidad_consumida INTEGER) AS $$
DECLARE
  v_restante INTEGER := p_cantidad;
  v_lote RECORD;
BEGIN
  -- Loop through lots ordered by fecha_entrada (FIFO)
  FOR v_lote IN 
    SELECT id, cantidad 
    FROM public.inventario_lotes 
    WHERE consolidado_id = p_consolidado_id AND cantidad > 0
    ORDER BY fecha_entrada ASC
  LOOP
    IF v_restante <= 0 THEN
      EXIT;
    END IF;
    
    IF v_lote.cantidad >= v_restante THEN
      -- This lot has enough
      UPDATE public.inventario_lotes SET cantidad = cantidad - v_restante WHERE id = v_lote.id;
      lote_id := v_lote.id;
      cantidad_consumida := v_restante;
      v_restante := 0;
      RETURN NEXT;
    ELSE
      -- Use entire lot and continue
      UPDATE public.inventario_lotes SET cantidad = 0 WHERE id = v_lote.id;
      lote_id := v_lote.id;
      cantidad_consumida := v_lote.cantidad;
      v_restante := v_restante - v_lote.cantidad;
      RETURN NEXT;
    END IF;
  END LOOP;
  
  -- Update consolidated total
  UPDATE public.inventario_consolidado 
  SET cantidad_total = cantidad_total - (p_cantidad - v_restante),
      updated_at = now()
  WHERE id = p_consolidado_id;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 9: Create function to recalculate alerts using new structure
CREATE OR REPLACE FUNCTION public.recalcular_alerta_consolidado(p_consolidado_id UUID)
RETURNS void AS $$
DECLARE
  v_row public.inventario_consolidado%ROWTYPE;
  v_alerta_existente UUID;
  v_minimo INTEGER;
BEGIN
  SELECT * INTO v_row FROM public.inventario_consolidado WHERE id = p_consolidado_id;
  
  IF NOT FOUND THEN RETURN; END IF;
  
  -- Get global minimum from configuration
  SELECT COALESCE(min_global_inventario, 10) INTO v_minimo
  FROM public.insumo_configuracion
  WHERE insumo_catalogo_id = v_row.insumo_catalogo_id
  LIMIT 1;
  
  IF v_minimo IS NULL THEN v_minimo := 10; END IF;
  
  -- Find existing active alert
  SELECT id INTO v_alerta_existente
  FROM public.insumos_alertas
  WHERE hospital_id = v_row.hospital_id
  AND insumo_catalogo_id = v_row.insumo_catalogo_id
  AND estado = 'activa'
  LIMIT 1;
  
  IF v_row.cantidad_total <= v_minimo THEN
    IF v_alerta_existente IS NULL THEN
      INSERT INTO public.insumos_alertas (
        hospital_id, insumo_catalogo_id, consolidado_id,
        cantidad_actual, minimo_permitido, prioridad, estado
      ) VALUES (
        v_row.hospital_id, v_row.insumo_catalogo_id, p_consolidado_id,
        v_row.cantidad_total, v_minimo,
        CASE 
          WHEN v_row.cantidad_total = 0 THEN 'critica'
          WHEN v_row.cantidad_total < (v_minimo * 0.5) THEN 'alta'
          WHEN v_row.cantidad_total < (v_minimo * 0.75) THEN 'media'
          ELSE 'baja'
        END,
        'activa'
      );
    ELSE
      UPDATE public.insumos_alertas
      SET cantidad_actual = v_row.cantidad_total,
          minimo_permitido = v_minimo,
          consolidado_id = p_consolidado_id,
          prioridad = CASE 
            WHEN v_row.cantidad_total = 0 THEN 'critica'
            WHEN v_row.cantidad_total < (v_minimo * 0.5) THEN 'alta'
            WHEN v_row.cantidad_total < (v_minimo * 0.75) THEN 'media'
            ELSE 'baja'
          END,
          updated_at = now()
      WHERE id = v_alerta_existente;
    END IF;
  ELSE
    IF v_alerta_existente IS NOT NULL THEN
      UPDATE public.insumos_alertas
      SET estado = 'resuelta', resuelto_at = now(), updated_at = now()
      WHERE id = v_alerta_existente;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 10: Create trigger for automatic alert recalculation
CREATE OR REPLACE FUNCTION public.trigger_check_consolidado()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalcular_alerta_consolidado(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER check_inventario_consolidado_trigger
AFTER INSERT OR UPDATE OF cantidad_total ON public.inventario_consolidado
FOR EACH ROW
EXECUTE FUNCTION public.trigger_check_consolidado();