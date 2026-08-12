ALTER TABLE public.ordenes_compra_facturas
  ADD COLUMN IF NOT EXISTS dias_credito integer,
  ADD COLUMN IF NOT EXISTS fecha_limite_pago date;

COMMENT ON COLUMN public.ordenes_compra_facturas.fecha_limite_pago IS
  'Fecha límite de pago calculada = fecha_factura + dias_credito (del proveedor o capturados a mano).';

CREATE OR REPLACE FUNCTION public.agregar_factura_oc(
  p_orden_id uuid,
  p_folio text,
  p_fecha_factura date DEFAULT NULL,
  p_importe numeric DEFAULT NULL,
  p_dias_credito integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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

  -- Validación financiera: la suma de las facturas de la orden no puede
  -- exceder el total de la orden (0.5% de tolerancia por redondeos del proveedor).
  v_total := COALESCE(v_oc.total, 0);
  SELECT COALESCE(SUM(importe), 0) INTO v_otras
  FROM ordenes_compra_facturas
  WHERE orden_id = p_orden_id AND folio <> btrim(p_folio);

  IF p_importe IS NOT NULL AND v_total > 0
     AND (v_otras + p_importe) > (v_total * 1.005) THEN
    RAISE EXCEPTION 'La suma de facturas ($%) excede el total de la orden ($%). Ya facturado: $%. Excedente: $%',
      round(v_otras + p_importe, 2), round(v_total, 2), round(v_otras, 2), round(v_otras + p_importe - v_total, 2);
  END IF;

  -- Días de crédito: los capturados, o los del catálogo del proveedor.
  v_dias := p_dias_credito;
  IF v_dias IS NULL THEN
    SELECT dias_credito INTO v_dias FROM proveedores WHERE id = v_oc.proveedor_id;
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

  -- Recalcula la fecha límite si quedó sin ella pero ya hay fecha y días.
  UPDATE ordenes_compra_facturas
  SET fecha_limite_pago = fecha_factura + COALESCE(dias_credito, 0)
  WHERE id = v_factura_id AND fecha_factura IS NOT NULL AND fecha_limite_pago IS NULL;

  RETURN v_factura_id;
END;
$function$;

-- Resumen de facturación por orden de compra: cuánto se ha facturado, cuánto
-- falta y cuál es el vencimiento más próximo.
CREATE OR REPLACE FUNCTION public.oc_facturacion_resumen(p_orden_id uuid)
RETURNS TABLE (
  orden_id uuid,
  total_orden numeric,
  total_facturado numeric,
  saldo_por_facturar numeric,
  facturas_count integer,
  proximo_vencimiento date
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $function$
  SELECT
    oc.id,
    COALESCE(oc.total, 0),
    COALESCE(SUM(f.importe), 0),
    GREATEST(COALESCE(oc.total, 0) - COALESCE(SUM(f.importe), 0), 0),
    COUNT(f.id)::integer,
    MIN(f.fecha_limite_pago)
  FROM ordenes_compra oc
  LEFT JOIN ordenes_compra_facturas f ON f.orden_id = oc.id
  WHERE oc.id = p_orden_id
  GROUP BY oc.id, oc.total;
$function$;

GRANT EXECUTE ON FUNCTION public.oc_facturacion_resumen(uuid) TO authenticated;