
CREATE OR REPLACE FUNCTION public.process_pos_sale(
  p_sucursal_id uuid,
  p_cajero_id uuid,
  p_items jsonb,
  p_metodo_pago text DEFAULT 'Efectivo',
  p_efectivo_recibido numeric DEFAULT NULL,
  p_nota text DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  -- Get almacen for this sucursal
  SELECT id INTO v_almacen_id FROM almacenes
  WHERE sucursal_id = p_sucursal_id AND activo = true
  ORDER BY created_at LIMIT 1;

  IF v_almacen_id IS NULL THEN
    RAISE EXCEPTION 'No hay almacén activo para esta sucursal';
  END IF;

  -- Generate sale number
  v_numero_venta := 'POS-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);

  -- First pass: validate all items have sufficient stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_producto FROM productos
    WHERE id = (v_item->>'producto_id')::uuid AND activo = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no encontrado o inactivo: %', v_item->>'producto_id';
    END IF;

    SELECT COALESCE(SUM(i.cantidad), 0) INTO v_total_stock
    FROM inventario i
    JOIN lotes l ON l.id = i.lote_id
    WHERE i.almacen_id = v_almacen_id
      AND l.producto_id = v_producto.id
      AND i.cantidad > 0;

    IF v_total_stock < (v_item->>'cantidad')::integer THEN
      RAISE EXCEPTION 'Stock insuficiente para "%": disponible %, solicitado %',
        v_producto.nombre, v_total_stock, (v_item->>'cantidad')::integer;
    END IF;
  END LOOP;

  -- Create venta
  INSERT INTO ventas (numero_venta, sucursal_id, cajero_id, cliente_id, subtotal, impuestos, total, estado, notas)
  VALUES (v_numero_venta, p_sucursal_id, p_cajero_id, p_cliente_id, 0, 0, 0, 'completada', p_nota)
  RETURNING id INTO v_venta_id;

  -- Process each item with FEFO
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_producto FROM productos WHERE id = (v_item->>'producto_id')::uuid;
    v_qty_remaining := (v_item->>'cantidad')::integer;
    v_precio := COALESCE((v_item->>'precio_unitario')::numeric, v_producto.precio_base);
    v_line_subtotal := v_precio * v_qty_remaining;
    v_subtotal := v_subtotal + v_line_subtotal;

    -- FEFO: deduct from lotes ordered by fecha_caducidad ASC
    FOR v_lote IN
      SELECT i.id as inv_id, i.lote_id, i.cantidad as inv_cantidad, l.numero_lote, l.costo_unitario
      FROM inventario i
      JOIN lotes l ON l.id = i.lote_id
      WHERE i.almacen_id = v_almacen_id
        AND l.producto_id = v_producto.id
        AND i.cantidad > 0
      ORDER BY l.fecha_caducidad ASC NULLS LAST
    LOOP
      EXIT WHEN v_qty_remaining <= 0;

      v_qty_to_deduct := LEAST(v_lote.inv_cantidad, v_qty_remaining);

      -- Conditional update for concurrency safety
      UPDATE inventario SET cantidad = cantidad - v_qty_to_deduct, updated_at = now()
      WHERE id = v_lote.inv_id AND cantidad >= v_qty_to_deduct;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Error de concurrencia: stock cambió durante la venta para "%"', v_producto.nombre;
      END IF;

      -- Create venta_linea
      INSERT INTO venta_lineas (venta_id, producto_id, lote_id, cantidad, precio_unitario, subtotal)
      VALUES (v_venta_id, v_producto.id, v_lote.lote_id, v_qty_to_deduct, v_precio, v_precio * v_qty_to_deduct);

      -- Create movimiento_inventario
      INSERT INTO movimientos_inventario (almacen_id, lote_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id, sucursal_id, usuario_id, notas)
      VALUES (v_almacen_id, v_lote.lote_id, 'salida', v_qty_to_deduct, v_lote.costo_unitario, 'venta', v_venta_id, p_sucursal_id, p_cajero_id, 'Venta POS: ' || v_numero_venta);

      v_qty_remaining := v_qty_remaining - v_qty_to_deduct;
    END LOOP;

    IF v_qty_remaining > 0 THEN
      RAISE EXCEPTION 'Stock insuficiente durante procesamiento para "%"', v_producto.nombre;
    END IF;
  END LOOP;

  -- Update venta totals
  v_total := v_subtotal;
  UPDATE ventas SET subtotal = v_subtotal, total = v_total WHERE id = v_venta_id;

  -- Handle payment
  SELECT id INTO v_metodo_pago_id FROM metodos_pago WHERE LOWER(nombre) = LOWER(p_metodo_pago) AND activo = true LIMIT 1;

  IF v_metodo_pago_id IS NOT NULL THEN
    INSERT INTO venta_pagos (venta_id, metodo_pago_id, monto) VALUES (v_venta_id, v_metodo_pago_id, v_total);
  END IF;

  -- Calculate change
  IF p_efectivo_recibido IS NOT NULL AND p_efectivo_recibido >= v_total THEN
    v_cambio := p_efectivo_recibido - v_total;
  END IF;

  RETURN jsonb_build_object(
    'sale_id', v_venta_id,
    'numero_venta', v_numero_venta,
    'subtotal', v_subtotal,
    'total', v_total,
    'cambio', v_cambio,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$;
