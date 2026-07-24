
-- 1. Extend cotizador_snapshot with all Excel columns
CREATE OR REPLACE FUNCTION public.cotizador_snapshot(
  p_incluir_sin_lista boolean DEFAULT false,
  p_excluir_estatus_e boolean DEFAULT true,
  p_solo_con_faltante boolean DEFAULT false,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_factor_abc numeric := 1.3;
  v_divisor numeric := 1.25;
  v_peso_precio numeric := 0.4;
  v_peso_entrega numeric := 0.6;
  v_result jsonb;
  v_cedis_id uuid;
BEGIN
  IF NOT (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sin permiso para el cotizador';
  END IF;

  SELECT valor INTO v_factor_abc   FROM cotizador_params WHERE parametro='factor_abc';
  SELECT valor INTO v_divisor      FROM cotizador_params WHERE parametro='divisor_otros';
  SELECT valor INTO v_peso_precio  FROM cotizador_params WHERE parametro='peso_precio';
  SELECT valor INTO v_peso_entrega FROM cotizador_params WHERE parametro='peso_entrega';

  SELECT id INTO v_cedis_id FROM sucursales WHERE es_cedis = true AND activo = true ORDER BY codigo LIMIT 1;

  WITH prods AS (
    SELECT p.*
    FROM productos p
    WHERE p.activo = true
      AND (NOT p_excluir_estatus_e OR COALESCE(p.estatus,'') <> 'E')
      AND (p_incluir_sin_lista OR p.sin_lista_regular = false)
      AND (p_search IS NULL OR (
        p.sku ILIKE '%'||p_search||'%'
        OR p.nombre ILIKE '%'||p_search||'%'
        OR COALESCE(p.codigo_barras,'') ILIKE '%'||p_search||'%'
      ))
    ORDER BY p.nombre
    LIMIT p_limit OFFSET p_offset
  ),
  suc AS (SELECT id, codigo, nombre, es_cedis FROM sucursales WHERE activo = true),
  exist AS (
    SELECT e.producto_id, e.sucursal_id, e.existencia FROM v_existencia_producto_sucursal e
    WHERE e.producto_id IN (SELECT id FROM prods)
  ),
  ventas30 AS (
    SELECT v.producto_id, v.sucursal_id, v.unidades, v.unidades_dia_anterior, COALESCE(v.unidades_periodo_anterior,0) AS unidades_periodo_anterior
    FROM v_ventas_30d v WHERE v.producto_id IN (SELECT id FROM prods)
  ),
  transito AS (
    SELECT t.producto_id, t.sucursal_id, t.piezas_transito FROM v_transito_abierto t
    WHERE t.producto_id IN (SELECT id FROM prods)
  ),
  estatus_suc AS (
    SELECT es.producto_id, es.sucursal_id, es.estatus
    FROM producto_sucursal_estatus es
    WHERE es.producto_id IN (SELECT id FROM prods)
  ),
  precios AS (
    SELECT
      lpp.producto_id, lpp.proveedor_id,
      COALESCE(lpp.precio_con_iva, lpp.precio) AS precio_cmp,
      lpp.precio AS precio_bruto,
      lpp.existencia_proveedor,
      pr.nombre AS proveedor_nombre,
      pr.codigo AS proveedor_codigo,
      COALESCE(pr.dias_entrega, 99) AS dias_entrega,
      pr.entrega_por_sucursal,
      pr.tiene_lista_regular,
      EXISTS (
        SELECT 1 FROM ofertas_proveedor o
        WHERE o.producto_id = lpp.producto_id AND o.proveedor_id = lpp.proveedor_id
          AND o.activo = true AND CURRENT_DATE BETWEEN o.fecha_inicio AND COALESCE(o.fecha_fin, CURRENT_DATE)
      ) AS con_oferta
    FROM lista_precio_proveedor lpp
    JOIN proveedores pr ON pr.id = lpp.proveedor_id
    WHERE lpp.activo = true
      AND lpp.producto_id IN (SELECT id FROM prods)
      AND pr.activo = true
      AND (lpp.fecha_vigencia_hasta IS NULL OR lpp.fecha_vigencia_hasta >= CURRENT_DATE)
  ),
  precios_competencia AS (
    SELECT * FROM precios WHERE existencia_proveedor > 0 AND tiene_lista_regular = true
  ),
  precios_score AS (
    SELECT p.*,
      row_number() OVER (
        PARTITION BY producto_id
        ORDER BY (
          v_peso_precio * (CASE WHEN MAX(precio_cmp) OVER (PARTITION BY producto_id) = MIN(precio_cmp) OVER (PARTITION BY producto_id) THEN 0
            ELSE (precio_cmp - MIN(precio_cmp) OVER (PARTITION BY producto_id))
                 / NULLIF(MAX(precio_cmp) OVER (PARTITION BY producto_id) - MIN(precio_cmp) OVER (PARTITION BY producto_id), 0) END)
          + v_peso_entrega * (CASE WHEN MAX(dias_entrega) OVER (PARTITION BY producto_id) = MIN(dias_entrega) OVER (PARTITION BY producto_id) THEN 0
            ELSE (dias_entrega - MIN(dias_entrega) OVER (PARTITION BY producto_id))::numeric
                 / NULLIF(MAX(dias_entrega) OVER (PARTITION BY producto_id) - MIN(dias_entrega) OVER (PARTITION BY producto_id), 0) END)
        ) ASC, precio_cmp ASC
      ) AS rank
    FROM precios_competencia p
  ),
  ultimo_costo AS (
    SELECT DISTINCT ON (l.producto_id) l.producto_id, l.costo_unitario, l.created_at
    FROM lotes l
    WHERE l.producto_id IN (SELECT id FROM prods)
    ORDER BY l.producto_id, l.created_at DESC
  ),
  corrugado AS (
    SELECT c.producto_id, c.proveedor_id, c.piezas_por_corrugado
    FROM producto_corrugado c
    WHERE c.producto_id IN (SELECT id FROM prods)
  ),
  producto_agg AS (
    SELECT
      p.id AS producto_id,
      p.sku, p.nombre, p.descripcion, p.codigo_barras,
      p.clasificacion, p.estatus, p.iva_tasa, p.ieps, p.iva_incluido,
      p.sin_lista_regular,
      COALESCE((SELECT SUM(existencia) FROM exist e2 WHERE e2.producto_id = p.id), 0)::integer AS exist_sucursales,
      COALESCE((SELECT SUM(i.cantidad) FROM inventario i JOIN lotes l ON l.id=i.lote_id WHERE l.producto_id=p.id), 0)::integer AS exist_total,
      COALESCE((SELECT existencia FROM exist e3 WHERE e3.producto_id = p.id AND e3.sucursal_id = v_cedis_id), 0)::integer AS exist_cedis,
      COALESCE((SELECT SUM(unidades) FROM ventas30 v2 WHERE v2.producto_id=p.id), 0)::numeric AS ult30_total,
      COALESCE((SELECT SUM(unidades_periodo_anterior) FROM ventas30 v4 WHERE v4.producto_id=p.id), 0)::numeric AS periodo_anterior_total,
      COALESCE((SELECT SUM(unidades_dia_anterior) FROM ventas30 v3 WHERE v3.producto_id=p.id), 0)::numeric AS venta_dia_anterior,
      (SELECT costo_unitario FROM ultimo_costo uc WHERE uc.producto_id = p.id) AS ultimo_precio_compra,
      (SELECT jsonb_build_object('proveedor_id', ps.proveedor_id, 'proveedor_nombre', ps.proveedor_nombre, 'proveedor_codigo', ps.proveedor_codigo,
          'precio', ps.precio_cmp, 'precio_bruto', ps.precio_bruto, 'existencia', ps.existencia_proveedor,
          'dias_entrega', ps.dias_entrega, 'entrega_por_sucursal', ps.entrega_por_sucursal, 'con_oferta', ps.con_oferta)
       FROM precios_score ps WHERE ps.producto_id = p.id AND ps.rank = 1) AS ganador,
      (SELECT jsonb_build_object('proveedor_id', ps.proveedor_id, 'proveedor_nombre', ps.proveedor_nombre,
          'precio', ps.precio_cmp, 'existencia', ps.existencia_proveedor, 'dias_entrega', ps.dias_entrega, 'con_oferta', ps.con_oferta)
       FROM precios_score ps WHERE ps.producto_id = p.id AND ps.rank = 2) AS postor_2,
      (SELECT jsonb_build_object('proveedor_id', ps.proveedor_id, 'proveedor_nombre', ps.proveedor_nombre,
          'precio', ps.precio_cmp, 'existencia', ps.existencia_proveedor, 'dias_entrega', ps.dias_entrega, 'con_oferta', ps.con_oferta)
       FROM precios_score ps WHERE ps.producto_id = p.id AND ps.rank = 3) AS postor_3,
      (SELECT jsonb_agg(jsonb_build_object(
          'proveedor_id', pp.proveedor_id, 'proveedor_nombre', pp.proveedor_nombre, 'proveedor_codigo', pp.proveedor_codigo,
          'precio', pp.precio_cmp, 'existencia', pp.existencia_proveedor,
          'dias_entrega', pp.dias_entrega, 'con_oferta', pp.con_oferta,
          'sin_lista_regular', NOT pp.tiene_lista_regular
        ) ORDER BY (pp.existencia_proveedor > 0) DESC, pp.precio_cmp ASC)
       FROM precios pp WHERE pp.producto_id = p.id) AS todos_proveedores,
      (SELECT piezas_por_corrugado FROM corrugado c WHERE c.producto_id = p.id ORDER BY (c.proveedor_id IS NULL) ASC LIMIT 1) AS piezas_corrugado_global
    FROM prods p
  )
  SELECT jsonb_build_object(
    'sucursales', (SELECT jsonb_agg(jsonb_build_object('id', id, 'codigo', codigo, 'nombre', nombre, 'es_cedis', es_cedis) ORDER BY codigo) FROM suc),
    'productos', (
      SELECT COALESCE(jsonb_agg(fila ORDER BY (fila->>'nombre')), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'producto_id', pa.producto_id,
          'sku', pa.sku, 'nombre', pa.nombre, 'descripcion', pa.descripcion,
          'codigo_barras', pa.codigo_barras, 'clasificacion', pa.clasificacion,
          'estatus', pa.estatus, 'iva_tasa', pa.iva_tasa, 'ieps', pa.ieps,
          'iva_incluido', pa.iva_incluido, 'sin_lista_regular', pa.sin_lista_regular,
          'exist_total', pa.exist_total, 'exist_sucursales', pa.exist_sucursales, 'exist_cedis', pa.exist_cedis,
          'transito_global', GREATEST(pa.exist_total - pa.exist_sucursales, 0),
          'ult30_total', pa.ult30_total,
          'periodo_anterior_total', pa.periodo_anterior_total,
          'tendencia_abs', pa.ult30_total - pa.periodo_anterior_total,
          'tendencia_pct', CASE WHEN pa.periodo_anterior_total > 0
            THEN ROUND((pa.ult30_total - pa.periodo_anterior_total) / pa.periodo_anterior_total * 100, 1)
            ELSE NULL END,
          'ddi', CASE WHEN pa.ult30_total > 0 THEN ROUND(pa.exist_total::numeric / pa.ult30_total * 30, 1) ELSE NULL END,
          'venta_dia_anterior', pa.venta_dia_anterior,
          'ultimo_precio_compra', pa.ultimo_precio_compra,
          'mejor_precio', (pa.ganador->>'precio')::numeric,
          'variacion_precio_abs', COALESCE((pa.ganador->>'precio')::numeric - pa.ultimo_precio_compra, 0),
          'variacion_precio_pct', CASE WHEN pa.ultimo_precio_compra IS NULL OR pa.ultimo_precio_compra = 0 THEN NULL
             ELSE ROUND(((pa.ganador->>'precio')::numeric - pa.ultimo_precio_compra) / pa.ultimo_precio_compra * 100, 2) END,
          'ganador', pa.ganador, 'postor_2', pa.postor_2, 'postor_3', pa.postor_3,
          'todos_proveedores', COALESCE(pa.todos_proveedores, '[]'::jsonb),
          'piezas_corrugado', COALESCE(
            (SELECT piezas_por_corrugado FROM corrugado c
              WHERE c.producto_id=pa.producto_id AND c.proveedor_id = (pa.ganador->>'proveedor_id')::uuid LIMIT 1),
            pa.piezas_corrugado_global),
          'caja_cerrada', COALESCE(
            (SELECT piezas_por_corrugado > 1 FROM corrugado c
              WHERE c.producto_id=pa.producto_id AND c.proveedor_id = (pa.ganador->>'proveedor_id')::uuid LIMIT 1),
            pa.piezas_corrugado_global > 1, false),
          'alerta_oferta', EXISTS (
            SELECT 1 FROM ofertas_proveedor o
            WHERE o.producto_id = pa.producto_id AND o.activo = true
              AND CURRENT_DATE BETWEEN o.fecha_inicio AND COALESCE(o.fecha_fin, CURRENT_DATE)
              AND (pa.ganador->>'precio')::numeric > o.precio_oferta),
          'sucursales', (
            SELECT jsonb_object_agg(s.codigo, jsonb_build_object(
              'sucursal_id', s.id,
              'existencia', COALESCE((SELECT existencia FROM exist e WHERE e.producto_id=pa.producto_id AND e.sucursal_id=s.id), 0),
              'ult30', COALESCE((SELECT unidades FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s.id), 0),
              'ult30_dia_anterior', COALESCE((SELECT unidades_dia_anterior FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s.id), 0),
              'transito', COALESCE((SELECT piezas_transito FROM transito t WHERE t.producto_id=pa.producto_id AND t.sucursal_id=s.id), 0),
              'estatus', (SELECT estatus FROM estatus_suc es WHERE es.producto_id=pa.producto_id AND es.sucursal_id=s.id LIMIT 1),
              'necesidad', ROUND(
                CASE WHEN pa.clasificacion IN ('A','B','C')
                     THEN COALESCE((SELECT unidades FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s.id),0) * v_factor_abc
                     ELSE COALESCE((SELECT unidades FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s.id),0) / v_divisor
                END, 0),
              'dif', ROUND(
                CASE WHEN pa.clasificacion IN ('A','B','C')
                     THEN COALESCE((SELECT unidades FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s.id),0) * v_factor_abc
                     ELSE COALESCE((SELECT unidades FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s.id),0) / v_divisor
                END - COALESCE((SELECT existencia FROM exist e WHERE e.producto_id=pa.producto_id AND e.sucursal_id=s.id),0), 0)
              ))
            FROM suc s WHERE s.es_cedis = false)
        ) AS fila
        FROM producto_agg pa
        WHERE (NOT p_solo_con_faltante) OR EXISTS (
          SELECT 1 FROM suc s2 WHERE s2.es_cedis = false
            AND ((CASE WHEN pa.clasificacion IN ('A','B','C')
                 THEN COALESCE((SELECT unidades FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s2.id),0) * v_factor_abc
                 ELSE COALESCE((SELECT unidades FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s2.id),0) / v_divisor END)
                - COALESCE((SELECT existencia FROM exist e WHERE e.producto_id=pa.producto_id AND e.sucursal_id=s2.id),0)) > 0)
      ) sub
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- 2. Add "unidades_periodo_anterior" to v_ventas_30d if it doesn't yet exist
--    Rebuild the view idempotently.
DROP VIEW IF EXISTS public.v_ventas_30d CASCADE;
CREATE VIEW public.v_ventas_30d
WITH (security_invoker=true) AS
WITH periodo AS (
  SELECT (CURRENT_DATE - INTERVAL '30 days')::date AS ini_30, CURRENT_DATE AS fin_30,
         (CURRENT_DATE - INTERVAL '60 days')::date AS ini_prev, (CURRENT_DATE - INTERVAL '30 days')::date AS fin_prev,
         (CURRENT_DATE - INTERVAL '1 day')::date AS dia_anterior
),
vl AS (
  SELECT vl.producto_id, v.sucursal_id, v.fecha::date AS fecha, vl.cantidad
  FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id
  WHERE v.estado = 'completada'
    AND v.fecha >= (CURRENT_DATE - INTERVAL '60 days')
),
hist AS (
  SELECT p.id AS producto_id, vh.sucursal_id, vh.fecha, vh.cantidad
  FROM ventas_historicas vh
  JOIN productos p ON p.sku = vh.producto_sku
  WHERE vh.fecha >= (CURRENT_DATE - INTERVAL '60 days')
),
unioned AS (
  SELECT * FROM vl
  UNION ALL
  SELECT * FROM hist
)
SELECT
  u.producto_id, u.sucursal_id,
  SUM(CASE WHEN u.fecha >= (SELECT ini_30 FROM periodo) THEN u.cantidad ELSE 0 END)::numeric AS unidades,
  SUM(CASE WHEN u.fecha = (SELECT dia_anterior FROM periodo) THEN u.cantidad ELSE 0 END)::numeric AS unidades_dia_anterior,
  SUM(CASE WHEN u.fecha >= (SELECT ini_prev FROM periodo) AND u.fecha < (SELECT fin_prev FROM periodo) THEN u.cantidad ELSE 0 END)::numeric AS unidades_periodo_anterior
FROM unioned u
GROUP BY u.producto_id, u.sucursal_id;

-- 3. RPC: OC abiertas por producto (opcionalmente filtrado)
CREATE OR REPLACE FUNCTION public.cotizador_oc_abiertas(p_producto_id uuid DEFAULT NULL)
RETURNS TABLE(
  producto_id uuid,
  sucursal_id uuid,
  sucursal_codigo text,
  proveedor_id uuid,
  proveedor_nombre text,
  folio text,
  estado text,
  piezas_solicitadas integer,
  piezas_pendientes integer,
  fecha_creacion date
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    ocl.producto_id,
    oc.sucursal_destino_id AS sucursal_id,
    s.codigo AS sucursal_codigo,
    oc.proveedor_id,
    pr.nombre AS proveedor_nombre,
    oc.folio,
    oc.estado,
    ocl.cantidad_solicitada,
    GREATEST(ocl.cantidad_solicitada - ocl.cantidad_recibida, 0) AS piezas_pendientes,
    oc.fecha_creacion
  FROM orden_compra_lineas ocl
  JOIN ordenes_compra oc ON oc.id = ocl.orden_id
  LEFT JOIN sucursales s ON s.id = oc.sucursal_destino_id
  JOIN proveedores pr ON pr.id = oc.proveedor_id
  WHERE oc.estado IN ('borrador','pendiente_aprobacion','aprobada','enviada','recibida_parcial','pedida')
    AND (p_producto_id IS NULL OR ocl.producto_id = p_producto_id)
    AND ocl.cantidad_solicitada > ocl.cantidad_recibida;
$$;

GRANT EXECUTE ON FUNCTION public.cotizador_oc_abiertas(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cotizador_oc_abiertas(uuid) FROM anon, public;
