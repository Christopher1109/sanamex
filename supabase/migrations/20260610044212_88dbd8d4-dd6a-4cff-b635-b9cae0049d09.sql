
CREATE OR REPLACE FUNCTION public.productos_pendientes_compra(
  p_fecha_corte date DEFAULT NULL,
  p_sucursal_codigo text DEFAULT NULL,
  p_periodo_referencia integer DEFAULT 30
)
 RETURNS TABLE(producto_id uuid, clave text, descripcion text, clasificacion text, departamento text, cantidad_sugerida integer, ventas_periodo numeric, ddi_periodo numeric, comentario_resumen text, mejor_proveedor_id uuid, mejor_proveedor_nombre text, mejor_precio numeric, mejor_existencia integer, proveedores_disponibles integer, total_estimado numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fecha_efectiva date;
BEGIN
  IF p_fecha_corte IS NULL THEN
    SELECT MAX(fecha)::date INTO v_fecha_efectiva
    FROM ventas WHERE estado = 'completada';

    IF v_fecha_efectiva IS NULL OR v_fecha_efectiva > CURRENT_DATE - INTERVAL '7 days' THEN
      v_fecha_efectiva := CURRENT_DATE;
    END IF;
  ELSE
    v_fecha_efectiva := p_fecha_corte;
  END IF;

  RETURN QUERY
  WITH sugeridos AS (
    SELECT * FROM reporte_sugeridos(p_sucursal_codigo, v_fecha_efectiva, NULL, NULL, true) s
    WHERE
      CASE p_periodo_referencia
        WHEN 7 THEN s.sugerido_7 > 0
        WHEN 14 THEN s.sugerido_14 > 0
        WHEN 30 THEN s.sugerido_30 > 0
        ELSE s.sugerido_30 > 0
      END
      AND s.comentario_resumen = 'Comprar'
  ),
  mejor_prov AS (
    SELECT
      s.clave,
      r.proveedor_id,
      r.proveedor_nombre,
      r.precio_unitario,
      r.existencia_proveedor,
      r.ranking,
      COUNT(*) OVER (PARTITION BY s.clave) AS total_proveedores
    FROM sugeridos s
    LEFT JOIN LATERAL (
      SELECT * FROM recomendar_proveedor(
        (SELECT id FROM productos WHERE codigo_barras = s.clave LIMIT 1),
        (CASE p_periodo_referencia
          WHEN 7 THEN s.sugerido_7
          WHEN 14 THEN s.sugerido_14
          ELSE s.sugerido_30
        END)::int,
        v_fecha_efectiva
      )
    ) r ON true
  )
  SELECT
    p.id, s.clave, s.descripcion, s.clasificacion, s.departamento,
    (CASE p_periodo_referencia WHEN 7 THEN s.sugerido_7 WHEN 14 THEN s.sugerido_14 ELSE s.sugerido_30 END)::int,
    (CASE p_periodo_referencia WHEN 7 THEN s.ventas_7 WHEN 14 THEN s.ventas_14 ELSE s.ventas_30 END)::numeric,
    (CASE p_periodo_referencia WHEN 7 THEN s.ddi_7 WHEN 14 THEN s.ddi_14 ELSE s.ddi_30 END)::numeric,
    s.comentario_resumen,
    mpr.proveedor_id, mpr.proveedor_nombre, mpr.precio_unitario, mpr.existencia_proveedor,
    COALESCE(mpr.total_proveedores, 0)::int,
    (COALESCE(mpr.precio_unitario, 0) *
      (CASE p_periodo_referencia WHEN 7 THEN s.sugerido_7 WHEN 14 THEN s.sugerido_14 ELSE s.sugerido_30 END))::numeric
  FROM sugeridos s
  JOIN productos p ON p.codigo_barras = s.clave
  LEFT JOIN mejor_prov mpr ON mpr.clave = s.clave AND mpr.ranking = 1
  ORDER BY (COALESCE(mpr.precio_unitario, 0) *
      (CASE p_periodo_referencia WHEN 7 THEN s.sugerido_7 WHEN 14 THEN s.sugerido_14 ELSE s.sugerido_30 END)) DESC NULLS LAST;
END;
$function$;
