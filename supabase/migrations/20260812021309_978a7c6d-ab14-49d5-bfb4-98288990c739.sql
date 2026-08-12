ALTER TABLE public.pagos_cxp
  ADD COLUMN IF NOT EXISTS factura_oc_id uuid REFERENCES public.ordenes_compra_facturas(id);

CREATE INDEX IF NOT EXISTS idx_pagos_cxp_factura_oc ON public.pagos_cxp(factura_oc_id);

COMMENT ON COLUMN public.pagos_cxp.factura_oc_id IS
  'Factura de orden de compra que este pago salda. Los pagos por factura son siempre por el importe neto completo.';

-- Facturas por pagar: la unidad de pago real es el folio de factura del
-- proveedor (los estados de cuenta llegan por factura, no por orden).
CREATE OR REPLACE FUNCTION public.cxp_facturas_pendientes()
RETURNS TABLE (
  factura_id uuid,
  folio_factura text,
  fecha_factura date,
  fecha_limite_pago date,
  dias_credito integer,
  importe numeric,
  notas_credito numeric,
  importe_neto numeric,
  pagado numeric,
  saldo numeric,
  pagada boolean,
  dias_para_vencer integer,
  orden_id uuid,
  orden_folio text,
  orden_total numeric,
  compra_id uuid,
  proveedor_id uuid,
  proveedor_nombre text,
  sucursal_id uuid,
  sucursal_codigo text,
  pdf_path text,
  xml_path text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  WITH nc AS (
    SELECT factura_id, SUM(monto) AS monto FROM notas_credito_proveedor
    WHERE factura_id IS NOT NULL GROUP BY factura_id
  ), pg AS (
    SELECT factura_oc_id, SUM(monto) AS monto FROM pagos_cxp
    WHERE factura_oc_id IS NOT NULL GROUP BY factura_oc_id
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
    f.xml_path
  FROM ordenes_compra_facturas f
  JOIN ordenes_compra oc ON oc.id = f.orden_id
  LEFT JOIN proveedores p ON p.id = oc.proveedor_id
  LEFT JOIN sucursales s ON s.id = oc.sucursal_destino_id
  LEFT JOIN nc ON nc.factura_id = f.id
  LEFT JOIN pg ON pg.factura_oc_id = f.id
  WHERE oc.estado <> 'cancelada'
  ORDER BY f.fecha_limite_pago NULLS LAST, f.created_at;
$function$;

REVOKE ALL ON FUNCTION public.cxp_facturas_pendientes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cxp_facturas_pendientes() TO authenticated;

-- Pago de una factura de OC: siempre por el importe neto COMPLETO. No existe
-- parámetro de monto a propósito, para que un error de captura no pueda
-- colar un pago parcial.
CREATE OR REPLACE FUNCTION public.pagar_factura_oc(
  p_factura_id uuid,
  p_fecha date DEFAULT CURRENT_DATE,
  p_forma_pago text DEFAULT 'transferencia',
  p_referencia text DEFAULT NULL,
  p_banco_cuenta_id uuid DEFAULT NULL,
  p_notas text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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

  INSERT INTO pagos_cxp (compra_id, factura_oc_id, fecha, monto, forma_pago, referencia, banco_cuenta_id, notas, creado_por)
  VALUES (v_oc.compra_real_id, p_factura_id, COALESCE(p_fecha, CURRENT_DATE), v_neto,
          COALESCE(p_forma_pago, 'transferencia'), p_referencia, p_banco_cuenta_id,
          COALESCE(p_notas, 'Pago de factura ' || v_f.folio || ' (OC ' || v_oc.folio || ')'), auth.uid())
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

REVOKE ALL ON FUNCTION public.pagar_factura_oc(uuid, date, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pagar_factura_oc(uuid, date, text, text, uuid, text) TO authenticated;