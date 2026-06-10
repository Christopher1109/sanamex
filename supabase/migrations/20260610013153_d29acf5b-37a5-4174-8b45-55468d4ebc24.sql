
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
    SELECT pr.id AS prov_id,
      COALESCE(pr.codigo, SUBSTRING(pr.id::text,1,8)) AS prov_cod,
      pr.nombre AS prov_nom,
      COALESCE(pr.plazo_pago_dias,0) AS dias_credito,
      COALESCE(pr.lead_time_prometido_dias,0) AS lead_time,
      COALESCE(pr.acepta_devoluciones,false) AS acepta_devoluciones,
      COALESCE(pr.pago_contra_entrega,false) AS pago_contra_entrega,
      lpp.precio,
      COALESCE(lpp.existencia_proveedor,0) AS existencia_proveedor,
      COALESCE(pc.piezas_por_corrugado,1) AS corrugado,
      ofr.precio_oferta, (ofr.id IS NOT NULL) AS con_oferta
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
      COALESCE(precio_oferta, precio) AS precio_efectivo,
      CEIL(p_cantidad_requerida::numeric / NULLIF(corrugado,0)) * corrugado AS cant_corrugado,
      LEAST(CEIL(p_cantidad_requerida::numeric / NULLIF(corrugado,0)) * corrugado, existencia_proveedor) AS cant_disp,
      CASE WHEN COALESCE(precio_oferta, precio) = 0 THEN 0 ELSE 1.0 / COALESCE(precio_oferta, precio) END AS score_precio,
      CASE WHEN existencia_proveedor >= p_cantidad_requerida THEN 1.0
           WHEN existencia_proveedor = 0 THEN 0
           ELSE existencia_proveedor::numeric / p_cantidad_requerida END AS score_existencia,
      LEAST(dias_credito,60)::numeric / 60 AS score_credito,
      GREATEST(0, (30 - lead_time)::numeric / 30) AS score_lead,
      CASE WHEN acepta_devoluciones THEN 1.0 ELSE 0.5 END AS score_dev
    FROM pcp
  ),
  normalizados AS (
    SELECT *,
      CASE WHEN MAX(score_precio) OVER () = MIN(score_precio) OVER () THEN 1.0
           ELSE (score_precio - MIN(score_precio) OVER ()) /
                NULLIF(MAX(score_precio) OVER () - MIN(score_precio) OVER (),0)
      END AS sp_norm
    FROM con_scores
  )
  SELECT n.prov_id, n.prov_cod, n.prov_nom,
    n.precio_efectivo, (n.precio_efectivo * 1.16)::numeric,
    n.existencia_proveedor, n.dias_credito, n.lead_time,
    n.acepta_devoluciones, n.pago_contra_entrega,
    n.corrugado::int, n.cant_corrugado::int, n.cant_disp::int,
    (n.cant_corrugado * n.precio_efectivo)::numeric, n.con_oferta,
    ROUND((COALESCE(n.sp_norm,1)*v_pp + n.score_existencia*v_pe + n.score_credito*v_pc + n.score_lead*v_pl + n.score_dev*v_pd) * 100, 2),
    ROW_NUMBER() OVER (ORDER BY (COALESCE(n.sp_norm,1)*v_pp + n.score_existencia*v_pe + n.score_credito*v_pc + n.score_lead*v_pl + n.score_dev*v_pd) DESC)::int
  FROM normalizados n;
END; $$;
