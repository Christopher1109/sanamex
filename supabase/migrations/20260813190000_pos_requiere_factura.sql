-- =========================================================
-- Sesión 13-ago-2026: exponer "requiere_factura" desde el POS.
--
-- La columna ventas.requiere_factura ya existía (fase1 fiscal,
-- 30-jul-2026) y ya la usa FiscalPage.tsx para el badge
-- Urgente/Acumulable en "Ventas por timbrar". Lo que faltaba era
-- que el cajero pudiera marcarla al momento del cobro en el POS:
-- process_pos_sale no aceptaba ese parámetro y siempre insertaba
-- la venta con requiere_factura en NULL (= acumulable por default).
--
-- Este cambio solo agrega el parámetro y lo escribe en el INSERT.
-- No se tocó ninguna otra parte de la lógica de la función
-- (deducción FEFO, lista de precios, offline/online, etc.) — se
-- copió tal cual estaba en 20260602184614_51b9f719-...sql.
-- =========================================================

CREATE OR REPLACE FUNCTION public.process_pos_sale(
  p_sucursal_id uuid,
  p_cajero_id uuid,
  p_items jsonb,
  p_metodo_pago text DEFAULT 'Efectivo'::text,
  p_efectivo_recibido numeric DEFAULT NULL::numeric,
  p_nota text DEFAULT NULL::text,
  p_cliente_id uuid DEFAULT NULL::uuid,
  p_cliente_uuid_local text DEFAULT NULL::text,
  p_origen text DEFAULT 'online'::text,
  p_requiere_factura boolean DEFAULT NULL::boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venta_id uuid;
  v_numero_venta text;
  v_almacen_id uuid;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_producto record;
  v_lote record;
  v_qty_remaining integer;
  v_qty_to_deduct integer;
  v_precio numeric;
  v_line_subtotal numeric;
  v_metodo_pago_id uuid;
  v_cambio numeric := 0;
  v_total_stock integer;
  v_existing_venta record;
  v_estado_final text := 'completada';
  v_motivo_revision text := NULL;
  v_total_qty_pedida integer;
  v_total_qty_entregada integer;
  v_preferred_lote uuid;
  v_cliente_tipo text;
  v_lista_precio text := 'LP1';
BEGIN
  IF p_cliente_uuid_local IS NOT NULL THEN
    SELECT id, numero_venta, subtotal, total, estado INTO v_existing_venta
    FROM ventas WHERE cliente_uuid_local = p_cliente_uuid_local LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'sale_id', v_existing_venta.id,
        'numero_venta', v_existing_venta.numero_venta,
        'subtotal', v_existing_venta.subtotal,
        'total', v_existing_venta.total,
        'estado', v_existing_venta.estado,
        'duplicado', true
      );
    END IF;
  END IF;

  -- Derive price list from client type
  IF p_cliente_id IS NOT NULL THEN
    SELECT tipo INTO v_cliente_tipo FROM clientes WHERE id = p_cliente_id;
    v_lista_precio := CASE LOWER(COALESCE(v_cliente_tipo, 'publico'))
      WHEN 'publico' THEN 'LP1'
      WHEN 'mayoreo' THEN 'LP2'
      WHEN 'especial' THEN 'LP3'
      WHEN 'institucional' THEN 'LP4'
      ELSE 'LP1'
    END;
  END IF;

  SELECT id INTO v_almacen_id FROM almacenes
  WHERE sucursal_id = p_sucursal_id AND activo = true
  ORDER BY created_at LIMIT 1;
  IF v_almacen_id IS NULL THEN RAISE EXCEPTION 'No hay almacén activo para esta sucursal'; END IF;

  v_numero_venta := CASE WHEN p_origen = 'offline' THEN 'OFF-' ELSE 'POS-' END
    || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_producto FROM productos
    WHERE id = (v_item->>'producto_id')::uuid AND activo = true;
    IF NOT FOUND THEN
      IF p_origen = 'offline' THEN
        v_estado_final := 'requiere_revision';
        v_motivo_revision := COALESCE(v_motivo_revision || '; ', '') || 'Producto inactivo o eliminado';
      ELSE
        RAISE EXCEPTION 'Producto no encontrado o inactivo: %', v_item->>'producto_id';
      END IF;
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(i.cantidad), 0) INTO v_total_stock
    FROM inventario i
    JOIN lotes l ON l.id = i.lote_id
    WHERE i.almacen_id = v_almacen_id
      AND l.producto_id = v_producto.id
      AND i.cantidad > 0
      AND (l.fecha_caducidad IS NULL OR l.fecha_caducidad >= CURRENT_DATE);

    IF v_total_stock < (v_item->>'cantidad')::integer THEN
      IF p_origen = 'offline' THEN
        v_estado_final := 'requiere_revision';
        v_motivo_revision := COALESCE(v_motivo_revision || '; ', '') ||
          format('Stock vigente insuficiente para "%s": disponible %s, vendido offline %s',
            v_producto.nombre, v_total_stock, (v_item->>'cantidad')::integer);
      ELSE
        RAISE EXCEPTION 'Stock vigente insuficiente para "%": disponible %, solicitado % (lotes vencidos no se pueden vender)',
          v_producto.nombre, v_total_stock, (v_item->>'cantidad')::integer;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO ventas (numero_venta, sucursal_id, cajero_id, cliente_id, subtotal, impuestos, total,
    estado, notas, origen, sincronizada_at, cliente_uuid_local, motivo_revision, lista_precio_aplicada,
    requiere_factura)
  VALUES (v_numero_venta, p_sucursal_id, p_cajero_id, p_cliente_id, 0, 0, 0,
    v_estado_final, p_nota, p_origen,
    CASE WHEN p_origen = 'offline' THEN now() ELSE NULL END,
    p_cliente_uuid_local, v_motivo_revision, v_lista_precio,
    p_requiere_factura)
  RETURNING id INTO v_venta_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_producto FROM productos WHERE id = (v_item->>'producto_id')::uuid;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_total_qty_pedida := (v_item->>'cantidad')::integer;
    v_qty_remaining := v_total_qty_pedida;
    v_precio := COALESCE((v_item->>'precio_unitario')::numeric, v_producto.precio_base);
    v_line_subtotal := v_precio * v_total_qty_pedida;
    v_subtotal := v_subtotal + v_line_subtotal;
    v_total_qty_entregada := 0;
    v_preferred_lote := NULLIF(v_item->>'lote_id','')::uuid;

    FOR v_lote IN
      SELECT i.id as inv_id, i.lote_id, i.cantidad as inv_cantidad, l.numero_lote, l.costo_unitario, l.fecha_caducidad
      FROM inventario i
      JOIN lotes l ON l.id = i.lote_id
      WHERE i.almacen_id = v_almacen_id
        AND l.producto_id = v_producto.id
        AND i.cantidad > 0
        AND (l.fecha_caducidad IS NULL OR l.fecha_caducidad >= CURRENT_DATE)
      ORDER BY
        CASE WHEN v_preferred_lote IS NOT NULL AND i.lote_id = v_preferred_lote THEN 0 ELSE 1 END,
        l.fecha_caducidad ASC NULLS LAST
    LOOP
      EXIT WHEN v_qty_remaining <= 0;
      v_qty_to_deduct := LEAST(v_lote.inv_cantidad, v_qty_remaining);

      UPDATE inventario SET cantidad = cantidad - v_qty_to_deduct, updated_at = now()
      WHERE id = v_lote.inv_id AND cantidad >= v_qty_to_deduct;

      IF NOT FOUND THEN
        IF p_origen = 'offline' THEN EXIT;
        ELSE RAISE EXCEPTION 'Error de concurrencia: stock cambió durante la venta para "%"', v_producto.nombre;
        END IF;
      END IF;

      INSERT INTO venta_lineas (venta_id, producto_id, lote_id, cantidad, precio_unitario, subtotal)
      VALUES (v_venta_id, v_producto.id, v_lote.lote_id, v_qty_to_deduct, v_precio, v_precio * v_qty_to_deduct);

      INSERT INTO movimientos_inventario (almacen_id, lote_id, tipo, cantidad, costo_unitario,
        referencia_tipo, referencia_id, sucursal_id, usuario_id, notas)
      VALUES (v_almacen_id, v_lote.lote_id, 'salida', v_qty_to_deduct, v_lote.costo_unitario,
        'venta', v_venta_id, p_sucursal_id, p_cajero_id,
        CASE WHEN p_origen = 'offline' THEN 'Venta offline sincronizada: ' ELSE 'Venta POS: ' END || v_numero_venta);

      v_qty_remaining := v_qty_remaining - v_qty_to_deduct;
      v_total_qty_entregada := v_total_qty_entregada + v_qty_to_deduct;
    END LOOP;

    IF v_qty_remaining > 0 THEN
      IF p_origen = 'offline' THEN
        UPDATE ventas SET estado = 'requiere_revision',
          motivo_revision = COALESCE(motivo_revision || '; ', '') ||
            format('Producto "%s": faltaron %s unidades al sincronizar', v_producto.nombre, v_qty_remaining)
        WHERE id = v_venta_id;
      ELSE
        RAISE EXCEPTION 'Stock vigente insuficiente durante procesamiento para "%"', v_producto.nombre;
      END IF;
    END IF;
  END LOOP;

  v_total := v_subtotal;
  UPDATE ventas SET subtotal = v_subtotal, total = v_total WHERE id = v_venta_id;

  SELECT id INTO v_metodo_pago_id FROM metodos_pago
  WHERE LOWER(nombre) = LOWER(p_metodo_pago) AND activo = true LIMIT 1;
  IF v_metodo_pago_id IS NOT NULL THEN
    INSERT INTO venta_pagos (venta_id, metodo_pago_id, monto) VALUES (v_venta_id, v_metodo_pago_id, v_total);
  END IF;

  IF p_efectivo_recibido IS NOT NULL AND p_efectivo_recibido >= v_total THEN
    v_cambio := p_efectivo_recibido - v_total;
  END IF;

  RETURN jsonb_build_object(
    'sale_id', v_venta_id, 'numero_venta', v_numero_venta,
    'subtotal', v_subtotal, 'total', v_total, 'cambio', v_cambio,
    'items_count', jsonb_array_length(p_items),
    'estado', v_estado_final, 'motivo_revision', v_motivo_revision,
    'lista_precio', v_lista_precio
  );
END;
$function$;
