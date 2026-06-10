
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
      COALESCE(pr.plazo_pago_dias, 0) AS v_dias_credito,
      pr.lead_time_prometido_dias AS v_lead_time,
      pr.acepta_devoluciones AS v_acepta_dev, pr.pago_contra_entrega AS v_pago_ce,
      lpp.precio AS v_precio_base, lpp.existencia_proveedor AS v_existencia,
      COALESCE(pc.piezas_por_corrugado, 1) AS v_corrugado,
      COALESCE(ov.precio_oferta, lpp.precio) AS v_precio_efectivo,
      (ov.precio_oferta IS NOT NULL) AS v_con_oferta
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
    pf.prov_id, pf.prov_cod, pf.prov_nom,
    pf.v_precio_efectivo, (pf.v_precio_efectivo * 1.16)::numeric, pf.v_existencia,
    pf.v_dias_credito, pf.v_lead_time, pf.v_acepta_dev, pf.v_pago_ce,
    pf.v_corrugado::int,
    (CEIL(p_cantidad_requerida::numeric / pf.v_corrugado) * pf.v_corrugado)::int,
    (CEIL(p_cantidad_requerida::numeric / pf.v_corrugado) * pf.v_corrugado * pf.v_precio_efectivo)::numeric,
    pf.v_con_oferta,
    ROW_NUMBER() OVER (ORDER BY pf.v_precio_efectivo ASC)::int
  FROM proveedores_filtrados pf
  ORDER BY pf.v_precio_efectivo ASC;
END;
$$;
