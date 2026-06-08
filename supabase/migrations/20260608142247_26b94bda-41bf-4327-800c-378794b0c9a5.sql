
-- 1. Add vendedor_id placeholder to ventas (for future normalization)
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS vendedor_id uuid NULL;

-- 2. Function: reporte_cortes_caja
CREATE OR REPLACE FUNCTION public.reporte_cortes_caja(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_sucursales text[] DEFAULT NULL
) RETURNS TABLE (
  fecha date,
  sucursal_id uuid,
  sucursal_codigo text,
  sucursal_nombre text,
  diferencia numeric,
  estado_alerta text,
  color text,
  mensaje text,
  observaciones text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    cc.fecha,
    s.id,
    s.codigo,
    s.nombre,
    COALESCE(cc.diferencia, 0)::numeric,
    CASE
      WHEN COALESCE(cc.diferencia,0) >= 10 THEN 'sobrante_alto'
      WHEN COALESCE(cc.diferencia,0) > 0   THEN 'sobrante_leve'
      WHEN COALESCE(cc.diferencia,0) = 0   THEN 'cuadrado'
      WHEN COALESCE(cc.diferencia,0) > -5  THEN 'faltante_leve'
      ELSE 'faltante_alto'
    END,
    CASE
      WHEN COALESCE(cc.diferencia,0) >= 10 THEN 'amarillo'
      WHEN COALESCE(cc.diferencia,0) > 0   THEN 'azul'
      WHEN COALESCE(cc.diferencia,0) = 0   THEN 'verde'
      WHEN COALESCE(cc.diferencia,0) > -5  THEN 'naranja'
      ELSE 'rojo'
    END,
    CASE
      WHEN COALESCE(cc.diferencia,0) >= 10 THEN 'Tener sobrantes no es bueno'
      WHEN COALESCE(cc.diferencia,0) > 0   THEN 'Variación en cambio'
      WHEN COALESCE(cc.diferencia,0) = 0   THEN 'Corte cuadrado'
      WHEN COALESCE(cc.diferencia,0) > -5  THEN 'Variación en cambio'
      ELSE 'Preocupación cambio'
    END,
    cc.notas
  FROM public.cortes_caja cc
  JOIN public.sucursales s ON s.id = cc.sucursal_id
  WHERE cc.fecha BETWEEN p_fecha_desde AND p_fecha_hasta
    AND (p_sucursales IS NULL OR s.codigo = ANY(p_sucursales))
  ORDER BY cc.fecha DESC, s.codigo;
$$;

-- 3. Function: reporte_productividad_vendedores
CREATE OR REPLACE FUNCTION public.reporte_productividad_vendedores(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_sucursales text[] DEFAULT NULL
) RETURNS TABLE (
  vendedor text,
  sucursal_codigo text,
  num_tickets int,
  venta_total numeric,
  ticket_promedio numeric,
  utilidad_total numeric,
  margen_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT
      COALESCE(NULLIF(TRIM(v.vendedor_libre), ''), 'Sin asignar') AS vendedor,
      s.codigo AS sucursal_codigo,
      v.id AS venta_id,
      vl.subtotal,
      vl.cantidad * COALESCE(vl.costo_unitario, 0) AS costo_linea
    FROM public.ventas v
    JOIN public.venta_lineas vl ON vl.venta_id = v.id
    JOIN public.sucursales s ON s.id = v.sucursal_id
    WHERE v.estado = 'completada'
      AND v.fecha::date >= p_fecha_desde
      AND v.fecha::date <= p_fecha_hasta
      AND (p_sucursales IS NULL OR s.codigo = ANY(p_sucursales))
  )
  SELECT
    vendedor,
    sucursal_codigo,
    COUNT(DISTINCT venta_id)::int,
    SUM(subtotal)::numeric,
    (SUM(subtotal) / NULLIF(COUNT(DISTINCT venta_id),0))::numeric,
    (SUM(subtotal) - SUM(costo_linea))::numeric,
    CASE WHEN SUM(subtotal) > 0
      THEN ((SUM(subtotal) - SUM(costo_linea)) / SUM(subtotal) * 100)::numeric
      ELSE 0 END
  FROM base
  GROUP BY vendedor, sucursal_codigo
  ORDER BY SUM(subtotal) DESC;
$$;

-- 4. Permissive RLS for capture: allow admin/super_admin/gerente/subgerente to insert/update cortes_caja
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cortes_caja' AND policyname='cortes_admin_gerente_write') THEN
    CREATE POLICY cortes_admin_gerente_write ON public.cortes_caja
      FOR ALL TO authenticated
      USING (
        public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
        OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'subgerente')
      )
      WITH CHECK (
        public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
        OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'subgerente')
      );
  END IF;
END $$;
