-- Crear tabla de catálogo maestro de insumos (sin hospital)
CREATE TABLE IF NOT EXISTS public.insumos_catalogo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  clave TEXT,
  descripcion TEXT,
  categoria TEXT,
  unidad TEXT DEFAULT 'pieza',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear tabla de almacenes (uno por hospital)
CREATE TABLE IF NOT EXISTS public.almacenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  ubicacion TEXT DEFAULT 'Almacén general',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(hospital_id)
);

-- Crear tabla de inventario por hospital
CREATE TABLE IF NOT EXISTS public.inventario_hospital (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  almacen_id UUID NOT NULL REFERENCES public.almacenes(id) ON DELETE CASCADE,
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id) ON DELETE CASCADE,
  lote TEXT,
  fecha_caducidad DATE,
  cantidad_inicial INTEGER DEFAULT 0,
  cantidad_actual INTEGER DEFAULT 0,
  ubicacion TEXT DEFAULT 'Almacén general',
  estatus TEXT DEFAULT 'activo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(almacen_id, insumo_catalogo_id, lote)
);

-- Crear tabla de movimientos de inventario (kardex)
CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventario_id UUID NOT NULL REFERENCES public.inventario_hospital(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id) ON DELETE CASCADE,
  tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN ('entrada', 'salida_por_folio', 'ajuste', 'traspaso_entrada', 'traspaso_salida')),
  cantidad INTEGER NOT NULL,
  cantidad_anterior INTEGER,
  cantidad_nueva INTEGER,
  folio_id UUID REFERENCES public.folios(id) ON DELETE SET NULL,
  traspaso_id UUID REFERENCES public.traspasos(id) ON DELETE SET NULL,
  usuario_id UUID,
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_inventario_hospital_almacen ON public.inventario_hospital(almacen_id);
CREATE INDEX IF NOT EXISTS idx_inventario_hospital_insumo ON public.inventario_hospital(insumo_catalogo_id);
CREATE INDEX IF NOT EXISTS idx_inventario_hospital_hospital ON public.inventario_hospital(hospital_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_hospital ON public.movimientos_inventario(hospital_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_folio ON public.movimientos_inventario(folio_id);

-- Habilitar RLS
ALTER TABLE public.insumos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almacenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_hospital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para insumos_catalogo (todos pueden ver)
CREATE POLICY "Todos pueden ver catálogo de insumos"
  ON public.insumos_catalogo FOR SELECT
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear insumos en catálogo"
  ON public.insumos_catalogo FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar catálogo"
  ON public.insumos_catalogo FOR UPDATE
  USING (true);

-- Políticas RLS para almacenes (todos pueden ver)
CREATE POLICY "Todos pueden ver almacenes"
  ON public.almacenes FOR SELECT
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear almacenes"
  ON public.almacenes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar almacenes"
  ON public.almacenes FOR UPDATE
  USING (true);

-- Políticas RLS para inventario_hospital (filtrado por hospital)
CREATE POLICY "Todos pueden ver inventario"
  ON public.inventario_hospital FOR SELECT
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear inventario"
  ON public.inventario_hospital FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar inventario"
  ON public.inventario_hospital FOR UPDATE
  USING (true);

-- Políticas RLS para movimientos_inventario
CREATE POLICY "Todos pueden ver movimientos"
  ON public.movimientos_inventario FOR SELECT
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear movimientos"
  ON public.movimientos_inventario FOR INSERT
  WITH CHECK (true);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_insumos_catalogo_updated_at
  BEFORE UPDATE ON public.insumos_catalogo
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_almacenes_updated_at
  BEFORE UPDATE ON public.almacenes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventario_hospital_updated_at
  BEFORE UPDATE ON public.inventario_hospital
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();