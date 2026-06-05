
CREATE TABLE IF NOT EXISTS public.productos_status (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  orden integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.productos_status TO anon, authenticated;
GRANT ALL ON public.productos_status TO service_role;
ALTER TABLE public.productos_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Status catalog readable" ON public.productos_status;
CREATE POLICY "Status catalog readable" ON public.productos_status FOR SELECT USING (true);
DROP POLICY IF EXISTS "Status catalog admin write" ON public.productos_status;
CREATE POLICY "Status catalog admin write" ON public.productos_status FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

INSERT INTO public.productos_status (codigo, nombre, orden) VALUES
  ('A','ACTIVO',1),('I','INACTIVO',2),('C','CANCELADO',3),('S','SUSTITUTO',4),
  ('N','NUEVO',5),('E','COMPRA ESPECIAL',6),('K','CORTA CADUCIDAD',7),('G','AGOTADO',8)
ON CONFLICT (codigo) DO UPDATE SET nombre=EXCLUDED.nombre, orden=EXCLUDED.orden;

CREATE TABLE IF NOT EXISTS public.productos_precios_lista (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  lista smallint NOT NULL CHECK (lista BETWEEN 1 AND 4),
  precio numeric(14,4) NOT NULL,
  vigente_desde date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, lista, vigente_desde)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.productos_precios_lista TO authenticated;
GRANT ALL ON public.productos_precios_lista TO service_role;
ALTER TABLE public.productos_precios_lista ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Price lists read" ON public.productos_precios_lista;
CREATE POLICY "Price lists read" ON public.productos_precios_lista FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Price lists write" ON public.productos_precios_lista;
CREATE POLICY "Price lists write" ON public.productos_precios_lista FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'gerente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'gerente'));

CREATE INDEX IF NOT EXISTS idx_ppl_producto_lista ON public.productos_precios_lista (producto_id, lista, vigente_desde DESC);

CREATE OR REPLACE FUNCTION public.inventario_resumen_por_sucursal(p_fecha date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  sucursal_id uuid, sucursal_codigo text, sucursal_nombre text,
  existencias_pzs bigint, existencias_pesos numeric,
  items bigint, ddi_30 numeric, ddi_60 numeric, ddi_90 numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH inv AS (
    SELECT s.id as sid, s.codigo, s.nombre,
      COALESCE(SUM(i.cantidad),0)::bigint as pzs,
      COALESCE(SUM(i.cantidad * COALESCE(l.costo_unitario,0)),0)::numeric as pesos,
      COUNT(DISTINCT l.producto_id) FILTER (WHERE i.cantidad>0)::bigint as items
    FROM sucursales s
    LEFT JOIN almacenes a ON a.sucursal_id = s.id
    LEFT JOIN inventario i ON i.almacen_id = a.id
    LEFT JOIN lotes l ON l.id = i.lote_id
    WHERE s.activo = true
    GROUP BY s.id, s.codigo, s.nombre
  ),
  vel AS (
    SELECT v.sucursal_id as sid,
      SUM(vl.cantidad) FILTER (WHERE v.fecha >= p_fecha - interval '30 days') AS v30,
      SUM(vl.cantidad) FILTER (WHERE v.fecha >= p_fecha - interval '60 days') AS v60,
      SUM(vl.cantidad) FILTER (WHERE v.fecha >= p_fecha - interval '90 days') AS v90
    FROM venta_lineas vl
    JOIN ventas v ON v.id = vl.venta_id
    WHERE v.estado='completada' AND v.fecha <= p_fecha + interval '1 day'
    GROUP BY v.sucursal_id
  )
  SELECT inv.sid, inv.codigo, inv.nombre, inv.pzs, inv.pesos, inv.items,
    CASE WHEN COALESCE(vel.v30,0)>0 THEN (inv.pzs::numeric / (vel.v30/30.0)) ELSE NULL END,
    CASE WHEN COALESCE(vel.v60,0)>0 THEN (inv.pzs::numeric / (vel.v60/60.0)) ELSE NULL END,
    CASE WHEN COALESCE(vel.v90,0)>0 THEN (inv.pzs::numeric / (vel.v90/90.0)) ELSE NULL END
  FROM inv LEFT JOIN vel ON vel.sid = inv.sid
  ORDER BY inv.codigo;
$$;

CREATE OR REPLACE FUNCTION public.inventario_abc_por_sucursal(p_fecha date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  clasificacion text, sucursal_id uuid, sucursal_codigo text,
  piezas bigint, pesos numeric, items bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(p.clasificacion_80_20,'D'),
    s.id, s.codigo,
    COALESCE(SUM(i.cantidad),0)::bigint,
    COALESCE(SUM(i.cantidad * COALESCE(l.costo_unitario,0)),0)::numeric,
    COUNT(DISTINCT p.id) FILTER (WHERE i.cantidad>0)::bigint
  FROM sucursales s
  LEFT JOIN almacenes a ON a.sucursal_id = s.id
  LEFT JOIN inventario i ON i.almacen_id = a.id
  LEFT JOIN lotes l ON l.id = i.lote_id
  LEFT JOIN productos p ON p.id = l.producto_id
  WHERE s.activo = true AND p.id IS NOT NULL
  GROUP BY COALESCE(p.clasificacion_80_20,'D'), s.id, s.codigo
  ORDER BY 1, 3;
$$;

CREATE OR REPLACE FUNCTION public.inventario_status_por_sucursal(p_fecha date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  status text, sucursal_id uuid, sucursal_codigo text,
  cantidad bigint, items bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(p.estatus,'A'),
    s.id, s.codigo,
    COALESCE(SUM(i.cantidad),0)::bigint,
    COUNT(DISTINCT p.id) FILTER (WHERE i.cantidad>0)::bigint
  FROM sucursales s
  LEFT JOIN almacenes a ON a.sucursal_id = s.id
  LEFT JOIN inventario i ON i.almacen_id = a.id
  LEFT JOIN lotes l ON l.id = i.lote_id
  LEFT JOIN productos p ON p.id = l.producto_id
  WHERE s.activo = true AND p.id IS NOT NULL
  GROUP BY COALESCE(p.estatus,'A'), s.id, s.codigo
  ORDER BY 1, 3;
$$;

CREATE OR REPLACE FUNCTION public.reporte_margenes(p_fecha date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  producto_id uuid, clave text, departamento text, descripcion text,
  clasificacion text, status text, cp numeric, existencias bigint, costo_total numeric,
  lp1 numeric, util_lp1 numeric, margen_lp1 numeric,
  lp2 numeric, util_lp2 numeric, margen_lp2 numeric,
  lp3 numeric, util_lp3 numeric, margen_lp3 numeric,
  lp4 numeric, util_lp4 numeric, margen_lp4 numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH inv AS (
    SELECT l.producto_id,
      SUM(i.cantidad)::bigint AS pzs,
      SUM(i.cantidad * COALESCE(l.costo_unitario,0))::numeric AS costo
    FROM inventario i JOIN lotes l ON l.id = i.lote_id
    GROUP BY l.producto_id
  ),
  precios AS (
    SELECT DISTINCT ON (producto_id, lista)
      producto_id, lista, precio
    FROM productos_precios_lista
    WHERE vigente_desde <= p_fecha
    ORDER BY producto_id, lista, vigente_desde DESC
  )
  SELECT
    p.id,
    COALESCE(p.codigo_barras, p.sku),
    p.departamento, p.nombre,
    p.clasificacion_80_20, p.estatus,
    COALESCE(p.costo_promedio,0),
    COALESCE(inv.pzs,0), COALESCE(inv.costo,0),
    MAX(CASE WHEN pr.lista=1 THEN pr.precio END),
    MAX(CASE WHEN pr.lista=1 THEN pr.precio - COALESCE(p.costo_promedio,0) END),
    MAX(CASE WHEN pr.lista=1 AND pr.precio>0 THEN (pr.precio - COALESCE(p.costo_promedio,0))/pr.precio*100 END),
    MAX(CASE WHEN pr.lista=2 THEN pr.precio END),
    MAX(CASE WHEN pr.lista=2 THEN pr.precio - COALESCE(p.costo_promedio,0) END),
    MAX(CASE WHEN pr.lista=2 AND pr.precio>0 THEN (pr.precio - COALESCE(p.costo_promedio,0))/pr.precio*100 END),
    MAX(CASE WHEN pr.lista=3 THEN pr.precio END),
    MAX(CASE WHEN pr.lista=3 THEN pr.precio - COALESCE(p.costo_promedio,0) END),
    MAX(CASE WHEN pr.lista=3 AND pr.precio>0 THEN (pr.precio - COALESCE(p.costo_promedio,0))/pr.precio*100 END),
    MAX(CASE WHEN pr.lista=4 THEN pr.precio END),
    MAX(CASE WHEN pr.lista=4 THEN pr.precio - COALESCE(p.costo_promedio,0) END),
    MAX(CASE WHEN pr.lista=4 AND pr.precio>0 THEN (pr.precio - COALESCE(p.costo_promedio,0))/pr.precio*100 END)
  FROM productos p
  LEFT JOIN inv ON inv.producto_id = p.id
  LEFT JOIN precios pr ON pr.producto_id = p.id
  WHERE p.activo = true
  GROUP BY p.id, p.codigo_barras, p.sku, p.departamento, p.nombre, p.clasificacion_80_20, p.estatus, p.costo_promedio, inv.pzs, inv.costo
  ORDER BY p.nombre;
$$;
