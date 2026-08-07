CREATE OR REPLACE FUNCTION public.confirmar_envio_proveedor(p_grupo_id uuid DEFAULT NULL::uuid, p_orden_id uuid DEFAULT NULL::uuid, p_metodo_pago text DEFAULT 'credito'::text, p_dias_credito integer DEFAULT NULL::integer, p_fecha_pago_limite date DEFAULT NULL::date, p_fecha_estimada_entrega date DEFAULT NULL::date, p_notas text DEFAULT NULL::text, p_monto_a_pagar numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_grupo record; v_oc record;
  v_proveedor_id uuid; v_proveedor_nombre text; v_total numeric; v_subtotal numeric; v_iva numeric;
  v_sucursal_id uuid; v_compra_id uuid; v_numero text; v_pendientes int;
  v_mensaje text; v_factor numeric;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'compras'::app_role)) THEN
    RAISE EXCEPTION 'Sin permiso para confirmar el envío al proveedor';
  END IF;
  IF (p_grupo_id IS NULL) = (p_orden_id IS NULL) THEN
    RAISE EXCEPTION 'Debe indicar exactamente uno: grupo o una orden individual';
  END IF;
  IF p_metodo_pago NOT IN ('credito','contado') THEN
    RAISE EXCEPTION 'metodo_pago inválido: %', p_metodo_pago;
  END IF;

  IF p_grupo_id IS NOT NULL THEN
    SELECT * INTO v_grupo FROM ordenes_compra_grupo WHERE id = p_grupo_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Grupo no encontrado'; END IF;
    IF v_grupo.compra_real_id IS NOT NULL THEN RAISE EXCEPTION 'Este grupo ya fue confirmado con el proveedor'; END IF;

    -- Las órdenes ya confirmadas con el proveedor también son válidas para pasar a ruta.
    SELECT count(*) INTO v_pendientes FROM ordenes_compra
      WHERE grupo_id = p_grupo_id AND estado NOT IN ('pendiente_confirmar','confirmada_proveedor','cancelada');
    IF v_pendientes > 0 THEN
      RAISE EXCEPTION 'Todavía hay % sucursal(es) que no han sido autorizadas para enviar al proveedor', v_pendientes;
    END IF;

    SELECT count(*) INTO v_pendientes FROM ordenes_compra
      WHERE grupo_id = p_grupo_id AND estado IN ('pendiente_confirmar','confirmada_proveedor');
    IF v_pendientes = 0 THEN RAISE EXCEPTION 'No hay órdenes listas para marcar en ruta en este grupo'; END IF;

    v_proveedor_id := v_grupo.proveedor_id;
    SELECT COALESCE(SUM(total),0), COALESCE(SUM(subtotal),0), COALESCE(SUM(iva),0) INTO v_total, v_subtotal, v_iva
      FROM ordenes_compra WHERE grupo_id = p_grupo_id AND estado <> 'cancelada';
    SELECT sucursal_destino_id INTO v_sucursal_id FROM ordenes_compra WHERE grupo_id = p_grupo_id AND estado <> 'cancelada' ORDER BY created_at LIMIT 1;
  ELSE
    SELECT * INTO v_oc FROM ordenes_compra WHERE id = p_orden_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
    IF v_oc.estado NOT IN ('pendiente_confirmar','confirmada_proveedor') THEN
      RAISE EXCEPTION 'Esta orden no está lista para marcar en ruta (estado actual: %)', v_oc.estado;
    END IF;
    IF v_oc.compra_real_id IS NOT NULL THEN RAISE EXCEPTION 'Esta orden ya fue confirmada con el proveedor'; END IF;
    v_proveedor_id := v_oc.proveedor_id; v_total := v_oc.total; v_subtotal := v_oc.subtotal; v_iva := v_oc.iva;
    v_sucursal_id := v_oc.sucursal_destino_id;
  END IF;

  -- Monto a pagar capturado por administración (default: total de la orden).
  IF p_monto_a_pagar IS NOT NULL AND p_monto_a_pagar > 0 AND v_total IS NOT NULL AND v_total > 0 THEN
    v_factor := p_monto_a_pagar / v_total;
    v_subtotal := ROUND(COALESCE(v_subtotal,0) * v_factor, 2);
    v_iva := ROUND(COALESCE(v_iva,0) * v_factor, 2);
    v_total := p_monto_a_pagar;
  END IF;

  IF v_sucursal_id IS NULL THEN
    SELECT id INTO v_sucursal_id FROM sucursales WHERE es_cedis = true AND activo = true ORDER BY codigo LIMIT 1;
  END IF;

  SELECT nombre INTO v_proveedor_nombre FROM proveedores WHERE id = v_proveedor_id;
  v_numero := 'OC-PROV-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,4);

  INSERT INTO compras (numero_compra, proveedor_id, sucursal_id, estado, total, subtotal, impuestos,
                       metodo_pago, dias_credito, fecha_factura, fecha_pago_limite, pagada, creado_por, notas)
  VALUES (v_numero, v_proveedor_id, v_sucursal_id, 'facturada', v_total, v_subtotal, v_iva,
          p_metodo_pago, CASE WHEN p_metodo_pago = 'credito' THEN p_dias_credito ELSE NULL END,
          CURRENT_DATE,
          CASE WHEN p_metodo_pago = 'credito' THEN COALESCE(p_fecha_pago_limite, CURRENT_DATE + COALESCE(p_dias_credito, 30)) ELSE CURRENT_DATE END,
          false, auth.uid(), COALESCE(p_notas, ''))
  RETURNING id INTO v_compra_id;

  v_mensaje := 'El proveedor ' || COALESCE(v_proveedor_nombre, '') || ' confirmó tu pedido y ya va en camino.'
    || CASE WHEN p_fecha_estimada_entrega IS NOT NULL THEN ' Llega aproximadamente el ' || to_char(p_fecha_estimada_entrega, 'DD/MM/YYYY') || '.' ELSE '' END;

  IF p_grupo_id IS NOT NULL THEN
    UPDATE ordenes_compra_grupo SET compra_real_id = v_compra_id, estado = 'enviada', fecha_envio = CURRENT_DATE WHERE id = p_grupo_id;
    UPDATE ordenes_compra SET estado = 'en_ruta', compra_real_id = v_compra_id, fecha_envio = CURRENT_DATE,
      fecha_estimada_entrega = p_fecha_estimada_entrega
      WHERE grupo_id = p_grupo_id AND estado IN ('pendiente_confirmar','confirmada_proveedor');

    INSERT INTO notificaciones (tipo, titulo, mensaje, severidad, sucursal_id, referencia_id, referencia_tipo)
    SELECT 'oc_en_ruta', 'Pedido en camino — ' || oc.folio, v_mensaje, 'info', oc.sucursal_destino_id, oc.id, 'orden_compra'
    FROM ordenes_compra oc
    WHERE oc.grupo_id = p_grupo_id AND oc.estado = 'en_ruta' AND oc.sucursal_destino_id IS NOT NULL;
  ELSE
    UPDATE ordenes_compra SET estado = 'en_ruta', compra_real_id = v_compra_id, fecha_envio = CURRENT_DATE,
      fecha_estimada_entrega = p_fecha_estimada_entrega
      WHERE id = p_orden_id;

    IF v_sucursal_id IS NOT NULL THEN
      INSERT INTO notificaciones (tipo, titulo, mensaje, severidad, sucursal_id, referencia_id, referencia_tipo)
      SELECT 'oc_en_ruta', 'Pedido en camino — ' || oc.folio, v_mensaje, 'info', v_sucursal_id, p_orden_id, 'orden_compra'
      FROM ordenes_compra oc WHERE oc.id = p_orden_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('compra_id', v_compra_id, 'numero_compra', v_numero, 'estado', 'en_ruta', 'total', v_total);
END;
$function$;

DROP FUNCTION IF EXISTS public.confirmar_envio_proveedor(uuid, uuid, text, integer, date, text);
DROP FUNCTION IF EXISTS public.confirmar_envio_proveedor(uuid, uuid, text, integer, date, date, text);