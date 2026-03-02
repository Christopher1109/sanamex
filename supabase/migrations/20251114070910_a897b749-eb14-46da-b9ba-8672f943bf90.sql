-- Crear tabla para relacionar tipos de anestesia con insumos autorizados
CREATE TABLE IF NOT EXISTS public.anestesia_insumos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_anestesia TEXT NOT NULL,
  insumo_id UUID REFERENCES public.insumos(id) ON DELETE CASCADE,
  cantidad_default INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tipo_anestesia, insumo_id)
);

-- Habilitar RLS
ALTER TABLE public.anestesia_insumos ENABLE ROW LEVEL SECURITY;

-- Política de lectura para todos
CREATE POLICY "All can view anestesia_insumos"
  ON public.anestesia_insumos
  FOR SELECT
  USING (true);

-- Agregar columnas faltantes a la tabla insumos si no existen
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'insumos' AND column_name = 'clave') THEN
    ALTER TABLE public.insumos ADD COLUMN clave TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'insumos' AND column_name = 'descripcion') THEN
    ALTER TABLE public.insumos ADD COLUMN descripcion TEXT;
  END IF;
END $$;

-- Renombrar tabla folio_insumos a folios_insumos si es necesario
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'folio_insumos' AND table_schema = 'public') THEN
    ALTER TABLE public.folio_insumos RENAME TO folios_insumos;
  END IF;
END $$;

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_anestesia_insumos_tipo ON public.anestesia_insumos(tipo_anestesia);
CREATE INDEX IF NOT EXISTS idx_anestesia_insumos_insumo ON public.anestesia_insumos(insumo_id);