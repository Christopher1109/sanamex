
-- Asegurar que los triggers estén habilitados permanentemente
ALTER TABLE public.inventario_hospital ENABLE ALWAYS TRIGGER check_inventario_minimo_trigger;
ALTER TABLE public.inventario_hospital ENABLE ALWAYS TRIGGER check_inventario_trigger;

-- Actualizar alertas "en_proceso" que ya fueron resueltas (cuando el inventario subió)
UPDATE public.insumos_alertas ia
SET estado = 'resuelta',
    resuelto_at = NOW(),
    updated_at = NOW()
WHERE ia.estado = 'en_proceso'
  AND EXISTS (
    SELECT 1 FROM public.inventario_hospital ih
    WHERE ih.hospital_id = ia.hospital_id
      AND ih.insumo_catalogo_id = ia.insumo_catalogo_id
      AND ih.cantidad_actual > ih.cantidad_minima
  );
