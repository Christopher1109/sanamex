
-- ============== Tabla de decisiones del comprador ==============
CREATE TABLE IF NOT EXISTS public.sugeridos_decisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE CASCADE,
  fecha_decision date NOT NULL DEFAULT CURRENT_DATE,
  periodo_referencia int NOT NULL CHECK (periodo_referencia IN (7,14,30,60,90,120)),
  sugerido_sistema int NOT NULL DEFAULT 0,
  pz_solicitadas int NOT NULL DEFAULT 0,
  comentario_gerente text,
  decidido_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sugeridos_decisiones
  ON public.sugeridos_decisiones (producto_id, COALESCE(sucursal_id,'00000000-0000-0000-0000-000000000000'::uuid), fecha_decision, periodo_referencia);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sugeridos_decisiones TO authenticated;
GRANT ALL ON public.sugeridos_decisiones TO service_role;

ALTER TABLE public.sugeridos_decisiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decisiones_select" ON public.sugeridos_decisiones FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'gerente'::app_role)
  OR public.has_role(auth.uid(),'subgerente'::app_role)
  OR public.has_role(auth.uid(),'almacen'::app_role)
  OR public.has_role(auth.uid(),'almacen_ventas'::app_role)
  OR public.has_role(auth.uid(),'ventas'::app_role)
);

CREATE POLICY "decisiones_write" ON public.sugeridos_decisiones FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'gerente'::app_role)
  OR public.has_role(auth.uid(),'subgerente'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'gerente'::app_role)
  OR public.has_role(auth.uid(),'subgerente'::app_role)
);

CREATE TRIGGER trg_sugeridos_decisiones_updated
BEFORE UPDATE ON public.sugeridos_decisiones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== Función helper min/max días ==============
CREATE OR REPLACE FUNCTION public.sugerido_min_max(p_clasificacion text)
RETURNS TABLE(min_dias int, max_dias int)
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT
    CASE WHEN UPPER(TRIM(COALESCE(p_clasificacion,''))) IN ('A','B','C') THEN 30 ELSE 20 END,
    CASE WHEN UPPER(TRIM(COALESCE(p_clasificacion,''))) IN ('A','B','C') THEN 45 ELSE 30 END
$$;

-- ============== Función principal: reporte_sugeridos ==============
CREATE OR REPLACE FUNCTION public.reporte_sugeridos(
  p_sucursal_codigo text DEFAULT NULL,
  p_fecha_corte date DEFAULT CURRENT_DATE,
  p_clasificacion text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_solo_comprar boolean DEFAULT false
) RETURNS TABLE (
  producto_id uuid,
  clave text,
  departamento text,
  descripcion text,
  clasificacion text,
  status text,
  min_dias int,
  max_dias int,
  existencias int,
  ddi_7 numeric, ventas_7 numeric, eval_7 text, sugerido_7 int,
  ddi_14 numeric, ventas_14 numeric, eval_14 text, sugerido_14 int,
  ddi_30 numeric, ventas_30 numeric, eval_30 text, sugerido_30 int,
  ddi_60 numeric, ventas_60 numeric, eval_60 text, sugerido_60 int,
  ddi_90 numeric, ventas_90 numeric, eval_90 text, sugerido_90 int,
  ddi_120 numeric, ventas_120 numeric, eval_120 text, sugerido_120 int,
  comentario_resumen text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suc_id uuid;
BEGIN
  IF p_sucursal_codigo IS NOT NULL THEN
    SELECT id INTO v_suc_id FROM sucursales WHERE codigo = p_sucursal_codigo;
  END IF;

  RETURN QUERY
  WITH ventas_periodo AS (
    SELECT
      vl.producto_id,
      COALESCE(SUM(vl.cantidad) FILTER (WHERE v.fecha::date >= p_fecha_corte - 7 AND v.fecha::date < p_fecha_corte),0)::numeric  AS v7,
      COALESCE(SUM(vl.cantidad) FILTER (WHERE v.fecha::date >= p_fecha_corte - 14 AND v.fecha::date < p_fecha_corte),0)::numeric AS v14,
      COALESCE(SUM(vl.cantidad) FILTER (WHERE v.fecha::date >= p_fecha_corte - 30 AND v.fecha::date < p_fecha_corte),0)::numeric AS v30,
      COALESCE(SUM(vl.cantidad) FILTER (WHERE v.fecha::date >= p_fecha_corte - 60 AND v.fecha::date < p_fecha_corte),0)::numeric AS v60,
      COALESCE(SUM(vl.cantidad) FILTER (WHERE v.fecha::date >= p_fecha_corte - 90 AND v.fecha::date < p_fecha_corte),0)::numeric AS v90,
      COALESCE(SUM(vl.cantidad) FILTER (WHERE v.fecha::date >= p_fecha_corte - 120 AND v.fecha::date < p_fecha_corte),0)::numeric AS v120
    FROM venta_lineas vl
    JOIN ventas v ON v.id = vl.venta_id AND v.estado = 'completada'
    WHERE v.fecha::date >= p_fecha_corte - 120 AND v.fecha::date < p_fecha_corte
      AND (v_suc_id IS NULL OR v.sucursal_id = v_suc_id)
    GROUP BY vl.producto_id
  ),
  ventas_hist AS (
    SELECT
      p.id AS producto_id,
      COALESCE(SUM(vh.cantidad) FILTER (WHERE vh.fecha >= p_fecha_corte - 7 AND vh.fecha < p_fecha_corte),0)::numeric  AS h7,
      COALESCE(SUM(vh.cantidad) FILTER (WHERE vh.fecha >= p_fecha_corte - 14 AND vh.fecha < p_fecha_corte),0)::numeric AS h14,
      COALESCE(SUM(vh.cantidad) FILTER (WHERE vh.fecha >= p_fecha_corte - 30 AND vh.fecha < p_fecha_corte),0)::numeric AS h30,
      COALESCE(SUM(vh.cantidad) FILTER (WHERE vh.fecha >= p_fecha_corte - 60 AND vh.fecha < p_fecha_corte),0)::numeric AS h60,
      COALESCE(SUM(vh.cantidad) FILTER (WHERE vh.fecha >= p_fecha_corte - 90 AND vh.fecha < p_fecha_corte),0)::numeric AS h90,
      COALESCE(SUM(vh.cantidad) FILTER (WHERE vh.fecha >= p_fecha_corte - 120 AND vh.fecha < p_fecha_corte),0)::numeric AS h120
    FROM productos p
    JOIN ventas_historicas vh ON vh.producto_sku = p.sku
    WHERE vh.fecha >= p_fecha_corte - 120 AND vh.fecha < p_fecha_corte
      AND (v_suc_id IS NULL OR vh.sucursal_id = v_suc_id)
    GROUP BY p.id
  ),
  ventas AS (
    SELECT
      COALESCE(vp.producto_id, vh.producto_id) AS producto_id,
      COALESCE(vp.v7,0)+COALESCE(vh.h7,0) AS v7,
      COALESCE(vp.v14,0)+COALESCE(vh.h14,0) AS v14,
      COALESCE(vp.v30,0)+COALESCE(vh.h30,0) AS v30,
      COALESCE(vp.v60,0)+COALESCE(vh.h60,0) AS v60,
      COALESCE(vp.v90,0)+COALESCE(vh.h90,0) AS v90,
      COALESCE(vp.v120,0)+COALESCE(vh.h120,0) AS v120
    FROM ventas_periodo vp
    FULL OUTER JOIN ventas_hist vh ON vh.producto_id = vp.producto_id
  ),
  exist_calc AS (
    SELECT l.producto_id, SUM(i.cantidad)::int AS existencias
    FROM inventario i
    JOIN almacenes a ON a.id = i.almacen_id
    JOIN lotes l ON l.id = i.lote_id
    WHERE (v_suc_id IS NULL OR a.sucursal_id = v_suc_id)
    GROUP BY l.producto_id
  ),
  base AS (
    SELECT
      p.id,
      COALESCE(NULLIF(p.codigo_barras,''), p.sku)::text AS clave,
      p.departamento::text AS departamento,
      COALESCE(p.descripcion, p.nombre)::text AS descripcion,
      COALESCE(p.clasificacion, p.clasificacion_80_20)::text AS clasif,
      p.estatus::text AS status,
      COALESCE(e.existencias,0) AS exist_total,
      COALESCE(vt.v7,0) AS v7, COALESCE(vt.v14,0) AS v14, COALESCE(vt.v30,0) AS v30,
      COALESCE(vt.v60,0) AS v60, COALESCE(vt.v90,0) AS v90, COALESCE(vt.v120,0) AS v120
    FROM productos p
    LEFT JOIN ventas vt ON vt.producto_id = p.id
    LEFT JOIN exist_calc e ON e.producto_id = p.id
    WHERE p.activo = true
      AND (p_clasificacion IS NULL OR COALESCE(p.clasificacion, p.clasificacion_80_20) = p_clasificacion)
      AND (p_status IS NULL OR p.estatus = p_status)
  ),
  calc AS (
    SELECT b.*,
      (CASE WHEN UPPER(TRIM(COALESCE(b.clasif,''))) IN ('A','B','C') THEN 30 ELSE 20 END)::int AS mind,
      (CASE WHEN UPPER(TRIM(COALESCE(b.clasif,''))) IN ('A','B','C') THEN 45 ELSE 30 END)::int AS maxd
    FROM base b
  ),
  eval AS (
    SELECT c.*,
      -- DDI por período
      CASE WHEN c.v7=0 THEN 0 ELSE ROUND((c.exist_total::numeric / c.v7) * 7, 1) END AS ddi_7,
      CASE WHEN c.v14=0 THEN 0 ELSE ROUND((c.exist_total::numeric / c.v14) * 14, 1) END AS ddi_14,
      CASE WHEN c.v30=0 THEN 0 ELSE ROUND((c.exist_total::numeric / c.v30) * 30, 1) END AS ddi_30,
      CASE WHEN c.v60=0 THEN 0 ELSE ROUND((c.exist_total::numeric / c.v60) * 60, 1) END AS ddi_60,
      CASE WHEN c.v90=0 THEN 0 ELSE ROUND((c.exist_total::numeric / c.v90) * 90, 1) END AS ddi_90,
      CASE WHEN c.v120=0 THEN 0 ELSE ROUND((c.exist_total::numeric / c.v120) * 120, 1) END AS ddi_120
    FROM calc c
  )
  SELECT
    e.id AS producto_id,
    e.clave, e.departamento, e.descripcion, e.clasif AS clasificacion, e.status,
    e.mind AS min_dias, e.maxd AS max_dias,
    e.exist_total AS existencias,
    -- 7
    e.ddi_7, e.v7 AS ventas_7,
    CASE WHEN e.v7=0 THEN 'No Resurtir' WHEN e.ddi_7 > e.maxd THEN 'No Resurtir' ELSE 'Comprar' END AS eval_7,
    CASE WHEN e.v7=0 OR e.ddi_7 > e.maxd THEN 0
         ELSE GREATEST(0, ROUND(((e.maxd - e.ddi_7) * e.v7 / 7))::int) END AS sugerido_7,
    -- 14
    e.ddi_14, e.v14 AS ventas_14,
    CASE WHEN e.v14=0 THEN 'No Resurtir' WHEN e.ddi_14 > e.maxd THEN 'No Resurtir' ELSE 'Comprar' END AS eval_14,
    CASE WHEN e.v14=0 OR e.ddi_14 > e.maxd THEN 0
         ELSE GREATEST(0, ROUND(((e.maxd - e.ddi_14) * e.v14 / 14))::int) END AS sugerido_14,
    -- 30
    e.ddi_30, e.v30 AS ventas_30,
    CASE WHEN e.v30=0 THEN 'No Resurtir' WHEN e.ddi_30 > e.maxd THEN 'No Resurtir' ELSE 'Comprar' END AS eval_30,
    CASE WHEN e.v30=0 OR e.ddi_30 > e.maxd THEN 0
         ELSE GREATEST(0, ROUND(((e.maxd - e.ddi_30) * e.v30 / 30))::int) END AS sugerido_30,
    -- 60
    e.ddi_60, e.v60 AS ventas_60,
    CASE WHEN e.v60=0 THEN 'No Resurtir' WHEN e.ddi_60 > e.maxd THEN 'No Resurtir' ELSE 'Comprar' END AS eval_60,
    CASE WHEN e.v60=0 OR e.ddi_60 > e.maxd THEN 0
         ELSE GREATEST(0, ROUND(((e.maxd - e.ddi_60) * e.v60 / 60))::int) END AS sugerido_60,
    -- 90
    e.ddi_90, e.v90 AS ventas_90,
    CASE WHEN e.v90=0 THEN 'No Resurtir' WHEN e.ddi_90 > e.maxd THEN 'No Resurtir' ELSE 'Comprar' END AS eval_90,
    CASE WHEN e.v90=0 OR e.ddi_90 > e.maxd THEN 0
         ELSE GREATEST(0, ROUND(((e.maxd - e.ddi_90) * e.v90 / 90))::int) END AS sugerido_90,
    -- 120
    e.ddi_120, e.v120 AS ventas_120,
    CASE WHEN e.v120=0 THEN 'No Resurtir' WHEN e.ddi_120 > e.maxd THEN 'No Resurtir' ELSE 'Comprar' END AS eval_120,
    CASE WHEN e.v120=0 OR e.ddi_120 > e.maxd THEN 0
         ELSE GREATEST(0, ROUND(((e.maxd - e.ddi_120) * e.v120 / 120))::int) END AS sugerido_120,
    -- Resumen (solo 7/14/30)
    CASE WHEN (e.v7>0 AND e.ddi_7<=e.maxd) OR (e.v14>0 AND e.ddi_14<=e.maxd) OR (e.v30>0 AND e.ddi_30<=e.maxd)
         THEN 'Comprar' ELSE 'No Resurtir' END AS comentario_resumen
  FROM eval e
  WHERE NOT p_solo_comprar
     OR (e.v7>0 AND e.ddi_7<=e.maxd) OR (e.v14>0 AND e.ddi_14<=e.maxd) OR (e.v30>0 AND e.ddi_30<=e.maxd)
  ORDER BY e.clave;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reporte_sugeridos(text,date,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sugerido_min_max(text) TO authenticated;
