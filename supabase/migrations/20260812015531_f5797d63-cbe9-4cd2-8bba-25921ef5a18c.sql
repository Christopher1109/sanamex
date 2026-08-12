REVOKE EXECUTE ON FUNCTION public.sugerido_sucursal_upsert(uuid, uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sugeridos_sucursal_list(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reposicion_sucursal_vista(uuid, text, boolean, integer, integer) FROM anon;

CREATE OR REPLACE FUNCTION public.cotizador_generar_oc(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prov proveedores%ROWTYPE;
  v_folio_ref text := payload->>'folio_cotizacion';
  v_ordenes jsonb := '[]'::jsonb;
  v_by_sucursal boolean;
  v_orden_id uuid;
  v_orden_madre_id uuid;
  v_grupo_id uuid;
  v_folio_grupo text;
  v_subtotal numeric; v_iva numeric; v_total numeric; v_ahorro numeric;
  r record; r2 record;
  v_suc_nombre text; v_suc_codigo text;
  v_piezas integer; v_lineas_count integer;
  v_titulo text; v_mensaje text;
  v_requiere_revision boolean;
  v_estado_oc text;
  v_estado_grupo text;
BEGIN
  IF NOT (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
       OR has_role(auth.uid(),'compras'::app_role)) THEN
    RAISE EXCEPTION 'Sin permiso para generar OC';
  END IF;

  SELECT COALESCE((SELECT valor FROM cotizador_params WHERE parametro='requiere_revision_gerente'), 0) > 0
    INTO v_requiere_revision;
  v_estado_oc    := CASE WHEN v_requiere_revision THEN 'pendiente_aprobacion' ELSE 'pendiente_confirmar' END;
  v_estado_grupo := CASE WHEN v_requiere_revision THEN 'en_revision' ELSE 'pendiente_confirmar' END;

  SELECT * INTO v_prov FROM proveedores WHERE id = (payload->>'proveedor_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor no encontrado'; END IF;
  v_by_sucursal := COALESCE(v_prov.entrega_por_sucursal, false);

  IF v_by_sucursal THEN
    v_folio_grupo := 'OCG-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,4);
    INSERT INTO ordenes_compra_grupo (folio, proveedor_id, estado, creada_por)
    VALUES (v_folio_grupo, v_prov.id, v_estado_grupo, auth.uid())
    RETURNING id INTO v_grupo_id;

    FOR r IN
      SELECT (l->>'sucursal_id')::uuid AS sucursal_id, jsonb_agg(l) AS lineas
      FROM jsonb_array_elements(payload->'lineas') l
      WHERE (l->>'cantidad')::int > 0
      GROUP BY (l->>'sucursal_id')::uuid
    LOOP
      INSERT INTO ordenes_compra (proveedor_id, sucursal_destino_id, estado, folio_cotizacion_ref, creada_por, grupo_id)
      VALUES (v_prov.id, r.sucursal_id, v_estado_oc, v_folio_ref, auth.uid(), v_grupo_id)
      RETURNING id INTO v_orden_id;

      INSERT INTO orden_compra_lineas (orden_id, producto_id, cantidad_solicitada, precio_unitario, precio_con_iva)
      SELECT v_orden_id, (l->>'producto_id')::uuid, (l->>'cantidad')::int,
             (l->>'precio_unitario')::numeric, (l->>'precio_con_iva')::numeric
      FROM jsonb_array_elements(r.lineas) l;

      SELECT COALESCE(SUM(subtotal),0), COALESCE(SUM((precio_con_iva - precio_unitario) * cantidad_solicitada),0)
        INTO v_subtotal, v_iva
      FROM orden_compra_lineas WHERE orden_id = v_orden_id;
      v_total := v_subtotal + v_iva;

      SELECT COALESCE(SUM((uc.costo_unitario - ocl.precio_unitario) * ocl.cantidad_solicitada), 0)
        INTO v_ahorro
      FROM orden_compra_lineas ocl
      LEFT JOIN LATERAL (
        SELECT costo_unitario FROM lotes WHERE producto_id = ocl.producto_id ORDER BY created_at DESC LIMIT 1
      ) uc ON true
      WHERE ocl.orden_id = v_orden_id;

      UPDATE ordenes_compra SET subtotal = v_subtotal, iva = v_iva, total = v_total, ahorro_estimado = v_ahorro WHERE id = v_orden_id;

      INSERT INTO ordenes_compra_transito (orden_id, producto_id, sucursal_id, proveedor_id, cantidad)
      SELECT v_orden_id, (l->>'producto_id')::uuid, r.sucursal_id, v_prov.id, (l->>'cantidad')::int
      FROM jsonb_array_elements(r.lineas) l;

      SELECT nombre, codigo INTO v_suc_nombre, v_suc_codigo FROM sucursales WHERE id = r.sucursal_id;
      SELECT count(*), COALESCE(SUM(cantidad_solicitada),0) INTO v_lineas_count, v_piezas
        FROM orden_compra_lineas WHERE orden_id = v_orden_id;

      v_titulo := 'Orden de compra: ' || v_prov.nombre || ' → ' || COALESCE(v_suc_nombre, 'sucursal');
      v_mensaje := v_lineas_count || ' producto(s) · ' || v_piezas || ' pieza(s) · Total $' || to_char(v_total, 'FM999,999,990.00')
                   || ' — Folio ' || v_folio_ref || '. '
                   || CASE WHEN v_requiere_revision THEN 'Para revisar y confirmar.'
                           ELSE 'Lista para confirmar con el proveedor.' END;
      INSERT INTO notificaciones (sucursal_id, tipo, severidad, titulo, mensaje, referencia_tipo, referencia_id)
      VALUES (r.sucursal_id, 'oc_generada', 'info', v_titulo, v_mensaje, 'orden_compra', v_orden_id);

      v_ordenes := v_ordenes || jsonb_build_array(jsonb_build_object('orden_id', v_orden_id, 'sucursal_id', r.sucursal_id));
    END LOOP;

  ELSE
    INSERT INTO ordenes_compra (proveedor_id, estado, folio_cotizacion_ref, creada_por)
    VALUES (v_prov.id, v_estado_oc, v_folio_ref, auth.uid())
    RETURNING id INTO v_orden_id;
    v_orden_madre_id := v_orden_id;

    INSERT INTO orden_compra_lineas (orden_id, producto_id, cantidad_solicitada, precio_unitario, precio_con_iva)
    SELECT v_orden_id, (l->>'producto_id')::uuid,
      SUM((l->>'cantidad')::int)::int,
      MAX((l->>'precio_unitario')::numeric), MAX((l->>'precio_con_iva')::numeric)
    FROM jsonb_array_elements(payload->'lineas') l
    WHERE (l->>'cantidad')::int > 0
    GROUP BY (l->>'producto_id')::uuid;

    SELECT COALESCE(SUM(subtotal),0), COALESCE(SUM((precio_con_iva - precio_unitario) * cantidad_solicitada),0)
      INTO v_subtotal, v_iva
    FROM orden_compra_lineas WHERE orden_id = v_orden_id;
    v_total := v_subtotal + v_iva;

    SELECT COALESCE(SUM((uc.costo_unitario - ocl.precio_unitario) * ocl.cantidad_solicitada), 0)
      INTO v_ahorro
    FROM orden_compra_lineas ocl
    LEFT JOIN LATERAL (
      SELECT costo_unitario FROM lotes WHERE producto_id = ocl.producto_id ORDER BY created_at DESC LIMIT 1
    ) uc ON true
    WHERE ocl.orden_id = v_orden_id;

    UPDATE ordenes_compra SET subtotal = v_subtotal, iva = v_iva, total = v_total, ahorro_estimado = v_ahorro WHERE id = v_orden_id;

    INSERT INTO ordenes_compra_transito (orden_id, producto_id, sucursal_id, proveedor_id, cantidad)
    SELECT v_orden_id, (l->>'producto_id')::uuid, (l->>'sucursal_id')::uuid, v_prov.id, (l->>'cantidad')::int
    FROM jsonb_array_elements(payload->'lineas') l
    WHERE (l->>'cantidad')::int > 0 AND (l->>'sucursal_id') IS NOT NULL;

    FOR r2 IN
      SELECT (l->>'sucursal_id')::uuid AS sucursal_id,
             count(*) AS n_lineas,
             SUM((l->>'cantidad')::int) AS piezas,
             SUM((l->>'cantidad')::int * (l->>'precio_con_iva')::numeric) AS monto
      FROM jsonb_array_elements(payload->'lineas') l
      WHERE (l->>'cantidad')::int > 0 AND (l->>'sucursal_id') IS NOT NULL
      GROUP BY (l->>'sucursal_id')::uuid
    LOOP
      SELECT nombre, codigo INTO v_suc_nombre, v_suc_codigo FROM sucursales WHERE id = r2.sucursal_id;
      v_titulo := 'Reparto de compra: ' || v_prov.nombre || ' → ' || COALESCE(v_suc_nombre, 'sucursal');
      v_mensaje := 'Te corresponden ' || r2.n_lineas || ' producto(s) · ' || r2.piezas || ' pieza(s) · $'
                   || to_char(r2.monto, 'FM999,999,990.00') || ' de la orden madre ' || v_folio_ref
                   || ' (entrega centralizada, redistribución interna). Solo informativo.';
      INSERT INTO notificaciones (sucursal_id, tipo, severidad, titulo, mensaje, referencia_tipo, referencia_id)
      VALUES (r2.sucursal_id, 'oc_reparto_informativo', 'info', v_titulo, v_mensaje, 'orden_compra', v_orden_madre_id);
    END LOOP;

    v_titulo := 'Orden madre generada: ' || v_prov.nombre;
    v_mensaje := 'Folio ' || v_folio_ref || ' · Total $' || to_char(v_total, 'FM999,999,990.00')
                 || ' · Ahorro estimado $' || to_char(v_ahorro, 'FM999,999,990.00') || '.';
    INSERT INTO notificaciones (sucursal_id, tipo, severidad, titulo, mensaje, referencia_tipo, referencia_id)
    VALUES (NULL, 'oc_generada', 'info', v_titulo, v_mensaje, 'orden_compra', v_orden_id);

    v_ordenes := jsonb_build_array(jsonb_build_object('orden_id', v_orden_id));
  END IF;

  RETURN jsonb_build_object('ordenes', v_ordenes, 'grupo_id', v_grupo_id, 'requiere_revision', v_requiere_revision);
END;
$function$;
