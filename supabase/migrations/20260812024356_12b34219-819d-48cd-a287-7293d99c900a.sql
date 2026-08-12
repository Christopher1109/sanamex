-- 1) Tolerancia fija de $1 en la validación de suma de facturas
CREATE OR REPLACE FUNCTION public.agregar_factura_oc(p_orden_id uuid, p_folio text, p_fecha_factura date DEFAULT NULL::date, p_importe numeric DEFAULT NULL::numeric, p_dias_credito integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_oc record;
  v_autorizado boolean;
  v_factura_id uuid;
  v_dias integer;
  v_limite date;
  v_otras numeric;
  v_total numeric;
BEGIN
  SELECT * INTO v_oc FROM ordenes_compra WHERE id = p_orden_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  IF p_folio IS NULL OR btrim(p_folio) = '' THEN RAISE EXCEPTION 'El folio de factura es obligatorio'; END IF;

  v_autorizado :=
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role)
    OR (
      (has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role))
      AND v_oc.sucursal_destino_id IS NOT NULL AND es_gerente_de_sucursal(auth.uid(), v_oc.sucursal_destino_id)
    );
  IF NOT v_autorizado THEN RAISE EXCEPTION 'Sin permiso para ligar facturas a esta orden de compra'; END IF;

  v_total := COALESCE(v_oc.total, 0);
  SELECT COALESCE(SUM(importe), 0) INTO v_otras
  FROM ordenes_compra_facturas
  WHERE orden_id = p_orden_id AND folio <> btrim(p_folio);

  -- Tolerancia fija de $1.00 para absorber redondeos de centavos del proveedor.
  IF p_importe IS NOT NULL AND v_total > 0
     AND (v_otras + p_importe) > (v_total + 1.00) THEN
    RAISE EXCEPTION 'La suma de facturas ($%) excede el total de la orden ($%). Ya facturado: $%. Excedente: $%',
      round(v_otras + p_importe, 2), round(v_total, 2), round(v_otras, 2), round(v_otras + p_importe - v_total, 2);
  END IF;

  v_dias := p_dias_credito;
  IF v_dias IS NULL THEN
    SELECT plazo_pago_dias INTO v_dias FROM proveedores WHERE id = v_oc.proveedor_id;
  END IF;
  IF p_fecha_factura IS NOT NULL THEN
    v_limite := p_fecha_factura + COALESCE(v_dias, 0);
  END IF;

  INSERT INTO ordenes_compra_facturas (orden_id, folio, fecha_factura, importe, dias_credito, fecha_limite_pago, capturada_por)
  VALUES (p_orden_id, btrim(p_folio), p_fecha_factura, p_importe, v_dias, v_limite, auth.uid())
  ON CONFLICT (orden_id, folio) DO UPDATE SET
    fecha_factura = COALESCE(EXCLUDED.fecha_factura, ordenes_compra_facturas.fecha_factura),
    importe = COALESCE(EXCLUDED.importe, ordenes_compra_facturas.importe),
    dias_credito = COALESCE(EXCLUDED.dias_credito, ordenes_compra_facturas.dias_credito),
    fecha_limite_pago = COALESCE(EXCLUDED.fecha_limite_pago, ordenes_compra_facturas.fecha_limite_pago)
  RETURNING id INTO v_factura_id;

  UPDATE ordenes_compra_facturas
  SET fecha_limite_pago = fecha_factura + COALESCE(dias_credito, 0)
  WHERE id = v_factura_id AND fecha_factura IS NOT NULL AND fecha_limite_pago IS NULL;

  RETURN v_factura_id;
END;
$function$;

-- 2) Pago de factura: acepta ruta del comprobante (PDF/imagen)
CREATE OR REPLACE FUNCTION public.pagar_factura_oc(p_factura_id uuid, p_fecha date DEFAULT CURRENT_DATE, p_forma_pago text DEFAULT 'transferencia'::text, p_referencia text DEFAULT NULL::text, p_banco_cuenta_id uuid DEFAULT NULL::uuid, p_notas text DEFAULT NULL::text, p_comprobante_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_f record; v_oc record; v_nc numeric; v_pagado numeric; v_neto numeric;
  v_total_compra numeric; v_pagado_compra numeric; v_pago_id uuid;
BEGIN
  IF NOT (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'tesoreria'::app_role)
    OR has_role(auth.uid(),'contraloria'::app_role) OR has_role(auth.uid(),'direccion'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sin permiso para registrar pagos a proveedor';
  END IF;

  SELECT * INTO v_f FROM ordenes_compra_facturas WHERE id = p_factura_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  SELECT * INTO v_oc FROM ordenes_compra WHERE id = v_f.orden_id;

  IF v_f.importe IS NULL OR v_f.importe <= 0 THEN
    RAISE EXCEPTION 'La factura % no tiene importe capturado — captúralo antes de pagarla', v_f.folio;
  END IF;
  IF v_oc.compra_real_id IS NULL THEN
    RAISE EXCEPTION 'La orden % todavía no tiene compra registrada; no se puede pagar la factura', v_oc.folio;
  END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_nc FROM notas_credito_proveedor WHERE factura_id = p_factura_id;
  SELECT COALESCE(SUM(monto), 0) INTO v_pagado FROM pagos_cxp WHERE factura_oc_id = p_factura_id;
  v_neto := GREATEST(v_f.importe - v_nc, 0);

  IF v_pagado >= v_neto - 0.01 THEN
    RAISE EXCEPTION 'La factura % ya está pagada', v_f.folio;
  END IF;
  IF v_pagado > 0 THEN
    RAISE EXCEPTION 'La factura % tiene un pago previo de $% — no se permiten pagos parciales', v_f.folio, round(v_pagado, 2);
  END IF;

  INSERT INTO pagos_cxp (compra_id, factura_oc_id, fecha, monto, forma_pago, referencia, banco_cuenta_id, notas, comprobante_url, creado_por)
  VALUES (v_oc.compra_real_id, p_factura_id, COALESCE(p_fecha, CURRENT_DATE), v_neto,
          COALESCE(p_forma_pago, 'transferencia'), p_referencia, p_banco_cuenta_id,
          COALESCE(p_notas, 'Pago de factura ' || v_f.folio || ' (OC ' || v_oc.folio || ')'),
          p_comprobante_url, auth.uid())
  RETURNING id INTO v_pago_id;

  SELECT total INTO v_total_compra FROM compras WHERE id = v_oc.compra_real_id;
  SELECT COALESCE(SUM(monto), 0) INTO v_pagado_compra FROM pagos_cxp WHERE compra_id = v_oc.compra_real_id;

  IF v_total_compra IS NOT NULL AND v_pagado_compra >= v_total_compra - 0.5 THEN
    UPDATE compras SET pagada = true, estado = 'pagada', fecha_pago_real = COALESCE(p_fecha, CURRENT_DATE)
    WHERE id = v_oc.compra_real_id;
  END IF;

  INSERT INTO audit_log (entidad, accion, entidad_id, usuario_id)
  VALUES ('factura_oc', 'Pago de factura completa $' || round(v_neto, 2), p_factura_id, auth.uid());

  RETURN jsonb_build_object(
    'pago_id', v_pago_id, 'monto', v_neto, 'folio_factura', v_f.folio,
    'compra_saldada', (v_total_compra IS NOT NULL AND v_pagado_compra >= v_total_compra - 0.5)
  );
END;
$function$;

-- 3) Listado de facturas: exponer datos administrativos del pago
DROP FUNCTION IF EXISTS public.cxp_facturas_pendientes();
CREATE FUNCTION public.cxp_facturas_pendientes()
 RETURNS TABLE(factura_id uuid, folio_factura text, fecha_factura date, fecha_limite_pago date, dias_credito integer, importe numeric, notas_credito numeric, importe_neto numeric, pagado numeric, saldo numeric, pagada boolean, dias_para_vencer integer, orden_id uuid, orden_folio text, orden_total numeric, compra_id uuid, proveedor_id uuid, proveedor_nombre text, sucursal_id uuid, sucursal_codigo text, pdf_path text, xml_path text, pago_fecha date, pago_forma text, pago_referencia text, pago_cuenta text, pago_comprobante_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH nc AS (
    SELECT factura_id, SUM(monto) AS monto FROM notas_credito_proveedor
    WHERE factura_id IS NOT NULL GROUP BY factura_id
  ), pg AS (
    SELECT factura_oc_id, SUM(monto) AS monto FROM pagos_cxp
    WHERE factura_oc_id IS NOT NULL GROUP BY factura_oc_id
  ), ult AS (
    SELECT DISTINCT ON (p.factura_oc_id)
      p.factura_oc_id, p.fecha, p.forma_pago, p.referencia, p.comprobante_url, cb.alias
    FROM pagos_cxp p
    LEFT JOIN cuentas_bancarias cb ON cb.id = p.banco_cuenta_id
    WHERE p.factura_oc_id IS NOT NULL
    ORDER BY p.factura_oc_id, p.created_at DESC
  )
  SELECT
    f.id,
    f.folio,
    f.fecha_factura,
    f.fecha_limite_pago,
    f.dias_credito,
    COALESCE(f.importe, 0),
    COALESCE(nc.monto, 0),
    GREATEST(COALESCE(f.importe, 0) - COALESCE(nc.monto, 0), 0),
    COALESCE(pg.monto, 0),
    GREATEST(COALESCE(f.importe, 0) - COALESCE(nc.monto, 0) - COALESCE(pg.monto, 0), 0),
    (COALESCE(pg.monto, 0) >= GREATEST(COALESCE(f.importe, 0) - COALESCE(nc.monto, 0), 0) - 0.01
      AND COALESCE(f.importe, 0) > 0),
    CASE WHEN f.fecha_limite_pago IS NULL THEN NULL
         ELSE (f.fecha_limite_pago - CURRENT_DATE)::integer END,
    oc.id,
    oc.folio,
    oc.total,
    oc.compra_real_id,
    oc.proveedor_id,
    p.nombre,
    oc.sucursal_destino_id,
    s.codigo,
    f.pdf_path,
    f.xml_path,
    ult.fecha,
    ult.forma_pago,
    ult.referencia,
    ult.alias,
    ult.comprobante_url
  FROM ordenes_compra_facturas f
  JOIN ordenes_compra oc ON oc.id = f.orden_id
  LEFT JOIN proveedores p ON p.id = oc.proveedor_id
  LEFT JOIN sucursales s ON s.id = oc.sucursal_destino_id
  LEFT JOIN nc ON nc.factura_id = f.id
  LEFT JOIN pg ON pg.factura_oc_id = f.id
  LEFT JOIN ult ON ult.factura_oc_id = f.id
  WHERE oc.estado <> 'cancelada'
  ORDER BY f.fecha_limite_pago NULLS LAST, f.created_at;
$function$;