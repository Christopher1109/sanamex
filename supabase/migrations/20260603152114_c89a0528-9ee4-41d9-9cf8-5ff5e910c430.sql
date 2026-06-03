
-- Indexes for hot query paths (40 concurrent users optimization)
CREATE INDEX IF NOT EXISTS idx_inventario_almacen ON public.inventario(almacen_id);
CREATE INDEX IF NOT EXISTS idx_inventario_lote ON public.inventario(lote_id);
CREATE INDEX IF NOT EXISTS idx_inventario_almacen_lote ON public.inventario(almacen_id, lote_id) WHERE cantidad > 0;
CREATE INDEX IF NOT EXISTS idx_lotes_producto ON public.lotes(producto_id);
CREATE INDEX IF NOT EXISTS idx_lotes_caducidad ON public.lotes(fecha_caducidad);
CREATE INDEX IF NOT EXISTS idx_lotes_producto_caducidad ON public.lotes(producto_id, fecha_caducidad);
CREATE INDEX IF NOT EXISTS idx_mov_lote ON public.movimientos_inventario(lote_id);
CREATE INDEX IF NOT EXISTS idx_mov_almacen_created ON public.movimientos_inventario(almacen_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mov_ref ON public.movimientos_inventario(referencia_tipo, referencia_id);
CREATE INDEX IF NOT EXISTS idx_mov_sucursal_created ON public.movimientos_inventario(sucursal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venta_lineas_venta ON public.venta_lineas(venta_id);
CREATE INDEX IF NOT EXISTS idx_venta_lineas_lote ON public.venta_lineas(lote_id);
CREATE INDEX IF NOT EXISTS idx_venta_lineas_producto ON public.venta_lineas(producto_id);
CREATE INDEX IF NOT EXISTS idx_ventas_sucursal_fecha ON public.ventas(sucursal_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_cajero ON public.ventas(cajero_id);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON public.ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_estado ON public.ventas(estado);
CREATE INDEX IF NOT EXISTS idx_compras_sucursal_estado ON public.compras(sucursal_id, estado);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON public.compras(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha_factura ON public.compras(fecha_factura) WHERE fecha_factura IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compra_lineas_compra ON public.compra_lineas(compra_id);
CREATE INDEX IF NOT EXISTS idx_traspaso_lineas_traspaso ON public.traspaso_lineas(traspaso_id);
CREATE INDEX IF NOT EXISTS idx_traspasos_origen ON public.traspasos(almacen_origen_id);
CREATE INDEX IF NOT EXISTS idx_traspasos_destino ON public.traspasos(almacen_destino_id);
CREATE INDEX IF NOT EXISTS idx_pedido_lineas_pedido ON public.pedido_lineas(pedido_id);
CREATE INDEX IF NOT EXISTS idx_productos_activo ON public.productos(activo) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_productos_sku ON public.productos(sku);
CREATE INDEX IF NOT EXISTS idx_notificaciones_leida ON public.notificaciones(leida, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);

-- RPC: Rentabilidad real por lote (server-side aggregation for performance)
CREATE OR REPLACE FUNCTION public.rentabilidad_por_lote(
  p_sucursal_id uuid DEFAULT NULL,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL
)
RETURNS TABLE (
  lote_id uuid,
  numero_lote text,
  producto_id uuid,
  producto_nombre text,
  producto_sku text,
  fecha_recepcion date,
  fecha_caducidad date,
  costo_unitario numeric,
  unidades_recibidas bigint,
  unidades_vendidas bigint,
  stock_actual bigint,
  costo_total numeric,
  ingreso_total numeric,
  precio_promedio numeric,
  ganancia numeric,
  margen_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lotes_filtrados AS (
    SELECT l.*
    FROM lotes l
    WHERE (p_fecha_desde IS NULL OR COALESCE(l.fecha_recepcion, l.created_at::date) >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR COALESCE(l.fecha_recepcion, l.created_at::date) <= p_fecha_hasta)
      AND (p_sucursal_id IS NULL OR EXISTS (
        SELECT 1 FROM inventario i JOIN almacenes a ON a.id = i.almacen_id
        WHERE i.lote_id = l.id AND a.sucursal_id = p_sucursal_id
        UNION ALL
        SELECT 1 FROM movimientos_inventario mi JOIN almacenes a2 ON a2.id = mi.almacen_id
        WHERE mi.lote_id = l.id AND a2.sucursal_id = p_sucursal_id
      ))
  ),
  entradas AS (
    SELECT mi.lote_id, SUM(mi.cantidad)::bigint AS qty
    FROM movimientos_inventario mi
    JOIN almacenes a ON a.id = mi.almacen_id
    WHERE mi.tipo = 'entrada'
      AND (p_sucursal_id IS NULL OR a.sucursal_id = p_sucursal_id)
    GROUP BY mi.lote_id
  ),
  ventas_agg AS (
    SELECT vl.lote_id,
           SUM(vl.cantidad)::bigint AS qty,
           SUM(vl.subtotal)::numeric AS ingreso
    FROM venta_lineas vl
    JOIN ventas v ON v.id = vl.venta_id
    WHERE v.estado = 'completada'
      AND (p_sucursal_id IS NULL OR v.sucursal_id = p_sucursal_id)
      AND (p_fecha_desde IS NULL OR v.fecha::date >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR v.fecha::date <= p_fecha_hasta)
    GROUP BY vl.lote_id
  ),
  stock_agg AS (
    SELECT i.lote_id, SUM(i.cantidad)::bigint AS qty
    FROM inventario i
    JOIN almacenes a ON a.id = i.almacen_id
    WHERE (p_sucursal_id IS NULL OR a.sucursal_id = p_sucursal_id)
    GROUP BY i.lote_id
  )
  SELECT
    l.id,
    l.numero_lote,
    p.id,
    p.nombre,
    p.sku,
    COALESCE(l.fecha_recepcion, l.created_at::date),
    l.fecha_caducidad,
    l.costo_unitario,
    COALESCE(e.qty, 0),
    COALESCE(va.qty, 0),
    COALESCE(s.qty, 0),
    (l.costo_unitario * COALESCE(va.qty, 0))::numeric,
    COALESCE(va.ingreso, 0),
    CASE WHEN COALESCE(va.qty,0) > 0 THEN (COALESCE(va.ingreso,0) / va.qty)::numeric ELSE 0 END,
    (COALESCE(va.ingreso,0) - (l.costo_unitario * COALESCE(va.qty, 0)))::numeric,
    CASE WHEN COALESCE(va.ingreso,0) > 0
         THEN ((COALESCE(va.ingreso,0) - (l.costo_unitario * COALESCE(va.qty,0))) / va.ingreso * 100)::numeric
         ELSE 0 END
  FROM lotes_filtrados l
  JOIN productos p ON p.id = l.producto_id
  LEFT JOIN entradas e ON e.lote_id = l.id
  LEFT JOIN ventas_agg va ON va.lote_id = l.id
  LEFT JOIN stock_agg s ON s.lote_id = l.id
  ORDER BY COALESCE(l.fecha_recepcion, l.created_at::date) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rentabilidad_por_lote(uuid, date, date) TO authenticated;

-- Detail: ventas individuales por lote (drill-down)
CREATE OR REPLACE FUNCTION public.ventas_por_lote(p_lote_id uuid)
RETURNS TABLE (
  venta_id uuid,
  numero_venta text,
  fecha timestamptz,
  sucursal_nombre text,
  cliente_nombre text,
  cantidad integer,
  precio_unitario numeric,
  subtotal numeric,
  lista_precio text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.numero_venta, v.fecha, s.nombre,
         COALESCE(c.nombre, 'Público'), vl.cantidad, vl.precio_unitario, vl.subtotal,
         v.lista_precio_aplicada
  FROM venta_lineas vl
  JOIN ventas v ON v.id = vl.venta_id
  JOIN sucursales s ON s.id = v.sucursal_id
  LEFT JOIN clientes c ON c.id = v.cliente_id
  WHERE vl.lote_id = p_lote_id AND v.estado = 'completada'
  ORDER BY v.fecha DESC;
$$;

GRANT EXECUTE ON FUNCTION public.ventas_por_lote(uuid) TO authenticated;
