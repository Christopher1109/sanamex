-- Crear tipo ENUM para tipos de actividad
CREATE TYPE public.tipo_actividad AS ENUM (
  'folio_creado',
  'folio_cancelado',
  'folio_borrador_creado',
  'folio_borrador_eliminado',
  'traspaso_almacen_provisional',
  'devolucion_almacen_principal',
  'recepcion_almacen_central',
  'ajuste_inventario',
  'almacen_provisional_creado',
  'almacen_provisional_eliminado',
  'insumo_agregado',
  'insumo_modificado'
);

-- Crear tabla de registro de actividad
CREATE TABLE public.registro_actividad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL,
  usuario_nombre TEXT NOT NULL,
  tipo_actividad tipo_actividad NOT NULL,
  descripcion TEXT NOT NULL,
  
  -- Detalles opcionales según tipo de actividad
  folio_id UUID REFERENCES public.folios(id) ON DELETE SET NULL,
  numero_folio TEXT,
  almacen_origen_id UUID,
  almacen_origen_nombre TEXT,
  almacen_destino_id UUID,
  almacen_destino_nombre TEXT,
  insumos_afectados JSONB DEFAULT '[]'::jsonb,
  cantidad_total INTEGER,
  detalles_adicionales JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear índices para búsquedas eficientes
CREATE INDEX idx_registro_actividad_hospital ON public.registro_actividad(hospital_id);
CREATE INDEX idx_registro_actividad_usuario ON public.registro_actividad(usuario_id);
CREATE INDEX idx_registro_actividad_tipo ON public.registro_actividad(tipo_actividad);
CREATE INDEX idx_registro_actividad_fecha ON public.registro_actividad(created_at DESC);
CREATE INDEX idx_registro_actividad_folio ON public.registro_actividad(folio_id);

-- Habilitar RLS
ALTER TABLE public.registro_actividad ENABLE ROW LEVEL SECURITY;

-- Política: Gerente de Operaciones puede ver todo
CREATE POLICY "Gerente operaciones puede ver todo el registro"
ON public.registro_actividad
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'gerente_operaciones'::app_role));

-- Política: Supervisor puede ver solo sus hospitales asignados
CREATE POLICY "Supervisor puede ver registro de sus hospitales"
ON public.registro_actividad
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND hospital_id IN (
    SELECT hospital_id FROM public.supervisor_hospital_assignments
    WHERE supervisor_user_id = auth.uid()
  )
);

-- Política: Todos los usuarios autenticados pueden insertar (para registrar sus acciones)
CREATE POLICY "Usuarios pueden registrar actividad"
ON public.registro_actividad
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Habilitar Realtime para actualizaciones en tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.registro_actividad;