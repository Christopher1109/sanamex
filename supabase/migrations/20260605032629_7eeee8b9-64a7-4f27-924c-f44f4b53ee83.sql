
-- 1) Columnas nuevas
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS agrupador text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS lead_time_prometido_dias integer;

-- 2) Índices
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON public.ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_venta_lineas_producto ON public.venta_lineas(producto_id);
CREATE INDEX IF NOT EXISTS idx_lotes_producto ON public.lotes(producto_id);
CREATE INDEX IF NOT EXISTS idx_inventario_lote ON public.inventario(lote_id);

-- 3) ABC por Pareto (90 días)
CREATE OR REPLACE FUNCTION public.clasificacion_abc_productos()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  WITH ventas_90 AS (
    SELECT vl.producto_id, SUM(vl.subtotal) AS ingreso
    FROM venta_lineas vl
    JOIN ventas v ON v.id = vl.venta_id
    WHERE v.estado='completada' AND v.fecha >= now() - interval '90 days'
    GROUP BY vl.producto_id
  ),
  totales AS (SELECT SUM(ingreso) AS total FROM ventas_90),
  ranked AS (
    SELECT v.producto_id,
           v.ingreso,
           SUM(v.ingreso) OVER (ORDER BY v.ingreso DESC) / NULLIF((SELECT total FROM totales),0) AS acum_pct
    FROM ventas_90 v
  )
  UPDATE productos p
  SET clasificacion_80_20 = CASE
    WHEN r.acum_pct IS NULL THEN 'D'
    WHEN r.acum_pct <= 0.80 THEN 'A'
    WHEN r.acum_pct <= 0.95 THEN 'B'
    ELSE 'C'
  END
  FROM ranked r
  WHERE p.id = r.producto_id;

  UPDATE productos SET clasificacion_80_20 = 'D'
  WHERE id NOT IN (SELECT producto_id FROM (
    SELECT vl.producto_id FROM venta_lineas vl
    JOIN ventas v ON v.id=vl.venta_id
    WHERE v.estado='completada' AND v.fecha >= now() - interval '90 days'
    GROUP BY vl.producto_id) x);
END $$;

-- 4) Reporte maestro
CREATE OR REPLACE FUNCTION public.reporte_ventas_inventario_sanamex(
  p_sucursal_id uuid DEFAULT NULL,
  p_fecha_corte date DEFAULT CURRENT_DATE
) RETURNS TABLE(
  clave text, lab text, categoria text, departamento text, descripcion text,
  agrupador text, sustancia text, iva numeric, cantidad integer, clasif text, status text,
  cpi numeric, costo_total numeric, te bigint,
  ddi_7 numeric, ddi_14 numeric, ddi_30 numeric, ddi_60 numeric, ddi_90 numeric,
  un_v_dia bigint, cu_compra_dia numeric, pu_venta_dia numeric, venta_dia numeric, utilidad_dia numeric, margen_dia numeric,
  un_v_sem bigint, cu_compra_sem numeric, pu_venta_sem numeric, venta_sem numeric, utilidad_sem numeric, margen_sem numeric,
  un_v_sem_ant bigint, cu_compra_sem_ant numeric, pu_venta_sem_ant numeric, venta_sem_ant numeric, utilidad_sem_ant numeric, margen_sem_ant numeric,
  un_v_2sem_ant bigint, cu_compra_2sem_ant numeric, pu_venta_2sem_ant numeric, venta_2sem_ant numeric, utilidad_2sem_ant numeric, margen_2sem_ant numeric,
  un_v_mes bigint, cu_compra_mes numeric, pu_venta_mes numeric, venta_mes numeric, utilidad_mes numeric, margen_mes numeric,
  un_v_30 bigint, cu_compra_30 numeric, pu_venta_30 numeric, venta_30 numeric, utilidad_30 numeric, margen_30 numeric,
  un_v_60 bigint, cu_compra_60 numeric, pu_venta_60 numeric, venta_60 numeric, utilidad_60 numeric, margen_60 numeric,
  un_v_90 bigint, cu_compra_90 numeric, pu_venta_90 numeric, venta_90 numeric, utilidad_90 numeric, margen_90 numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH params AS (
  SELECT p_fecha_corte::timestamp AS corte,
         date_trunc('week', p_fecha_corte::timestamp) AS sem_ini,
         date_trunc('month', p_fecha_corte::timestamp) AS mes_ini
),
inv AS (
  SELECT l.producto_id,
         SUM(i.cantidad)::bigint AS te,
         SUM(i.cantidad * COALESCE(l.costo_unitario,0))::numeric AS costo_total_calc
  FROM inventario i
  JOIN lotes l ON l.id=i.lote_id
  JOIN almacenes a ON a.id=i.almacen_id
  WHERE (p_sucursal_id IS NULL OR a.sucursal_id = p_sucursal_id)
  GROUP BY l.producto_id
),
vl_base AS (
  SELECT vl.producto_id, v.fecha, vl.cantidad, vl.precio_unitario, vl.subtotal,
         COALESCE(l.costo_unitario,0) AS costo
  FROM venta_lineas vl
  JOIN ventas v ON v.id=vl.venta_id
  LEFT JOIN lotes l ON l.id=vl.lote_id
  WHERE v.estado='completada'
    AND (p_sucursal_id IS NULL OR v.sucursal_id = p_sucursal_id)
    AND v.fecha >= (SELECT corte FROM params) - interval '120 days'
    AND v.fecha <= (SELECT corte FROM params)
),
agg AS (
  SELECT producto_id,
    -- Día actual
    SUM(cantidad) FILTER (WHERE fecha::date = (SELECT corte FROM params)::date) AS u_dia,
    SUM(subtotal) FILTER (WHERE fecha::date = (SELECT corte FROM params)::date) AS v_dia,
    SUM(cantidad*costo) FILTER (WHERE fecha::date = (SELECT corte FROM params)::date) AS c_dia,
    -- Semana actual
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT sem_ini FROM params)) AS u_sem,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT sem_ini FROM params)) AS v_sem,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT sem_ini FROM params)) AS c_sem,
    -- Semana anterior
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '7 days' AND fecha < (SELECT sem_ini FROM params)) AS u_sa,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '7 days' AND fecha < (SELECT sem_ini FROM params)) AS v_sa,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '7 days' AND fecha < (SELECT sem_ini FROM params)) AS c_sa,
    -- 2 Semanas antes
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '14 days' AND fecha < (SELECT sem_ini FROM params) - interval '7 days') AS u_2sa,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '14 days' AND fecha < (SELECT sem_ini FROM params) - interval '7 days') AS v_2sa,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '14 days' AND fecha < (SELECT sem_ini FROM params) - interval '7 days') AS c_2sa,
    -- Mes actual
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT mes_ini FROM params)) AS u_mes,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT mes_ini FROM params)) AS v_mes,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT mes_ini FROM params)) AS c_mes,
    -- 30/60/90 días rolling
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '30 days') AS u_30,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '30 days') AS v_30,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '30 days') AS c_30,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '60 days') AS u_60,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '60 days') AS v_60,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '60 days') AS c_60,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '90 days') AS u_90,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '90 days') AS v_90,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '90 days') AS c_90,
    -- Velocidad para DDI
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '7 days') AS vel_7,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '14 days') AS vel_14,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '30 days') AS vel_30,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '60 days') AS vel_60,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '90 days') AS vel_90
  FROM vl_base GROUP BY producto_id
)
SELECT
  COALESCE(p.codigo_barras, p.sku) AS clave,
  p.laboratorio, p.categoria, p.departamento, p.nombre,
  p.agrupador, p.sustancia_activa, COALESCE(p.iva_tasa,0),
  COALESCE(p.stock_minimo,0), p.clasificacion_80_20, p.estatus,
  COALESCE(p.costo_promedio,0), COALESCE(inv.costo_total_calc,0), COALESCE(inv.te,0),
  CASE WHEN COALESCE(a.vel_7,0)>0  THEN (inv.te::numeric / (a.vel_7/7.0)) ELSE NULL END,
  CASE WHEN COALESCE(a.vel_14,0)>0 THEN (inv.te::numeric / (a.vel_14/14.0)) ELSE NULL END,
  CASE WHEN COALESCE(a.vel_30,0)>0 THEN (inv.te::numeric / (a.vel_30/30.0)) ELSE NULL END,
  CASE WHEN COALESCE(a.vel_60,0)>0 THEN (inv.te::numeric / (a.vel_60/60.0)) ELSE NULL END,
  CASE WHEN COALESCE(a.vel_90,0)>0 THEN (inv.te::numeric / (a.vel_90/90.0)) ELSE NULL END,
  COALESCE(a.u_dia,0), CASE WHEN COALESCE(a.u_dia,0)>0 THEN a.c_dia/a.u_dia ELSE 0 END, CASE WHEN COALESCE(a.u_dia,0)>0 THEN a.v_dia/a.u_dia ELSE 0 END, COALESCE(a.v_dia,0), COALESCE(a.v_dia,0)-COALESCE(a.c_dia,0), CASE WHEN COALESCE(a.v_dia,0)>0 THEN (a.v_dia-a.c_dia)/a.v_dia ELSE 0 END,
  COALESCE(a.u_sem,0), CASE WHEN COALESCE(a.u_sem,0)>0 THEN a.c_sem/a.u_sem ELSE 0 END, CASE WHEN COALESCE(a.u_sem,0)>0 THEN a.v_sem/a.u_sem ELSE 0 END, COALESCE(a.v_sem,0), COALESCE(a.v_sem,0)-COALESCE(a.c_sem,0), CASE WHEN COALESCE(a.v_sem,0)>0 THEN (a.v_sem-a.c_sem)/a.v_sem ELSE 0 END,
  COALESCE(a.u_sa,0), CASE WHEN COALESCE(a.u_sa,0)>0 THEN a.c_sa/a.u_sa ELSE 0 END, CASE WHEN COALESCE(a.u_sa,0)>0 THEN a.v_sa/a.u_sa ELSE 0 END, COALESCE(a.v_sa,0), COALESCE(a.v_sa,0)-COALESCE(a.c_sa,0), CASE WHEN COALESCE(a.v_sa,0)>0 THEN (a.v_sa-a.c_sa)/a.v_sa ELSE 0 END,
  COALESCE(a.u_2sa,0), CASE WHEN COALESCE(a.u_2sa,0)>0 THEN a.c_2sa/a.u_2sa ELSE 0 END, CASE WHEN COALESCE(a.u_2sa,0)>0 THEN a.v_2sa/a.u_2sa ELSE 0 END, COALESCE(a.v_2sa,0), COALESCE(a.v_2sa,0)-COALESCE(a.c_2sa,0), CASE WHEN COALESCE(a.v_2sa,0)>0 THEN (a.v_2sa-a.c_2sa)/a.v_2sa ELSE 0 END,
  COALESCE(a.u_mes,0), CASE WHEN COALESCE(a.u_mes,0)>0 THEN a.c_mes/a.u_mes ELSE 0 END, CASE WHEN COALESCE(a.u_mes,0)>0 THEN a.v_mes/a.u_mes ELSE 0 END, COALESCE(a.v_mes,0), COALESCE(a.v_mes,0)-COALESCE(a.c_mes,0), CASE WHEN COALESCE(a.v_mes,0)>0 THEN (a.v_mes-a.c_mes)/a.v_mes ELSE 0 END,
  COALESCE(a.u_30,0),  CASE WHEN COALESCE(a.u_30,0)>0  THEN a.c_30/a.u_30 ELSE 0 END,  CASE WHEN COALESCE(a.u_30,0)>0  THEN a.v_30/a.u_30 ELSE 0 END,  COALESCE(a.v_30,0),  COALESCE(a.v_30,0)-COALESCE(a.c_30,0),  CASE WHEN COALESCE(a.v_30,0)>0  THEN (a.v_30-a.c_30)/a.v_30 ELSE 0 END,
  COALESCE(a.u_60,0),  CASE WHEN COALESCE(a.u_60,0)>0  THEN a.c_60/a.u_60 ELSE 0 END,  CASE WHEN COALESCE(a.u_60,0)>0  THEN a.v_60/a.u_60 ELSE 0 END,  COALESCE(a.v_60,0),  COALESCE(a.v_60,0)-COALESCE(a.c_60,0),  CASE WHEN COALESCE(a.v_60,0)>0  THEN (a.v_60-a.c_60)/a.v_60 ELSE 0 END,
  COALESCE(a.u_90,0),  CASE WHEN COALESCE(a.u_90,0)>0  THEN a.c_90/a.u_90 ELSE 0 END,  CASE WHEN COALESCE(a.u_90,0)>0  THEN a.v_90/a.u_90 ELSE 0 END,  COALESCE(a.v_90,0),  COALESCE(a.v_90,0)-COALESCE(a.c_90,0),  CASE WHEN COALESCE(a.v_90,0)>0  THEN (a.v_90-a.c_90)/a.v_90 ELSE 0 END
FROM productos p
LEFT JOIN inv ON inv.producto_id = p.id
LEFT JOIN agg a ON a.producto_id = p.id
WHERE p.activo = true
ORDER BY p.nombre;
$$;

-- 5) Fill Rate Proveedores
CREATE OR REPLACE FUNCTION public.fill_rate_proveedores(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
) RETURNS TABLE(
  numero_proveedor text, nombre_proveedor text, numero_oc text,
  total_items_solicitados bigint, total_items_entregados bigint,
  fill_rate_items numeric,
  lead_time_dias integer, fecha_emision date, fecha_recepcion date,
  varianza_tiempo integer, fill_rate_lead_time numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    SUBSTRING(pr.id::text,1,8) AS numero_proveedor,
    pr.nombre,
    c.numero_compra,
    COALESCE(SUM(cl.cantidad_ordenada),0)::bigint,
    COALESCE(SUM(cl.cantidad_recibida),0)::bigint,
    CASE WHEN COALESCE(SUM(cl.cantidad_ordenada),0)>0
         THEN (SUM(cl.cantidad_recibida)::numeric / SUM(cl.cantidad_ordenada) * 100)
         ELSE 0 END,
    GREATEST(0, (COALESCE(c.fecha_factura, c.updated_at::date) - c.created_at::date))::integer,
    c.created_at::date,
    COALESCE(c.fecha_factura, c.updated_at::date),
    (COALESCE(c.fecha_factura, c.updated_at::date) - c.created_at::date - COALESCE(pr.lead_time_prometido_dias,0))::integer,
    CASE WHEN COALESCE(pr.lead_time_prometido_dias,0) > 0
         THEN LEAST(100, (pr.lead_time_prometido_dias::numeric / NULLIF((COALESCE(c.fecha_factura,c.updated_at::date) - c.created_at::date),0) * 100))
         ELSE NULL END
  FROM compras c
  JOIN proveedores pr ON pr.id = c.proveedor_id
  LEFT JOIN compra_lineas cl ON cl.compra_id = c.id
  WHERE c.estado IN ('recibida','parcial','cerrada')
    AND (p_desde IS NULL OR c.created_at::date >= p_desde)
    AND (p_hasta IS NULL OR c.created_at::date <= p_hasta)
  GROUP BY pr.id, pr.nombre, c.id, c.numero_compra, c.created_at, c.fecha_factura, c.updated_at, pr.lead_time_prometido_dias
  ORDER BY c.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.reporte_ventas_inventario_sanamex(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fill_rate_proveedores(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clasificacion_abc_productos() TO authenticated;
