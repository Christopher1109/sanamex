-- 1. Agregar tirada_id a transferencias_central_hospital
ALTER TABLE public.transferencias_central_hospital
ADD COLUMN IF NOT EXISTS tirada_id uuid;

-- 2. Agregar tirada_id a alertas_transferencia
ALTER TABLE public.alertas_transferencia
ADD COLUMN IF NOT EXISTS tirada_id uuid;

-- 3. Crear tabla almacenes_provisionales
CREATE TABLE IF NOT EXISTS public.almacenes_provisionales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitales(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  activo boolean DEFAULT true,
  es_principal boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.almacenes_provisionales ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Almacenistas pueden ver almacenes de su hospital"
ON public.almacenes_provisionales FOR SELECT
USING (has_role(auth.uid(), 'almacenista') OR has_role(auth.uid(), 'lider') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'gerente') OR has_role(auth.uid(), 'gerente_operaciones'));

CREATE POLICY "Almacenistas pueden crear almacenes provisionales"
ON public.almacenes_provisionales FOR INSERT
WITH CHECK (has_role(auth.uid(), 'almacenista'));

CREATE POLICY "Almacenistas pueden actualizar almacenes provisionales"
ON public.almacenes_provisionales FOR UPDATE
USING (has_role(auth.uid(), 'almacenista'));

CREATE POLICY "Almacenistas pueden eliminar almacenes provisionales"
ON public.almacenes_provisionales FOR DELETE
USING (has_role(auth.uid(), 'almacenista'));

-- 4. Crear tabla almacen_provisional_inventario
CREATE TABLE IF NOT EXISTS public.almacen_provisional_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_provisional_id uuid NOT NULL REFERENCES public.almacenes_provisionales(id) ON DELETE CASCADE,
  insumo_catalogo_id uuid NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_disponible integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.almacen_provisional_inventario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver inventario provisional"
ON public.almacen_provisional_inventario FOR SELECT
USING (has_role(auth.uid(), 'almacenista') OR has_role(auth.uid(), 'lider') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'auxiliar') OR has_role(auth.uid(), 'gerente') OR has_role(auth.uid(), 'gerente_operaciones'));

CREATE POLICY "Almacenistas pueden crear inventario provisional"
ON public.almacen_provisional_inventario FOR INSERT
WITH CHECK (has_role(auth.uid(), 'almacenista'));

CREATE POLICY "Almacenistas pueden actualizar inventario provisional"
ON public.almacen_provisional_inventario FOR UPDATE
USING (has_role(auth.uid(), 'almacenista'));

-- 5. Crear tabla movimientos_almacen_provisional
CREATE TABLE IF NOT EXISTS public.movimientos_almacen_provisional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_provisional_id uuid NOT NULL REFERENCES public.almacenes_provisionales(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitales(id),
  insumo_catalogo_id uuid NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'salida', 'devolucion', 'consumo_folio')),
  folio_id uuid REFERENCES public.folios(id),
  observaciones text,
  usuario_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.movimientos_almacen_provisional ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver movimientos provisionales"
ON public.movimientos_almacen_provisional FOR SELECT
USING (true);

CREATE POLICY "Almacenistas pueden crear movimientos provisionales"
ON public.movimientos_almacen_provisional FOR INSERT
WITH CHECK (has_role(auth.uid(), 'almacenista') OR has_role(auth.uid(), 'lider') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'auxiliar'));

-- 6. Crear tabla mermas_transferencia
CREATE TABLE IF NOT EXISTS public.mermas_transferencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transferencia_id uuid REFERENCES public.transferencias_central_hospital(id),
  alerta_transferencia_id uuid REFERENCES public.alertas_transferencia(id),
  insumo_catalogo_id uuid NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_enviada integer NOT NULL,
  cantidad_recibida integer NOT NULL,
  cantidad_merma integer NOT NULL,
  motivo text,
  registrado_por uuid,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.mermas_transferencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver mermas"
ON public.mermas_transferencia FOR SELECT
USING (true);

CREATE POLICY "Almacenistas pueden registrar mermas"
ON public.mermas_transferencia FOR INSERT
WITH CHECK (has_role(auth.uid(), 'almacenista') OR has_role(auth.uid(), 'cadena_suministros'));

-- 7. Crear tabla rutas_distribucion
CREATE TABLE IF NOT EXISTS public.rutas_distribucion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_ruta text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('zona', 'estado', 'region')),
  descripcion text,
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.rutas_distribucion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cadena puede ver rutas"
ON public.rutas_distribucion FOR SELECT
USING (has_role(auth.uid(), 'cadena_suministros') OR has_role(auth.uid(), 'gerente_operaciones'));

CREATE POLICY "Cadena puede crear rutas"
ON public.rutas_distribucion FOR INSERT
WITH CHECK (has_role(auth.uid(), 'cadena_suministros'));

CREATE POLICY "Cadena puede actualizar rutas"
ON public.rutas_distribucion FOR UPDATE
USING (has_role(auth.uid(), 'cadena_suministros'));

CREATE POLICY "Cadena puede eliminar rutas"
ON public.rutas_distribucion FOR DELETE
USING (has_role(auth.uid(), 'cadena_suministros'));

-- 8. Crear tabla rutas_hospitales
CREATE TABLE IF NOT EXISTS public.rutas_hospitales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruta_id uuid NOT NULL REFERENCES public.rutas_distribucion(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitales(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(ruta_id, hospital_id)
);

ALTER TABLE public.rutas_hospitales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cadena puede ver relacion rutas-hospitales"
ON public.rutas_hospitales FOR SELECT
USING (has_role(auth.uid(), 'cadena_suministros') OR has_role(auth.uid(), 'gerente_operaciones'));

CREATE POLICY "Cadena puede crear relacion rutas-hospitales"
ON public.rutas_hospitales FOR INSERT
WITH CHECK (has_role(auth.uid(), 'cadena_suministros'));

CREATE POLICY "Cadena puede eliminar relacion rutas-hospitales"
ON public.rutas_hospitales FOR DELETE
USING (has_role(auth.uid(), 'cadena_suministros'));

-- 9. Crear tabla hospital_procedimientos para asignación de procedimientos por hospital
CREATE TABLE IF NOT EXISTS public.hospital_procedimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitales(id) ON DELETE CASCADE,
  procedimiento_clave text NOT NULL,
  procedimiento_nombre text NOT NULL,
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  UNIQUE(hospital_id, procedimiento_clave)
);

ALTER TABLE public.hospital_procedimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver procedimientos de hospital"
ON public.hospital_procedimientos FOR SELECT
USING (true);

CREATE POLICY "Supervisores pueden gestionar procedimientos"
ON public.hospital_procedimientos FOR INSERT
WITH CHECK (has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'gerente') OR has_role(auth.uid(), 'gerente_operaciones'));

CREATE POLICY "Supervisores pueden actualizar procedimientos"
ON public.hospital_procedimientos FOR UPDATE
USING (has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'gerente') OR has_role(auth.uid(), 'gerente_operaciones'));

CREATE POLICY "Supervisores pueden eliminar procedimientos"
ON public.hospital_procedimientos FOR DELETE
USING (has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'gerente') OR has_role(auth.uid(), 'gerente_operaciones'));

-- 10. Agregar campos para órdenes parciales en documento_agrupado_detalle
ALTER TABLE public.documento_agrupado_detalle
ADD COLUMN IF NOT EXISTS cantidad_cubierta integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS cantidad_pendiente integer GENERATED ALWAYS AS (total_faltante_requerido - cantidad_cubierta) STORED;

-- 11. Agregar campo ruta_id a transferencias para trazabilidad
ALTER TABLE public.transferencias_central_hospital
ADD COLUMN IF NOT EXISTS ruta_id uuid REFERENCES public.rutas_distribucion(id);

-- 12. Agregar campos para merma en recepción de pedidos
ALTER TABLE public.pedido_items
ADD COLUMN IF NOT EXISTS cantidad_merma integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS motivo_merma text;

-- 13. Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_transferencias_tirada ON public.transferencias_central_hospital(tirada_id);
CREATE INDEX IF NOT EXISTS idx_alertas_tirada ON public.alertas_transferencia(tirada_id);
CREATE INDEX IF NOT EXISTS idx_almacenes_prov_hospital ON public.almacenes_provisionales(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospital_procedimientos_hospital ON public.hospital_procedimientos(hospital_id);