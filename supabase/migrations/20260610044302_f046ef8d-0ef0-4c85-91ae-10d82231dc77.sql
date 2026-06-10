
CREATE OR REPLACE FUNCTION public.recomendar_proveedor(
  p_producto_id uuid, p_cantidad_requerida integer, p_fecha date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  proveedor_id uuid, proveedor_codigo text, proveedor_nombre text,
  precio_unitario numeric, precio_con_iva numeric, existencia_proveedor integer,
  dias_credito integer, lead_time_dias integer,
  acepta_devoluciones boolean, pago_contra_entrega boolean,
  piezas_corrugado integer, cantidad_sugerida integer, monto_total numeric,
  con_oferta boolean, ranking integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH ofertas_vigentes AS (
    SELECT o.producto_id, o.proveedor_id, o.precio_oferta, o.cantidad_minima
    FROM ofertas_proveedor o
    WHERE o.activo = true
      AND p_fecha BETWEEN o.fecha_inicio AND o.fecha_fin
      AND o.producto_id = p_producto_id
  ),
  proveedores_filtrados AS (
    SELECT
      pr.id AS prov_id, pr.codigo AS prov_cod, pr.nombre AS prov_nom,
      COALESCE(pr.plazo_pago_dias, 0) AS dias_credito,
      pr.lead_time_prometido_dias AS lead_time,
      pr.acepta_devoluciones, pr.pago_contra_entrega,
      lpp.precio AS precio_base, lpp.existencia_proveedor,
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
    LEFT JOIN ofertas_vigentes ov ON ov.proveedor_id = pr.id
    WHERE pr.activo = true
      AND lpp.existencia_proveedor >= p_cantidad_requerida
  )
  SELECT
    prov_id, prov_cod, prov_nom,
    precio_efectivo, (precio_efectivo * 1.16)::numeric, existencia_proveedor,
    dias_credito, lead_time, acepta_devoluciones, pago_contra_entrega,
    corrugado::int,
    (CEIL(p_cantidad_requerida::numeric / corrugado) * corrugado)::int,
    (CEIL(p_cantidad_requerida::numeric / corrugado) * corrugado * precio_efectivo)::numeric,
    con_oferta,
    ROW_NUMBER() OVER (ORDER BY precio_efectivo ASC)::int
  FROM proveedores_filtrados
  ORDER BY precio_efectivo ASC;
END;
$$;
