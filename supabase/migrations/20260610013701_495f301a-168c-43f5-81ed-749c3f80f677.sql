-- Drop pesos table (no longer used)
DROP TABLE IF EXISTS public.cotizador_pesos CASCADE;

-- Rewrite recomendar_proveedor: simple FILTER + SORT by price
DROP FUNCTION IF EXISTS public.recomendar_proveedor(uuid, integer, date);
DROP FUNCTION IF EXISTS public.recomendar_proveedor(uuid, integer);

CREATE OR REPLACE FUNCTION public.recomendar_proveedor(
  p_producto_id uuid,
  p_cantidad_requerida int,
  p_fecha date DEFAULT CURRENT_DATE
) RETURNS TABLE (
  proveedor_id uuid,
  proveedor_codigo text,
  proveedor_nombre text,
  precio_unitario numeric,
  precio_con_iva numeric,
  existencia_proveedor int,
  dias_credito int,
  lead_time_dias int,
  acepta_devoluciones boolean,
  pago_contra_entrega boolean,
  piezas_corrugado int,
  cantidad_sugerida int,
  monto_total numeric,
  con_oferta boolean,
  ranking int
) 
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ofertas_vigentes AS (
    SELECT 
      o.producto_id,
      o.proveedor_id,
      o.precio_oferta,
      o.cantidad_minima
    FROM ofertas_proveedor o
    WHERE o.activo = true
      AND p_fecha BETWEEN o.fecha_inicio AND o.fecha_fin
      AND o.producto_id = p_producto_id
  ),
  proveedores_filtrados AS (
    SELECT 
      pr.id AS prov_id,
      pr.codigo AS prov_cod,
      pr.nombre AS prov_nom,
      pr.dias_credito,
      pr.lead_time_prometido_dias AS lead_time,
      pr.acepta_devoluciones,
      pr.pago_contra_entrega,
      lpp.precio AS precio_base,
      lpp.existencia_proveedor,
      COALESCE(pc.piezas_por_corrugado, 1) AS corrugado,
      COALESCE(ov.precio_oferta, lpp.precio) AS precio_efectivo,
      (ov.precio_oferta IS NOT NULL) AS con_oferta
    FROM proveedores pr
    INNER JOIN lista_precio_proveedor lpp 
      ON lpp.proveedor_id = pr.id 
      AND lpp.producto_id = p_producto_id
      AND lpp.activo = true
      AND lpp.fecha_vigencia_desde <= p_fecha
      AND (lpp.fecha_vigencia_hasta IS NULL OR lpp.fecha_vigencia_hasta >= p_fecha)
    LEFT JOIN producto_corrugado pc 
      ON pc.producto_id = p_producto_id 
      AND (pc.proveedor_id = pr.id OR pc.proveedor_id IS NULL)
    LEFT JOIN ofertas_vigentes ov 
      ON ov.proveedor_id = pr.id
    WHERE pr.activo = true
      AND lpp.existencia_proveedor >= p_cantidad_requerida
  )
  SELECT 
    prov_id,
    prov_cod,
    prov_nom,
    precio_efectivo,
    (precio_efectivo * 1.16)::numeric,
    existencia_proveedor,
    dias_credito,
    lead_time,
    acepta_devoluciones,
    pago_contra_entrega,
    corrugado::int,
    (CEIL(p_cantidad_requerida::numeric / corrugado) * corrugado)::int,
    (CEIL(p_cantidad_requerida::numeric / corrugado) * corrugado * precio_efectivo)::numeric,
    con_oferta,
    ROW_NUMBER() OVER (ORDER BY precio_efectivo ASC)::int
  FROM proveedores_filtrados
  ORDER BY precio_efectivo ASC;
END;
$$;

-- New: productos_pendientes_compra
CREATE OR REPLACE FUNCTION public.productos_pendientes_compra(
  p_fecha_corte date DEFAULT NULL,
  p_sucursal_codigo text DEFAULT NULL,
  p_periodo_referencia int DEFAULT 30
) RETURNS TABLE (
  producto_id uuid,
  clave text,
  descripcion text,
  clasificacion text,
  departamento text,
  cantidad_sugerida int,
  ventas_periodo numeric,
  ddi_periodo numeric,
  comentario_resumen text,
  mejor_proveedor_id uuid,
  mejor_proveedor_nombre text,
  mejor_precio numeric,
  mejor_existencia int,
  proveedores_disponibles int,
  total_estimado numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fecha_efectiva date;
BEGIN
  IF p_fecha_corte IS NULL THEN
    SELECT GREATEST(COALESCE(MAX(fecha)::date, CURRENT_DATE), CURRENT_DATE) INTO v_fecha_efectiva
    FROM ventas WHERE estado = 'completada';
  ELSE
    v_fecha_efectiva := p_fecha_corte;
  END IF;
  
  RETURN QUERY
  WITH sugeridos AS (
    SELECT * FROM reporte_sugeridos(
      p_sucursal_codigo, 
      v_fecha_efectiva, 
      NULL, NULL, true
    ) s
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
    p.id,
    s.clave,
    s.descripcion,
    s.clasificacion,
    s.departamento,
    (CASE p_periodo_referencia
      WHEN 7 THEN s.sugerido_7
      WHEN 14 THEN s.sugerido_14
      ELSE s.sugerido_30
    END)::int,
    (CASE p_periodo_referencia
      WHEN 7 THEN s.ventas_7
      WHEN 14 THEN s.ventas_14
      ELSE s.ventas_30
    END)::numeric,
    (CASE p_periodo_referencia
      WHEN 7 THEN s.ddi_7
      WHEN 14 THEN s.ddi_14
      ELSE s.ddi_30
    END)::numeric,
    s.comentario_resumen,
    mpr.proveedor_id,
    mpr.proveedor_nombre,
    mpr.precio_unitario,
    mpr.existencia_proveedor,
    COALESCE(mpr.total_proveedores, 0)::int,
    (COALESCE(mpr.precio_unitario, 0) * 
      (CASE p_periodo_referencia
        WHEN 7 THEN s.sugerido_7
        WHEN 14 THEN s.sugerido_14
        ELSE s.sugerido_30
      END))::numeric
  FROM sugeridos s
  JOIN productos p ON p.codigo_barras = s.clave
  LEFT JOIN mejor_prov mpr 
    ON mpr.clave = s.clave 
    AND mpr.ranking = 1
  ORDER BY (COALESCE(mpr.precio_unitario, 0) * 
      (CASE p_periodo_referencia
        WHEN 7 THEN s.sugerido_7
        WHEN 14 THEN s.sugerido_14
        ELSE s.sugerido_30
      END)) DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recomendar_proveedor(uuid, int, date) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.productos_pendientes_compra(date, text, int) TO authenticated, anon, service_role;
