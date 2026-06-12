
-- 1. Add columns to compras for CFDI / credit
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS rfc_emisor text,
  ADD COLUMN IF NOT EXISTS uuid_cfdi text UNIQUE,
  ADD COLUMN IF NOT EXISTS folio_factura text,
  ADD COLUMN IF NOT EXISTS xml_url text,
  ADD COLUMN IF NOT EXISTS dias_credito integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metodo_pago text DEFAULT 'contado';

-- 2. Folio sequence + generator
CREATE SEQUENCE IF NOT EXISTS public.compra_folio_seq;

CREATE OR REPLACE FUNCTION public.generar_folio_compra()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_seq int;
BEGIN
  v_seq := nextval('public.compra_folio_seq');
  RETURN 'COMP-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' || LPAD(v_seq::text, 5, '0');
END $$;

-- 3. cuentas_por_pagar table
CREATE TABLE IF NOT EXISTS public.cuentas_por_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid REFERENCES public.compras(id) ON DELETE SET NULL,
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id),
  monto numeric NOT NULL,
  monto_pagado numeric NOT NULL DEFAULT 0,
  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento date NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','parcial','pagada','vencida','cancelada')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cuentas_por_pagar TO authenticated;
GRANT ALL ON public.cuentas_por_pagar TO service_role;

ALTER TABLE public.cuentas_por_pagar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cxp_select_staff" ON public.cuentas_por_pagar;
CREATE POLICY "cxp_select_staff" ON public.cuentas_por_pagar
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'gerente'::app_role)
    OR public.has_role(auth.uid(),'compras'::app_role)
    OR public.has_role(auth.uid(),'auditoria'::app_role)
  );

DROP POLICY IF EXISTS "cxp_write_staff" ON public.cuentas_por_pagar;
CREATE POLICY "cxp_write_staff" ON public.cuentas_por_pagar
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'gerente'::app_role)
    OR public.has_role(auth.uid(),'compras'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'gerente'::app_role)
    OR public.has_role(auth.uid(),'compras'::app_role)
  );

DROP TRIGGER IF EXISTS trg_cxp_updated ON public.cuentas_por_pagar;
CREATE TRIGGER trg_cxp_updated
  BEFORE UPDATE ON public.cuentas_por_pagar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. registrar_compra: atomic insert compra + lineas + lotes + inventario + movs + CxP
-- p_lineas: jsonb array of {producto_id, cantidad, precio_unitario, numero_lote, fecha_caducidad}
CREATE OR REPLACE FUNCTION public.registrar_compra(
  p_proveedor_id uuid,
  p_sucursal_id uuid,
  p_almacen_id uuid,
  p_lineas jsonb,
  p_folio_factura text DEFAULT NULL,
  p_fecha_factura date DEFAULT CURRENT_DATE,
  p_rfc_emisor text DEFAULT NULL,
  p_uuid_cfdi text DEFAULT NULL,
  p_xml_url text DEFAULT NULL,
  p_metodo_pago text DEFAULT 'contado',
  p_dias_credito integer DEFAULT 0,
  p_notas text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra_id uuid;
  v_numero text;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_iva numeric := 0;
  v_total numeric := 0;
  v_lote_id uuid;
  v_user uuid := auth.uid();
  v_line_sub numeric;
  v_cant int;
  v_precio numeric;
  v_lote_num text;
  v_fec_cad date;
  v_prod_id uuid;
  v_cxp_id uuid;
  v_dup_compra uuid;
BEGIN
  IF p_uuid_cfdi IS NOT NULL THEN
    SELECT id INTO v_dup_compra FROM public.compras WHERE uuid_cfdi = p_uuid_cfdi LIMIT 1;
    IF v_dup_compra IS NOT NULL THEN
      RAISE EXCEPTION 'Esta factura (UUID %) ya fue registrada en la compra %', p_uuid_cfdi, v_dup_compra;
    END IF;
  END IF;

  v_numero := public.generar_folio_compra();

  INSERT INTO public.compras(
    numero_compra, proveedor_id, sucursal_id, almacen_id, estado,
    subtotal, impuestos, total, notas, creado_por,
    fecha_factura, folio_factura, rfc_emisor, uuid_cfdi, xml_url,
    metodo_pago, dias_credito, fecha_pago_limite, pagada
  ) VALUES (
    v_numero, p_proveedor_id, p_sucursal_id, p_almacen_id, 'recibida',
    0, 0, 0, p_notas, v_user,
    p_fecha_factura, p_folio_factura, p_rfc_emisor, p_uuid_cfdi, p_xml_url,
    p_metodo_pago, COALESCE(p_dias_credito,0),
    CASE WHEN COALESCE(p_dias_credito,0) > 0 THEN p_fecha_factura + p_dias_credito ELSE NULL END,
    (COALESCE(p_dias_credito,0) = 0 AND LOWER(p_metodo_pago) = 'contado')
  ) RETURNING id INTO v_compra_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_prod_id := (v_item->>'producto_id')::uuid;
    v_cant    := (v_item->>'cantidad')::int;
    v_precio  := (v_item->>'precio_unitario')::numeric;
    v_lote_num := COALESCE(NULLIF(v_item->>'numero_lote',''),
                           'COMP-'||SUBSTRING(v_compra_id::text,1,8)||'-'||TO_CHAR(now(),'YYYYMMDDHH24MISS'));
    v_fec_cad  := NULLIF(v_item->>'fecha_caducidad','')::date;

    IF v_prod_id IS NULL OR v_cant IS NULL OR v_cant <= 0 OR v_precio IS NULL THEN
      RAISE EXCEPTION 'Línea inválida: %', v_item;
    END IF;

    v_line_sub := v_cant * v_precio;
    v_subtotal := v_subtotal + v_line_sub;

    INSERT INTO public.compra_lineas(
      compra_id, producto_id, cantidad_ordenada, cantidad_recibida,
      precio_unitario_estimado, precio_unitario_real,
      lote_asignado, fecha_caducidad
    ) VALUES (
      v_compra_id, v_prod_id, v_cant, v_cant, v_precio, v_precio,
      v_lote_num, v_fec_cad
    );

    INSERT INTO public.lotes(producto_id, numero_lote, costo_unitario, fecha_caducidad, fecha_recepcion, proveedor_id)
    VALUES (v_prod_id, v_lote_num, v_precio, v_fec_cad, CURRENT_DATE, p_proveedor_id)
    RETURNING id INTO v_lote_id;

    INSERT INTO public.inventario(almacen_id, lote_id, cantidad)
    VALUES (p_almacen_id, v_lote_id, v_cant);

    INSERT INTO public.movimientos_inventario(
      almacen_id, lote_id, tipo, cantidad, costo_unitario,
      referencia_tipo, referencia_id, sucursal_id, usuario_id, notas
    ) VALUES (
      p_almacen_id, v_lote_id, 'entrada', v_cant, v_precio,
      'compra', v_compra_id, p_sucursal_id, v_user,
      'Compra '||v_numero
    );
  END LOOP;

  v_iva := ROUND(v_subtotal * 0.16, 2);
  v_total := ROUND(v_subtotal + v_iva, 2);

  UPDATE public.compras
    SET subtotal = v_subtotal, impuestos = v_iva, total = v_total
    WHERE id = v_compra_id;

  -- Cuentas por pagar si es crédito
  IF COALESCE(p_dias_credito,0) > 0 THEN
    INSERT INTO public.cuentas_por_pagar(
      compra_id, proveedor_id, monto, fecha_emision, fecha_vencimiento, estado
    ) VALUES (
      v_compra_id, p_proveedor_id, v_total, p_fecha_factura,
      p_fecha_factura + p_dias_credito, 'pendiente'
    ) RETURNING id INTO v_cxp_id;
  END IF;

  RETURN jsonb_build_object(
    'compra_id', v_compra_id,
    'numero_compra', v_numero,
    'subtotal', v_subtotal,
    'iva', v_iva,
    'total', v_total,
    'cxp_id', v_cxp_id
  );
END $$;
