CREATE OR REPLACE FUNCTION public.reporte_productividad_pivote(
  p_anio int,
  p_mes int,
  p_metrica text DEFAULT 'tickets',
  p_sucursales text[] DEFAULT NULL
) RETURNS TABLE (
  sucursal_codigo text,
  vendedor text,
  dia int,
  valor numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.codigo::text AS sucursal_codigo,
    COALESCE(NULLIF(TRIM(v.vendedor_libre), ''), 'Sin asignar')::text AS vendedor,
    EXTRACT(DAY FROM v.fecha)::int AS dia,
    CASE
      WHEN p_metrica = 'tickets' THEN COUNT(DISTINCT v.id)::numeric
      WHEN p_metrica = 'venta'   THEN COALESCE(SUM(v.total), 0)::numeric
      ELSE 0::numeric
    END AS valor
  FROM ventas v
  JOIN sucursales s ON s.id = v.sucursal_id
  WHERE v.estado = 'completada'
    AND EXTRACT(YEAR  FROM v.fecha)::int = p_anio
    AND EXTRACT(MONTH FROM v.fecha)::int = p_mes
    AND (p_sucursales IS NULL OR s.codigo = ANY(p_sucursales))
  GROUP BY s.codigo, COALESCE(NULLIF(TRIM(v.vendedor_libre), ''), 'Sin asignar'), EXTRACT(DAY FROM v.fecha)
  ORDER BY s.codigo, vendedor, dia;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reporte_productividad_pivote(int, int, text, text[]) TO authenticated, service_role;