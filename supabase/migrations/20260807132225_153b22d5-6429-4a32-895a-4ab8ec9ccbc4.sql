-- 1) Recepciones: permitir stand-by (sin factura) y capturar costo/incidencias
ALTER TABLE public.ordenes_compra_recepciones
  ALTER COLUMN factura_id DROP NOT NULL;

ALTER TABLE public.ordenes_compra_recepciones
  ADD COLUMN IF NOT EXISTS almacen_id uuid REFERENCES public.almacenes(id),
  ADD COLUMN IF NOT EXISTS costo_unitario numeric,
  ADD COLUMN IF NOT EXISTS incidencia_tipo text,
  ADD COLUMN IF NOT EXISTS incidencia_notas text,
  ADD COLUMN IF NOT EXISTS aplicada_inventario boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS aplicada_en timestamptz;

-- 2) recibir_oc: factura opcional; sin factura no entra al inventario
CREATE OR REPLACE FUNCTION public.recibir_oc(p_orden_id uuid, p_recepciones jsonb, p_almacen_id uuid, p_factura_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb; v_linea record; v_cant int; v_lote_id uuid; v_estado text;
  v_total_sol int; v_total_rec int; v_user uuid := auth.uid();
  v_oc record; v_transito record; v_almacen_destino_id uuid; v_almacen_sucursal_id uuid;
  v_cant_total_transito int; v_cant_para_esta_sucursal int; v_lineas_traspaso jsonb; v_autorizado boolean;
  v_factura record; v_costo numeric; v_aplica boolean;
BEGIN
  v_aplica := p_factura_id IS NOT NULL;

  IF v_aplica THEN
    SELECT * INTO v_factura FROM ordenes_compra_facturas WHERE id = p_factura_id AND orden_id = p_orden_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La factura indicada no corresponde a esta orden de compra';
    END IF;
  END IF;

  SELECT * INTO v_oc FROM ordenes_compra WHERE id = p_orden_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;

  SELECT sucursal_id INTO v_almacen_sucursal_id FROM almacenes WHERE id = p_almacen_id;

  v_autorizado :=
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
    OR (
      (has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role))
      AND (
        es_gerente_de_sucursal(auth.uid(), v_almacen_sucursal_id)
        OR (v_oc.sucursal_destino_id IS NOT NULL AND es_gerente_de_sucursal(auth.uid(), v_oc.sucursal_destino_id))
      )
    );
  IF NOT v_autorizado THEN RAISE EXCEPTION 'Sin permiso para recibir mercancía en este almacén'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_recepciones) LOOP
    v_cant := (v_item->>'cantidad')::int;
    IF v_cant <= 0 THEN CONTINUE; END IF;
    SELECT ocl.* INTO v_linea FROM orden_compra_lineas ocl WHERE ocl.id = (v_item->>'linea_id')::uuid AND ocl.orden_id = p_orden_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_costo := COALESCE(NULLIF(v_item->>'costo_unitario','')::numeric, v_linea.precio_unitario);

    UPDATE orden_compra_lineas SET cantidad_recibida = cantidad_recibida + v_cant WHERE id = v_linea.id;

    IF v_aplica THEN
      INSERT INTO lotes (producto_id, numero_lote, costo_unitario, fecha_recepcion, fecha_caducidad, compra_id)
      VALUES (v_linea.producto_id, NULLIF(v_item->>'numero_lote', ''), v_costo, CURRENT_DATE,
              NULLIF(v_item->>'fecha_caducidad', '')::date, v_oc.compra_real_id)
      RETURNING id INTO v_lote_id;
      IF (v_item->>'numero_lote') IS NULL OR (v_item->>'numero_lote') = '' THEN
        UPDATE lotes SET numero_lote = 'OC-'||SUBSTRING(p_orden_id::text,1,8)||'-'||to_char(now(),'YYYYMMDDHH24MISS') WHERE id = v_lote_id;
      END IF;

      INSERT INTO inventario (almacen_id, lote_id, cantidad) VALUES (p_almacen_id, v_lote_id, v_cant);
      INSERT INTO movimientos_inventario (almacen_id, lote_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id, usuario_id, notas)
      VALUES (p_almacen_id, v_lote_id, 'entrada', v_cant, v_costo, 'orden_compra', p_orden_id, v_user, 'Recepción OC — factura ' || v_factura.folio);
    END IF;

    INSERT INTO ordenes_compra_recepciones (orden_id, factura_id, linea_id, producto_id, cantidad, numero_lote, fecha_caducidad,
                                            recibido_por, almacen_id, costo_unitario, incidencia_tipo, incidencia_notas,
                                            aplicada_inventario, aplicada_en)
    VALUES (p_orden_id, p_factura_id, v_linea.id, v_linea.producto_id, v_cant,
            NULLIF(v_item->>'numero_lote', ''), NULLIF(v_item->>'fecha_caducidad', '')::date, v_user,
            p_almacen_id, v_costo, NULLIF(v_item->>'incidencia_tipo',''), NULLIF(v_item->>'incidencia_notas',''),
            v_aplica, CASE WHEN v_aplica THEN now() ELSE NULL END);

    IF v_aplica AND v_oc.sucursal_destino_id IS NULL THEN
      SELECT COALESCE(SUM(cantidad), 0) INTO v_cant_total_transito
        FROM ordenes_compra_transito WHERE orden_id = p_orden_id AND producto_id = v_linea.producto_id;
      IF v_cant_total_transito > 0 THEN
        FOR v_transito IN
          SELECT sucursal_id, cantidad FROM ordenes_compra_transito WHERE orden_id = p_orden_id AND producto_id = v_linea.producto_id AND cantidad > 0
        LOOP
          v_cant_para_esta_sucursal := FLOOR(v_cant * v_transito.cantidad::numeric / v_cant_total_transito);
          IF v_cant_para_esta_sucursal > 0 THEN
            SELECT id INTO v_almacen_destino_id FROM almacenes WHERE sucursal_id = v_transito.sucursal_id AND activo = true LIMIT 1;
            IF v_almacen_destino_id IS NOT NULL AND v_almacen_destino_id <> p_almacen_id THEN
              v_lineas_traspaso := jsonb_build_array(jsonb_build_object('lote_id', v_lote_id, 'cantidad', v_cant_para_esta_sucursal));
              PERFORM enviar_traspaso(v_almacen_sucursal_id, p_almacen_id, v_transito.sucursal_id, v_almacen_destino_id,
                v_lineas_traspaso, 'Reparto automático de ' || v_oc.folio || ' (entrega centralizada)');
            END IF;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(cantidad_solicitada),0), COALESCE(SUM(cantidad_recibida),0) INTO v_total_sol, v_total_rec
    FROM orden_compra_lineas WHERE orden_id = p_orden_id;

  IF NOT v_aplica THEN
    v_estado := 'recibida_pend_factura';
  ELSE
    v_estado := CASE WHEN v_total_rec = 0 THEN v_oc.estado WHEN v_total_rec >= v_total_sol THEN 'recibida' ELSE 'parcial' END;
  END IF;

  UPDATE ordenes_compra SET estado = v_estado,
    fecha_recepcion_real = CASE WHEN v_estado='recibida' THEN CURRENT_DATE ELSE fecha_recepcion_real END,
    recibida_por = v_user
  WHERE id = p_orden_id;

  RETURN jsonb_build_object('estado', v_estado, 'solicitado', v_total_sol, 'recibido', v_total_rec,
                            'factura_id', p_factura_id, 'aplicada_inventario', v_aplica);
END;
$function$;

DROP FUNCTION IF EXISTS public.recibir_oc(uuid, jsonb, uuid);

-- 3) Ligar factura a una recepción pendiente y meter el stock al inventario
CREATE OR REPLACE FUNCTION public.ligar_factura_recepcion(p_orden_id uuid, p_factura_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_oc record; v_factura record; v_rec record; v_lote_id uuid; v_user uuid := auth.uid();
  v_almacen_sucursal_id uuid; v_autorizado boolean; v_aplicadas int := 0;
  v_total_sol int; v_total_rec int; v_estado text; v_almacen uuid;
BEGIN
  SELECT * INTO v_oc FROM ordenes_compra WHERE id = p_orden_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;

  SELECT * INTO v_factura FROM ordenes_compra_facturas WHERE id = p_factura_id AND orden_id = p_orden_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La factura indicada no corresponde a esta orden de compra'; END IF;

  SELECT almacen_id INTO v_almacen FROM ordenes_compra_recepciones
    WHERE orden_id = p_orden_id AND aplicada_inventario = false AND almacen_id IS NOT NULL LIMIT 1;
  SELECT sucursal_id INTO v_almacen_sucursal_id FROM almacenes WHERE id = v_almacen;

  v_autorizado :=
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
    OR (
      (has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role))
      AND (
        es_gerente_de_sucursal(auth.uid(), v_almacen_sucursal_id)
        OR (v_oc.sucursal_destino_id IS NOT NULL AND es_gerente_de_sucursal(auth.uid(), v_oc.sucursal_destino_id))
      )
    );
  IF NOT v_autorizado THEN RAISE EXCEPTION 'Sin permiso para aceptar esta mercancía en inventario'; END IF;

  FOR v_rec IN SELECT * FROM ordenes_compra_recepciones
               WHERE orden_id = p_orden_id AND aplicada_inventario = false ORDER BY created_at LOOP
    IF v_rec.almacen_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO lotes (producto_id, numero_lote, costo_unitario, fecha_recepcion, fecha_caducidad, compra_id)
    VALUES (v_rec.producto_id, NULLIF(v_rec.numero_lote,''), v_rec.costo_unitario, CURRENT_DATE, v_rec.fecha_caducidad, v_oc.compra_real_id)
    RETURNING id INTO v_lote_id;
    IF v_rec.numero_lote IS NULL OR v_rec.numero_lote = '' THEN
      UPDATE lotes SET numero_lote = 'OC-'||SUBSTRING(p_orden_id::text,1,8)||'-'||to_char(now(),'YYYYMMDDHH24MISS') WHERE id = v_lote_id;
    END IF;

    INSERT INTO inventario (almacen_id, lote_id, cantidad) VALUES (v_rec.almacen_id, v_lote_id, v_rec.cantidad);
    INSERT INTO movimientos_inventario (almacen_id, lote_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id, usuario_id, notas)
    VALUES (v_rec.almacen_id, v_lote_id, 'entrada', v_rec.cantidad, v_rec.costo_unitario, 'orden_compra', p_orden_id, v_user,
            'Aceptación en inventario — factura ' || v_factura.folio);

    UPDATE ordenes_compra_recepciones
      SET factura_id = p_factura_id, aplicada_inventario = true, aplicada_en = now()
      WHERE id = v_rec.id;
    v_aplicadas := v_aplicadas + 1;
  END LOOP;

  SELECT COALESCE(SUM(cantidad_solicitada),0), COALESCE(SUM(cantidad_recibida),0) INTO v_total_sol, v_total_rec
    FROM orden_compra_lineas WHERE orden_id = p_orden_id;
  v_estado := CASE WHEN v_total_rec >= v_total_sol THEN 'recibida' ELSE 'parcial' END;

  UPDATE ordenes_compra SET estado = v_estado,
    fecha_recepcion_real = CASE WHEN v_estado='recibida' THEN CURRENT_DATE ELSE fecha_recepcion_real END
  WHERE id = p_orden_id;

  RETURN jsonb_build_object('estado', v_estado, 'aplicadas', v_aplicadas, 'factura_id', p_factura_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.ligar_factura_recepcion(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ligar_factura_recepcion(uuid, uuid) TO authenticated;

-- 4) Notas de crédito: bonificación / descuento / incidencia
ALTER TABLE public.notas_credito_proveedor DROP CONSTRAINT IF EXISTS notas_credito_proveedor_tipo_check;
ALTER TABLE public.notas_credito_proveedor ADD CONSTRAINT notas_credito_proveedor_tipo_check
  CHECK (tipo = ANY (ARRAY['incidencia','bonificacion','descuento','negociada','objetivo_trimestral']));

CREATE OR REPLACE FUNCTION public.crear_nota_credito_proveedor(p_proveedor_id uuid, p_tipo text, p_monto numeric, p_motivo text DEFAULT NULL::text, p_compra_id uuid DEFAULT NULL::uuid, p_producto_id uuid DEFAULT NULL::uuid, p_cantidad_incidencia integer DEFAULT NULL::integer, p_lote_id uuid DEFAULT NULL::uuid, p_almacen_id uuid DEFAULT NULL::uuid, p_es_retroactiva boolean DEFAULT false, p_periodo_inicio date DEFAULT NULL::date, p_periodo_fin date DEFAULT NULL::date, p_factura_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nc_id uuid;
  v_folio text;
  v_ajuste_unitario numeric;
  v_costo_actual numeric;
  v_compra record;
  v_pagado_previo numeric;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
       OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'contraloria'::app_role)
       OR has_role(auth.uid(),'compras'::app_role)
       OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role)) THEN
    RAISE EXCEPTION 'Sin permiso para crear notas de crédito de proveedor';
  END IF;
  IF p_tipo NOT IN ('incidencia','bonificacion','descuento','negociada','objetivo_trimestral') THEN
    RAISE EXCEPTION 'Tipo de nota de crédito inválido: %', p_tipo;
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto de la nota de crédito debe ser mayor a cero';
  END IF;
  IF p_factura_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM ordenes_compra_facturas WHERE id = p_factura_id) THEN
      RAISE EXCEPTION 'La factura indicada no existe';
    END IF;
  END IF;

  v_folio := 'NC-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,4);

  INSERT INTO notas_credito_proveedor
    (folio, proveedor_id, tipo, monto, motivo, compra_id, producto_id,
     cantidad_incidencia, lote_id, es_retroactiva, periodo_inicio, periodo_fin, creada_por, factura_id)
  VALUES
    (v_folio, p_proveedor_id, p_tipo, p_monto, p_motivo, p_compra_id, p_producto_id,
     p_cantidad_incidencia, p_lote_id, p_es_retroactiva, p_periodo_inicio, p_periodo_fin, auth.uid(), p_factura_id)
  RETURNING id INTO v_nc_id;

  -- Todos los tipos bajan lo que realmente se le debe al proveedor.
  IF p_compra_id IS NOT NULL THEN
    SELECT * INTO v_compra FROM compras WHERE id = p_compra_id;
    IF FOUND THEN
      SELECT COALESCE(SUM(monto),0) INTO v_pagado_previo FROM pagos_cxp WHERE compra_id = p_compra_id;

      INSERT INTO pagos_cxp (compra_id, fecha, monto, forma_pago, referencia, notas, creado_por)
      VALUES (p_compra_id, CURRENT_DATE, p_monto, 'nota_credito', v_folio, COALESCE(p_motivo,'Nota de crédito ' || p_tipo), auth.uid());

      IF (v_pagado_previo + p_monto) >= (v_compra.total - 0.5) THEN
        UPDATE compras SET pagada = true, estado = 'pagada', fecha_pago_real = CURRENT_DATE WHERE id = p_compra_id;
      END IF;
    END IF;
  END IF;

  -- Incidencia: ajusta el inventario a lo realmente recibido.
  IF p_tipo = 'incidencia' AND p_producto_id IS NOT NULL AND p_cantidad_incidencia IS NOT NULL AND p_almacen_id IS NOT NULL THEN
    IF p_lote_id IS NULL THEN
      SELECT id INTO p_lote_id FROM lotes
      WHERE producto_id = p_producto_id AND (p_compra_id IS NULL OR compra_id = p_compra_id)
      ORDER BY created_at DESC LIMIT 1;
    END IF;
    IF p_lote_id IS NOT NULL THEN
      UPDATE inventario SET cantidad = GREATEST(cantidad - p_cantidad_incidencia, 0), updated_at = now()
      WHERE almacen_id = p_almacen_id AND lote_id = p_lote_id;

      SELECT costo_unitario INTO v_costo_actual FROM lotes WHERE id = p_lote_id;
      INSERT INTO movimientos_inventario (almacen_id, lote_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id, usuario_id, notas)
      VALUES (p_almacen_id, p_lote_id, 'salida', p_cantidad_incidencia, v_costo_actual, 'nota_credito_proveedor', v_nc_id, auth.uid(),
              'Ajuste por incidencia de proveedor (faltante de piezas) — ' || v_folio);
    END IF;
  END IF;

  -- Descuento (y la antigua 'negociada'): sí baja el costo de ingreso del lote.
  IF p_tipo IN ('descuento','negociada') AND p_lote_id IS NOT NULL AND p_cantidad_incidencia IS NOT NULL AND p_cantidad_incidencia > 0 THEN
    v_ajuste_unitario := p_monto / p_cantidad_incidencia;
    UPDATE lotes SET costo_unitario = GREATEST(costo_unitario - v_ajuste_unitario, 0) WHERE id = p_lote_id;
  END IF;

  -- Bonificación: NO toca el costo del producto, solo el saldo del proveedor.

  UPDATE notas_credito_proveedor SET aplicada = true, aplicada_por = auth.uid(), aplicada_en = now() WHERE id = v_nc_id;

  RETURN jsonb_build_object('id', v_nc_id, 'folio', v_folio, 'tipo', p_tipo);
END;
$function$;

DROP FUNCTION IF EXISTS public.crear_nota_credito_proveedor(uuid, text, numeric, text, uuid, uuid, integer, uuid, uuid, boolean, date, date);