
CREATE OR REPLACE FUNCTION public.reporte_ventas_inventario_sanamex(p_sucursal_id uuid DEFAULT NULL::uuid, p_fecha_corte date DEFAULT CURRENT_DATE, p_incluir_cedis boolean DEFAULT false)
 RETURNS TABLE(clave text, lab text, categoria text, departamento text, descripcion text, agrupador text, sustancia text, iva numeric, stock_minimo integer, clasif text, clasif_abc text, status text, cpi numeric, costo_total numeric, te bigint, ddi_7 numeric, ddi_14 numeric, ddi_30 numeric, ddi_60 numeric, ddi_90 numeric, un_v_dia bigint, cu_compra_dia numeric, pu_venta_dia numeric, venta_dia numeric, utilidad_dia numeric, margen_dia numeric, un_v_sem bigint, cu_compra_sem numeric, pu_venta_sem numeric, venta_sem numeric, utilidad_sem numeric, margen_sem numeric, un_v_sem_ant bigint, cu_compra_sem_ant numeric, pu_venta_sem_ant numeric, venta_sem_ant numeric, utilidad_sem_ant numeric, margen_sem_ant numeric, un_v_2sem_ant bigint, cu_compra_2sem_ant numeric, pu_venta_2sem_ant numeric, venta_2sem_ant numeric, utilidad_2sem_ant numeric, margen_2sem_ant numeric, un_v_mes bigint, cu_compra_mes numeric, pu_venta_mes numeric, venta_mes numeric, utilidad_mes numeric, margen_mes numeric, un_v_30 bigint, cu_compra_30 numeric, pu_venta_30 numeric, venta_30 numeric, utilidad_30 numeric, margen_30 numeric, un_v_60 bigint, cu_compra_60 numeric, pu_venta_60 numeric, venta_60 numeric, utilidad_60 numeric, margen_60 numeric, un_v_90 bigint, cu_compra_90 numeric, pu_venta_90 numeric, venta_90 numeric, utilidad_90 numeric, margen_90 numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH params AS (
  SELECT p_fecha_corte::timestamp AS corte,
         date_trunc('week', p_fecha_corte::timestamp) AS sem_ini,
         date_trunc('month', p_fecha_corte::timestamp) AS mes_ini
),
suc_ok AS (
  SELECT id FROM public.sucursales
  WHERE activo = true
    AND (p_sucursal_id IS NULL AND (p_incluir_cedis OR tipo <> 'cedis')
         OR id = p_sucursal_id)
),
inv AS (
  SELECT l.producto_id,
         SUM(i.cantidad)::bigint AS te,
         SUM(i.cantidad * COALESCE(l.costo_unitario,0))::numeric AS costo_total_calc
  FROM inventario i
  JOIN lotes l ON l.id=i.lote_id
  JOIN almacenes a ON a.id=i.almacen_id
  WHERE a.sucursal_id IN (SELECT id FROM suc_ok)
  GROUP BY l.producto_id
),
vl_base AS (
  -- Costo HISTÓRICO: usar vl.costo_unitario (lo que costó al momento de la venta).
  -- Fallback a lotes.costo_unitario solo si la línea no tiene costo capturado.
  SELECT vl.producto_id, v.fecha, vl.cantidad, vl.precio_unitario, vl.subtotal,
         COALESCE(vl.costo_unitario, l.costo_unitario, 0) AS costo,
         (vl.costo_unitario IS NOT NULL OR l.costo_unitario IS NOT NULL) AS costo_valido
  FROM venta_lineas vl
  JOIN ventas v ON v.id=vl.venta_id
  LEFT JOIN lotes l ON l.id=vl.lote_id
  WHERE v.estado='completada'
    AND v.sucursal_id IN (SELECT id FROM suc_ok)
    AND v.fecha >= (SELECT corte FROM params) - interval '120 days'
    AND v.fecha <= (SELECT corte FROM params)
),
agg AS (
  SELECT producto_id,
    SUM(cantidad) FILTER (WHERE fecha::date = (SELECT corte FROM params)::date) AS u_dia,
    SUM(subtotal) FILTER (WHERE fecha::date = (SELECT corte FROM params)::date) AS v_dia,
    SUM(cantidad*costo) FILTER (WHERE fecha::date = (SELECT corte FROM params)::date AND costo_valido) AS c_dia,
    SUM(cantidad) FILTER (WHERE fecha::date = (SELECT corte FROM params)::date AND costo_valido) AS uc_dia,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT sem_ini FROM params)) AS u_sem,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT sem_ini FROM params)) AS v_sem,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) AND costo_valido) AS c_sem,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) AND costo_valido) AS uc_sem,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '7 days' AND fecha < (SELECT sem_ini FROM params)) AS u_sa,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '7 days' AND fecha < (SELECT sem_ini FROM params)) AS v_sa,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '7 days' AND fecha < (SELECT sem_ini FROM params) AND costo_valido) AS c_sa,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '7 days' AND fecha < (SELECT sem_ini FROM params) AND costo_valido) AS uc_sa,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '14 days' AND fecha < (SELECT sem_ini FROM params) - interval '7 days') AS u_2sa,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '14 days' AND fecha < (SELECT sem_ini FROM params) - interval '7 days') AS v_2sa,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '14 days' AND fecha < (SELECT sem_ini FROM params) - interval '7 days' AND costo_valido) AS c_2sa,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT sem_ini FROM params) - interval '14 days' AND fecha < (SELECT sem_ini FROM params) - interval '7 days' AND costo_valido) AS uc_2sa,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT mes_ini FROM params)) AS u_mes,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT mes_ini FROM params)) AS v_mes,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT mes_ini FROM params) AND costo_valido) AS c_mes,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT mes_ini FROM params) AND costo_valido) AS uc_mes,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '30 days') AS u_30,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '30 days') AS v_30,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '30 days' AND costo_valido) AS c_30,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '30 days' AND costo_valido) AS uc_30,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '60 days') AS u_60,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '60 days') AS v_60,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '60 days' AND costo_valido) AS c_60,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '60 days' AND costo_valido) AS uc_60,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '90 days') AS u_90,
    SUM(subtotal) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '90 days') AS v_90,
    SUM(cantidad*costo) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '90 days' AND costo_valido) AS c_90,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '90 days' AND costo_valido) AS uc_90,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '7 days')  AS vel_7,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '14 days') AS vel_14,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '30 days') AS vel_30,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '60 days') AS vel_60,
    SUM(cantidad) FILTER (WHERE fecha >= (SELECT corte FROM params) - interval '90 days') AS vel_90
  FROM vl_base GROUP BY producto_id
)
SELECT
  COALESCE(p.codigo_barras, p.sku),
  p.laboratorio, p.categoria, p.departamento, p.nombre,
  p.agrupador, p.sustancia_activa,
  p.iva_tasa,
  COALESCE(p.stock_minimo,0),
  p.clasificacion,
  p.clasificacion_80_20,
  p.estatus,
  COALESCE(p.costo_promedio,0), COALESCE(inv.costo_total_calc,0), COALESCE(inv.te,0),
  CASE WHEN COALESCE(a.vel_7,0)>0  THEN (inv.te::numeric / (a.vel_7/7.0))   ELSE NULL END,
  CASE WHEN COALESCE(a.vel_14,0)>0 THEN (inv.te::numeric / (a.vel_14/14.0)) ELSE NULL END,
  CASE WHEN COALESCE(a.vel_30,0)>0 THEN (inv.te::numeric / (a.vel_30/30.0)) ELSE NULL END,
  CASE WHEN COALESCE(a.vel_60,0)>0 THEN (inv.te::numeric / (a.vel_60/60.0)) ELSE NULL END,
  CASE WHEN COALESCE(a.vel_90,0)>0 THEN (inv.te::numeric / (a.vel_90/90.0)) ELSE NULL END,
  COALESCE(a.u_dia,0),  CASE WHEN COALESCE(a.uc_dia,0)>0  THEN a.c_dia/a.uc_dia   ELSE 0 END, CASE WHEN COALESCE(a.u_dia,0)>0  THEN a.v_dia/a.u_dia  ELSE 0 END, COALESCE(a.v_dia,0),  COALESCE(a.v_dia,0)-COALESCE(a.c_dia,0),   CASE WHEN COALESCE(a.v_dia,0)>0  THEN (a.v_dia-COALESCE(a.c_dia,0))/a.v_dia*100   ELSE 0 END,
  COALESCE(a.u_sem,0),  CASE WHEN COALESCE(a.uc_sem,0)>0  THEN a.c_sem/a.uc_sem   ELSE 0 END, CASE WHEN COALESCE(a.u_sem,0)>0  THEN a.v_sem/a.u_sem  ELSE 0 END, COALESCE(a.v_sem,0),  COALESCE(a.v_sem,0)-COALESCE(a.c_sem,0),   CASE WHEN COALESCE(a.v_sem,0)>0  THEN (a.v_sem-COALESCE(a.c_sem,0))/a.v_sem*100   ELSE 0 END,
  COALESCE(a.u_sa,0),   CASE WHEN COALESCE(a.uc_sa,0)>0   THEN a.c_sa/a.uc_sa     ELSE 0 END, CASE WHEN COALESCE(a.u_sa,0)>0   THEN a.v_sa/a.u_sa    ELSE 0 END, COALESCE(a.v_sa,0),   COALESCE(a.v_sa,0)-COALESCE(a.c_sa,0),     CASE WHEN COALESCE(a.v_sa,0)>0   THEN (a.v_sa-COALESCE(a.c_sa,0))/a.v_sa*100     ELSE 0 END,
  COALESCE(a.u_2sa,0),  CASE WHEN COALESCE(a.uc_2sa,0)>0  THEN a.c_2sa/a.uc_2sa   ELSE 0 END, CASE WHEN COALESCE(a.u_2sa,0)>0  THEN a.v_2sa/a.u_2sa  ELSE 0 END, COALESCE(a.v_2sa,0),  COALESCE(a.v_2sa,0)-COALESCE(a.c_2sa,0),   CASE WHEN COALESCE(a.v_2sa,0)>0  THEN (a.v_2sa-COALESCE(a.c_2sa,0))/a.v_2sa*100  ELSE 0 END,
  COALESCE(a.u_mes,0),  CASE WHEN COALESCE(a.uc_mes,0)>0  THEN a.c_mes/a.uc_mes   ELSE 0 END, CASE WHEN COALESCE(a.u_mes,0)>0  THEN a.v_mes/a.u_mes  ELSE 0 END, COALESCE(a.v_mes,0),  COALESCE(a.v_mes,0)-COALESCE(a.c_mes,0),   CASE WHEN COALESCE(a.v_mes,0)>0  THEN (a.v_mes-COALESCE(a.c_mes,0))/a.v_mes*100  ELSE 0 END,
  COALESCE(a.u_30,0),   CASE WHEN COALESCE(a.uc_30,0)>0   THEN a.c_30/a.uc_30     ELSE 0 END, CASE WHEN COALESCE(a.u_30,0)>0   THEN a.v_30/a.u_30    ELSE 0 END, COALESCE(a.v_30,0),   COALESCE(a.v_30,0)-COALESCE(a.c_30,0),     CASE WHEN COALESCE(a.v_30,0)>0   THEN (a.v_30-COALESCE(a.c_30,0))/a.v_30*100     ELSE 0 END,
  COALESCE(a.u_60,0),   CASE WHEN COALESCE(a.uc_60,0)>0   THEN a.c_60/a.uc_60     ELSE 0 END, CASE WHEN COALESCE(a.u_60,0)>0   THEN a.v_60/a.u_60    ELSE 0 END, COALESCE(a.v_60,0),   COALESCE(a.v_60,0)-COALESCE(a.c_60,0),     CASE WHEN COALESCE(a.v_60,0)>0   THEN (a.v_60-COALESCE(a.c_60,0))/a.v_60*100     ELSE 0 END,
  COALESCE(a.u_90,0),   CASE WHEN COALESCE(a.uc_90,0)>0   THEN a.c_90/a.uc_90     ELSE 0 END, CASE WHEN COALESCE(a.u_90,0)>0   THEN a.v_90/a.u_90    ELSE 0 END, COALESCE(a.v_90,0),   COALESCE(a.v_90,0)-COALESCE(a.c_90,0),     CASE WHEN COALESCE(a.v_90,0)>0   THEN (a.v_90-COALESCE(a.c_90,0))/a.v_90*100     ELSE 0 END
FROM public.productos p
LEFT JOIN inv ON inv.producto_id = p.id
LEFT JOIN agg a ON a.producto_id = p.id
WHERE p.activo = true
ORDER BY p.nombre;
$function$;
