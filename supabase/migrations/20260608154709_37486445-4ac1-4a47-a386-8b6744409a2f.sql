
-- ============ BLOQUE A: Ampliar proveedores ============
ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS acepta_devoluciones boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pago_contra_entrega boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notas_credito boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS monto_minimo_pedido numeric DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS proveedores_codigo_uniq
  ON public.proveedores (UPPER(codigo)) WHERE codigo IS NOT NULL;

-- ============ BLOQUE B: Piezas por corrugado ============
CREATE TABLE IF NOT EXISTS public.producto_corrugado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE CASCADE,
  piezas_por_corrugado int NOT NULL CHECK (piezas_por_corrugado > 0),
  piezas_por_caja_master int,
  unidad_minima_compra int DEFAULT 1,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_corrugado_prod_prov
  ON public.producto_corrugado (producto_id, COALESCE(proveedor_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_corrugado_lookup ON public.producto_corrugado (producto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.producto_corrugado TO authenticated;
GRANT ALL ON public.producto_corrugado TO service_role;
ALTER TABLE public.producto_corrugado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver corrugado" ON public.producto_corrugado FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editar corrugado admin/gerente" ON public.producto_corrugado FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));

CREATE TRIGGER update_producto_corrugado_updated_at BEFORE UPDATE ON public.producto_corrugado
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ BLOQUE C: Estatus por sucursal ============
CREATE TABLE IF NOT EXISTS public.producto_sucursal_estatus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  estatus text NOT NULL CHECK (estatus IN ('A','I','C','S','N','E','K','G')),
  fecha_cambio date NOT NULL DEFAULT CURRENT_DATE,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, sucursal_id)
);
CREATE INDEX IF NOT EXISTS idx_estatus_sucursal_lookup
  ON public.producto_sucursal_estatus (producto_id, sucursal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.producto_sucursal_estatus TO authenticated;
GRANT ALL ON public.producto_sucursal_estatus TO service_role;
ALTER TABLE public.producto_sucursal_estatus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver estatus sucursal" ON public.producto_sucursal_estatus FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editar estatus sucursal admin/gerente" ON public.producto_sucursal_estatus FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));

CREATE TRIGGER update_producto_sucursal_estatus_updated_at BEFORE UPDATE ON public.producto_sucursal_estatus
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ BLOQUE D: Ofertas vigentes ============
CREATE TABLE IF NOT EXISTS public.ofertas_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  precio_oferta numeric NOT NULL CHECK (precio_oferta >= 0),
  descuento_pct numeric,
  cantidad_minima int DEFAULT 1,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_fin >= fecha_inicio)
);
CREATE INDEX IF NOT EXISTS idx_ofertas_vigentes
  ON public.ofertas_proveedor (producto_id, fecha_inicio, fecha_fin) WHERE activo = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ofertas_proveedor TO authenticated;
GRANT ALL ON public.ofertas_proveedor TO service_role;
ALTER TABLE public.ofertas_proveedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver ofertas" ON public.ofertas_proveedor FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editar ofertas admin/gerente" ON public.ofertas_proveedor FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));

-- ============ BLOQUE E: Listas de precios ============
CREATE TABLE IF NOT EXISTS public.lista_precio_cargas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  archivo_nombre text NOT NULL,
  fecha_vigencia_desde date NOT NULL,
  fecha_vigencia_hasta date,
  precio_incluye_iva boolean NOT NULL DEFAULT false,
  iva_tasa_default numeric NOT NULL DEFAULT 16,
  reemplaza_carga_anterior boolean NOT NULL DEFAULT true,
  productos_cargados int NOT NULL DEFAULT 0,
  productos_actualizados int NOT NULL DEFAULT 0,
  productos_omitidos int NOT NULL DEFAULT 0,
  productos_autocreados int NOT NULL DEFAULT 0,
  cargado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lista_precio_cargas TO authenticated;
GRANT ALL ON public.lista_precio_cargas TO service_role;
ALTER TABLE public.lista_precio_cargas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver cargas listas" ON public.lista_precio_cargas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Crear cargas listas admin/gerente" ON public.lista_precio_cargas FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));
CREATE POLICY "Actualizar cargas listas admin/gerente" ON public.lista_precio_cargas FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));

CREATE TABLE IF NOT EXISTS public.lista_precio_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  precio numeric NOT NULL CHECK (precio >= 0),
  precio_con_iva numeric,
  existencia_proveedor int DEFAULT 0,
  cantidad_min int NOT NULL DEFAULT 1,
  fecha_vigencia_desde date NOT NULL,
  fecha_vigencia_hasta date,
  carga_id uuid REFERENCES public.lista_precio_cargas(id) ON DELETE SET NULL,
  activo boolean NOT NULL DEFAULT true,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lista_precio_vigente
  ON public.lista_precio_proveedor (producto_id, proveedor_id, activo) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_lista_precio_proveedor
  ON public.lista_precio_proveedor (proveedor_id, fecha_vigencia_desde);
CREATE INDEX IF NOT EXISTS idx_lista_precio_carga ON public.lista_precio_proveedor (carga_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lista_precio_proveedor TO authenticated;
GRANT ALL ON public.lista_precio_proveedor TO service_role;
ALTER TABLE public.lista_precio_proveedor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver lista precios" ON public.lista_precio_proveedor FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editar lista precios admin/gerente" ON public.lista_precio_proveedor FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));

-- ============ Función precio vigente ============
CREATE OR REPLACE FUNCTION public.precio_vigente_proveedor(
  p_producto_id uuid,
  p_proveedor_id uuid,
  p_fecha date DEFAULT CURRENT_DATE
) RETURNS TABLE (
  precio numeric,
  existencia int,
  vigencia_desde date,
  vigencia_hasta date,
  con_oferta boolean,
  precio_oferta numeric,
  cantidad_minima_oferta int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT lp.precio, lp.existencia_proveedor AS existencia,
           lp.fecha_vigencia_desde AS vigencia_desde, lp.fecha_vigencia_hasta AS vigencia_hasta
    FROM lista_precio_proveedor lp
    WHERE lp.producto_id = p_producto_id
      AND lp.proveedor_id = p_proveedor_id
      AND lp.activo = true
      AND lp.fecha_vigencia_desde <= p_fecha
      AND (lp.fecha_vigencia_hasta IS NULL OR lp.fecha_vigencia_hasta >= p_fecha)
    ORDER BY lp.fecha_vigencia_desde DESC
    LIMIT 1
  ),
  oferta AS (
    SELECT o.precio_oferta, o.cantidad_minima
    FROM ofertas_proveedor o
    WHERE o.producto_id = p_producto_id
      AND o.proveedor_id = p_proveedor_id
      AND o.activo = true
      AND p_fecha BETWEEN o.fecha_inicio AND o.fecha_fin
    ORDER BY o.precio_oferta ASC
    LIMIT 1
  )
  SELECT b.precio, b.existencia, b.vigencia_desde, b.vigencia_hasta,
         (o.precio_oferta IS NOT NULL), o.precio_oferta, o.cantidad_minima
  FROM base b LEFT JOIN oferta o ON true;
$$;

GRANT EXECUTE ON FUNCTION public.precio_vigente_proveedor(uuid, uuid, date) TO authenticated;
