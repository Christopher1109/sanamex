-- ============================================
-- 1) Tabla presupuesto_ventas
-- ============================================
CREATE TABLE IF NOT EXISTS public.presupuesto_ventas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  anio int NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  dia int CHECK (dia IS NULL OR dia BETWEEN 1 AND 31),
  venta_presupuestada numeric NOT NULL DEFAULT 0,
  margen_presupuestado numeric,
  utilidad_presupuestada numeric,
  notas text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presupuesto_uniq UNIQUE (sucursal_id, anio, mes, dia)
);

CREATE INDEX IF NOT EXISTS idx_presupuesto_lookup
  ON public.presupuesto_ventas (sucursal_id, anio, mes);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.presupuesto_ventas TO authenticated;
GRANT ALL ON public.presupuesto_ventas TO service_role;

ALTER TABLE public.presupuesto_ventas ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier rol autenticado excepto repartidor
CREATE POLICY "presupuesto_select_no_repartidor"
ON public.presupuesto_ventas FOR SELECT
TO authenticated
USING (NOT public.has_role(auth.uid(), 'repartidor'));

-- Escritura: solo admin / super_admin
CREATE POLICY "presupuesto_insert_admin"
ON public.presupuesto_ventas FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "presupuesto_update_admin"
ON public.presupuesto_ventas FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "presupuesto_delete_admin"
ON public.presupuesto_ventas FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE TRIGGER trg_presupuesto_updated_at
BEFORE UPDATE ON public.presupuesto_ventas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 2) Función reporte_dashboard_mensual
-- ============================================
CREATE OR REPLACE FUNCTION public.reporte_dashboard_mensual(
  p_anios int[] DEFAULT NULL,
  p_sucursales text[] DEFAULT NULL
)
RETURNS TABLE (
  sucursal_codigo text,
  sucursal_nombre text,
  anio int,
  mes int,
  ventas numeric,
  costo numeric,
  utilidad numeric,
  margen_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    s.codigo,
    s.nombre,
    EXTRACT(YEAR FROM v.fecha)::int AS anio,
    EXTRACT(MONTH FROM v.fecha)::int AS mes,
    SUM(vl.subtotal)::numeric AS ventas,
    SUM(vl.cantidad * COALESCE(vl.costo_unitario, 0))::numeric AS costo,
    (SUM(vl.subtotal) - SUM(vl.cantidad * COALESCE(vl.costo_unitario, 0)))::numeric AS utilidad,
    CASE WHEN SUM(vl.subtotal) > 0
      THEN ((SUM(vl.subtotal) - SUM(vl.cantidad * COALESCE(vl.costo_unitario, 0))) / SUM(vl.subtotal) * 100)::numeric
      ELSE 0::numeric
    END AS margen_pct
  FROM public.ventas v
  JOIN public.venta_lineas vl ON vl.venta_id = v.id
  JOIN public.sucursales s ON s.id = v.sucursal_id
  WHERE v.estado = 'completada'
    AND (p_anios IS NULL OR EXTRACT(YEAR FROM v.fecha)::int = ANY(p_anios))
    AND (p_sucursales IS NULL OR s.codigo = ANY(p_sucursales))
  GROUP BY s.codigo, s.nombre, EXTRACT(YEAR FROM v.fecha), EXTRACT(MONTH FROM v.fecha)
  ORDER BY s.codigo, anio, mes;
$$;

-- ============================================
-- 3) Función reporte_presupuesto_vs_real
-- ============================================
CREATE OR REPLACE FUNCTION public.reporte_presupuesto_vs_real(
  p_anio int,
  p_mes int DEFAULT NULL,
  p_sucursales text[] DEFAULT NULL
)
RETURNS TABLE (
  fecha date,
  sucursal_id uuid,
  sucursal_codigo text,
  sucursal_nombre text,
  venta_real numeric,
  venta_presupuestada numeric,
  diferencia numeric,
  porcentaje_cumplimiento numeric,
  margen_real numeric,
  margen_presupuestado numeric,
  utilidad_real numeric,
  utilidad_presupuestada numeric,
  estatus text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH suc AS (
    SELECT id, codigo, nombre FROM public.sucursales
    WHERE activo = true
      AND (p_sucursales IS NULL OR codigo = ANY(p_sucursales))
  ),
  ventas_diarias AS (
    SELECT
      v.fecha::date AS fecha,
      v.sucursal_id,
      SUM(vl.subtotal)::numeric AS venta_real,
      SUM(vl.subtotal - vl.cantidad * COALESCE(vl.costo_unitario, 0))::numeric AS utilidad_real
    FROM public.ventas v
    JOIN public.venta_lineas vl ON vl.venta_id = v.id
    WHERE v.estado = 'completada'
      AND EXTRACT(YEAR FROM v.fecha)::int = p_anio
      AND (p_mes IS NULL OR EXTRACT(MONTH FROM v.fecha)::int = p_mes)
      AND v.sucursal_id IN (SELECT id FROM suc)
    GROUP BY v.fecha::date, v.sucursal_id
  ),
  presup_diario AS (
    SELECT
      make_date(pv.anio, pv.mes, pv.dia)::date AS fecha,
      pv.sucursal_id,
      pv.venta_presupuestada,
      pv.margen_presupuestado,
      pv.utilidad_presupuestada
    FROM public.presupuesto_ventas pv
    WHERE pv.anio = p_anio
      AND (p_mes IS NULL OR pv.mes = p_mes)
      AND pv.dia IS NOT NULL
      AND pv.sucursal_id IN (SELECT id FROM suc)
  ),
  fechas_union AS (
    SELECT fecha, sucursal_id FROM ventas_diarias
    UNION
    SELECT fecha, sucursal_id FROM presup_diario
  )
  SELECT
    fu.fecha,
    s.id,
    s.codigo,
    s.nombre,
    COALESCE(vd.venta_real, 0)::numeric AS venta_real,
    COALESCE(pd.venta_presupuestada, 0)::numeric AS venta_presupuestada,
    (COALESCE(vd.venta_real, 0) - COALESCE(pd.venta_presupuestada, 0))::numeric AS diferencia,
    CASE WHEN COALESCE(pd.venta_presupuestada, 0) > 0
      THEN (COALESCE(vd.venta_real, 0) / pd.venta_presupuestada * 100)::numeric
      ELSE NULL
    END AS porcentaje_cumplimiento,
    CASE WHEN COALESCE(vd.venta_real, 0) > 0
      THEN (COALESCE(vd.utilidad_real, 0) / vd.venta_real * 100)::numeric
      ELSE NULL
    END AS margen_real,
    pd.margen_presupuestado,
    COALESCE(vd.utilidad_real, 0)::numeric,
    pd.utilidad_presupuestada,
    CASE
      WHEN COALESCE(pd.venta_presupuestada, 0) <= 0 THEN 'sin_meta'
      WHEN COALESCE(vd.venta_real, 0) / pd.venta_presupuestada >= 1.0 THEN 'verde'
      WHEN COALESCE(vd.venta_real, 0) / pd.venta_presupuestada >= 0.8 THEN 'amarillo'
      ELSE 'rojo'
    END AS estatus
  FROM fechas_union fu
  JOIN suc s ON s.id = fu.sucursal_id
  LEFT JOIN ventas_diarias vd ON vd.fecha = fu.fecha AND vd.sucursal_id = fu.sucursal_id
  LEFT JOIN presup_diario pd ON pd.fecha = fu.fecha AND pd.sucursal_id = fu.sucursal_id
  ORDER BY fu.fecha, s.codigo;
$$;