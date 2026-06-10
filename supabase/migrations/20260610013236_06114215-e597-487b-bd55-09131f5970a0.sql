
CREATE OR REPLACE FUNCTION public.recomendar_proveedor(
  p_producto_id uuid, p_cantidad_requerida int, p_fecha date DEFAULT CURRENT_DATE
) RETURNS TABLE (
  proveedor_id uuid, proveedor_codigo text, proveedor_nombre text,
  precio_unitario numeric, precio_con_iva numeric, existencia_proveedor int,
  dias_credito int, lead_time_dias int, acepta_devoluciones boolean, pago_contra_entrega boolean,
  piezas_corrugado int, cantidad_sugerida int, cantidad_disponible int,
  monto_total numeric, con_oferta boolean, score numeric, ranking int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pp numeric; v_pe numeric; v_pc numeric; v_pl numeric; v_pd numeric;
BEGIN
  SELECT peso_precio, peso_existencia, peso_credito, peso_lead_time, peso_devoluciones
    INTO v_pp, v_pe, v_pc, v_pl, v_pd
  FROM cotizador_pesos WHERE activo = true ORDER BY updated_at DESC LIMIT 1;
  v_pp := COALESCE(v_pp,0.40); v_pe := COALESCE(v_pe,0.25); v_pc := COALESCE(v_pc,0.15);
  v_pl := COALESCE(v_pl,0.10); v_pd := COALESCE(v_pd,0.10);

  RETURN QUERY
  WITH pcp AS (
    SELECT pr.id AS x_prov_id,
      COALESCE(pr.codigo, SUBSTRING(pr.id::text,1,8)) AS x_prov_cod,
      pr.nombre AS x_prov_nom,
      COALESCE(pr.plazo_pago_dias,0) AS x_dias_credito,
      COALESCE(pr.lead_time_prometido_dias,0) AS x_lead_time,
      COALESCE(pr.acepta_devoluciones,false) AS x_acepta_devoluciones,
      COALESCE(pr.pago_contra_entrega,false) AS x_pago_contra_entrega,
      lpp.precio AS x_precio,
      COALESCE(lpp.existencia_proveedor,0) AS x_existencia,
      COALESCE(pc.piezas_por_corrugado,1) AS x_corrugado,
      ofr.precio_oferta AS x_precio_oferta,
      (ofr.id IS NOT NULL) AS x_con_oferta
    FROM proveedores pr
    INNER JOIN lista_precio_proveedor lpp
      ON lpp.proveedor_id = pr.id AND lpp.producto_id = p_producto_id AND lpp.activo = true
      AND lpp.fecha_vigencia_desde <= p_fecha
      AND (lpp.fecha_vigencia_hasta IS NULL OR lpp.fecha_vigencia_hasta >= p_fecha)
    LEFT JOIN producto_corrugado pc
      ON pc.producto_id = p_producto_id AND (pc.proveedor_id = pr.id OR pc.proveedor_id IS NULL)
    LEFT JOIN ofertas_proveedor ofr
      ON ofr.proveedor_id = pr.id AND ofr.producto_id = p_producto_id AND ofr.activo = true
      AND p_fecha BETWEEN ofr.fecha_inicio AND ofr.fecha_fin
    WHERE pr.activo = true
  ),
  con_scores AS (
    SELECT *,
      COALESCE(x_precio_oferta, x_precio) AS x_precio_efectivo,
      CEIL(p_cantidad_requerida::numeric / NULLIF(x_corrugado,0)) * x_corrugado AS x_cant_corrugado,
      LEAST(CEIL(p_cantidad_requerida::numeric / NULLIF(x_corrugado,0)) * x_corrugado, x_existencia) AS x_cant_disp,
      CASE WHEN COALESCE(x_precio_oferta, x_precio) = 0 THEN 0 ELSE 1.0 / COALESCE(x_precio_oferta, x_precio) END AS x_score_precio,
      CASE WHEN x_existencia >= p_cantidad_requerida THEN 1.0
           WHEN x_existencia = 0 THEN 0
           ELSE x_existencia::numeric / p_cantidad_requerida END AS x_score_existencia,
      LEAST(x_dias_credito,60)::numeric / 60 AS x_score_credito,
      GREATEST(0, (30 - x_lead_time)::numeric / 30) AS x_score_lead,
      CASE WHEN x_acepta_devoluciones THEN 1.0 ELSE 0.5 END AS x_score_dev
    FROM pcp
  ),
  normalizados AS (
    SELECT *,
      CASE WHEN MAX(x_score_precio) OVER () = MIN(x_score_precio) OVER () THEN 1.0
           ELSE (x_score_precio - MIN(x_score_precio) OVER ()) /
                NULLIF(MAX(x_score_precio) OVER () - MIN(x_score_precio) OVER (),0)
      END AS x_sp_norm
    FROM con_scores
  )
  SELECT n.x_prov_id, n.x_prov_cod, n.x_prov_nom,
    n.x_precio_efectivo, (n.x_precio_efectivo * 1.16)::numeric,
    n.x_existencia, n.x_dias_credito, n.x_lead_time,
    n.x_acepta_devoluciones, n.x_pago_contra_entrega,
    n.x_corrugado::int, n.x_cant_corrugado::int, n.x_cant_disp::int,
    (n.x_cant_corrugado * n.x_precio_efectivo)::numeric, n.x_con_oferta,
    ROUND((COALESCE(n.x_sp_norm,1)*v_pp + n.x_score_existencia*v_pe + n.x_score_credito*v_pc + n.x_score_lead*v_pl + n.x_score_dev*v_pd) * 100, 2),
    ROW_NUMBER() OVER (ORDER BY (COALESCE(n.x_sp_norm,1)*v_pp + n.x_score_existencia*v_pe + n.x_score_credito*v_pc + n.x_score_lead*v_pl + n.x_score_dev*v_pd) DESC)::int
  FROM normalizados n;
END; $$;
