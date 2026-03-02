-- Habilitar los triggers que están deshabilitados (O = disabled, D = disabled for replica)
ALTER TABLE public.inventario_hospital ENABLE TRIGGER check_inventario_minimo_trigger;
ALTER TABLE public.inventario_hospital ENABLE TRIGGER check_inventario_trigger;

-- Verificar que el trigger funcione correctamente recalculando alertas
-- Primero eliminar alertas duplicadas o antiguas resueltas
DELETE FROM public.insumos_alertas 
WHERE estado = 'resuelta' 
  AND resuelto_at < NOW() - INTERVAL '7 days';

-- Recalcular todas las alertas activas basadas en el inventario actual
INSERT INTO public.insumos_alertas (hospital_id, insumo_catalogo_id, inventario_id, cantidad_actual, minimo_permitido, prioridad, estado)
SELECT 
  ih.hospital_id,
  ih.insumo_catalogo_id,
  ih.id,
  ih.cantidad_actual,
  ih.cantidad_minima,
  CASE 
    WHEN ih.cantidad_actual = 0 THEN 'critica'
    WHEN ih.cantidad_actual < (ih.cantidad_minima * 0.5) THEN 'alta'
    WHEN ih.cantidad_actual < (ih.cantidad_minima * 0.75) THEN 'media'
    ELSE 'baja'
  END,
  'activa'
FROM public.inventario_hospital ih
WHERE ih.cantidad_actual <= ih.cantidad_minima
  AND ih.cantidad_minima > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.insumos_alertas ia
    WHERE ia.hospital_id = ih.hospital_id
      AND ia.insumo_catalogo_id = ih.insumo_catalogo_id
      AND ia.estado = 'activa'
  );