-- Agregar columna almacen_provisional_id a folios para rastrear origen del consumo
ALTER TABLE public.folios 
ADD COLUMN IF NOT EXISTS almacen_provisional_id UUID REFERENCES public.almacenes_provisionales(id);

-- Migrar datos existentes: inferir almacen_provisional_id desde movimientos
UPDATE public.folios f
SET almacen_provisional_id = (
  SELECT DISTINCT m.almacen_provisional_id 
  FROM public.movimientos_almacen_provisional m
  WHERE m.folio_id = f.id 
  AND m.tipo = 'salida'
  LIMIT 1
)
WHERE f.almacen_provisional_id IS NULL
AND EXISTS (
  SELECT 1 FROM public.movimientos_almacen_provisional m
  WHERE m.folio_id = f.id
);

-- Índice para mejorar performance en consultas de cancelación
CREATE INDEX IF NOT EXISTS idx_folios_almacen_provisional_id 
ON public.folios(almacen_provisional_id) 
WHERE almacen_provisional_id IS NOT NULL;