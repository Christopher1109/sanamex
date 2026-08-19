-- 1) Asignación de entregas por repartidor
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS repartidor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ventas_repartidor ON public.ventas(repartidor_id) WHERE repartidor_id IS NOT NULL;

-- 2) Candado del método de pago en mostrador
CREATE OR REPLACE FUNCTION public.corregir_venta_pago_estatus(p_venta_id uuid, p_metodo_pago_corregido text, p_estatus_corregido text, p_motivo text DEFAULT NULL::text)
 RETURNS venta_correcciones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_metodo_anterior text;
  v_estatus_anterior text;
  v_row public.venta_correcciones;
  v_es_autorizado boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_estatus_corregido NOT IN ('concluida','en_ruta') THEN
    RAISE EXCEPTION 'estatus_corregido inválido: %', p_estatus_corregido;
  END IF;

  SELECT string_agg(mp.nombre, ' + '), v.estatus_entrega
    INTO v_metodo_anterior, v_estatus_anterior
    FROM public.ventas v
    LEFT JOIN public.venta_pagos vp ON vp.venta_id = v.id
    LEFT JOIN public.metodos_pago mp ON mp.id = vp.metodo_pago_id
   WHERE v.id = p_venta_id
   GROUP BY v.estatus_entrega;

  v_es_autorizado := has_role(auth.uid(),'super_admin'::app_role)
                  OR has_role(auth.uid(),'admin'::app_role)
                  OR has_role(auth.uid(),'direccion'::app_role)
                  OR has_role(auth.uid(),'gerente'::app_role)
                  OR has_role(auth.uid(),'subgerente'::app_role);

  -- Una venta de mostrador (no está en ruta) se concluye con el método que se
  -- capturó al cobrar: cambiarlo después es excepción y requiere gerente.
  IF COALESCE(v_estatus_anterior,'concluida') <> 'en_ruta' AND NOT v_es_autorizado THEN
    RAISE EXCEPTION 'El método de pago de una venta de mostrador ya concluida solo lo puede modificar un gerente o administrador';
  END IF;

  IF COALESCE(v_estatus_anterior,'concluida') <> 'en_ruta' AND COALESCE(btrim(p_motivo),'') = '' THEN
    RAISE EXCEPTION 'Indica el motivo de la excepción para modificar el método de pago';
  END IF;

  UPDATE public.ventas SET estatus_entrega = p_estatus_corregido WHERE id = p_venta_id;

  INSERT INTO public.venta_correcciones (
    venta_id, metodo_pago_anterior, metodo_pago_corregido,
    estatus_anterior, estatus_corregido, motivo, corregido_por
  ) VALUES (
    p_venta_id, v_metodo_anterior, p_metodo_pago_corregido,
    v_estatus_anterior, p_estatus_corregido, p_motivo, auth.uid()
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- 3) CxC: notas de crédito, saldo a favor, días restantes
DROP FUNCTION IF EXISTS public.cxc_resumen();
CREATE FUNCTION public.cxc_resumen()
 RETURNS TABLE(cliente_id uuid, cliente_nombre text, rfc text, dias_credito integer, limite_credito numeric,
               num_ventas bigint, total_credito numeric, abonado numeric, notas_credito numeric,
               saldo numeric, saldo_a_favor numeric, venta_mas_antigua date, dias_antiguedad integer,
               fecha_vencimiento date, dias_restantes integer, vencido boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH v AS (
    SELECT ventas.cliente_id, count(*) n, sum(total) t, min(fecha::date) f
      FROM public.ventas
     WHERE tipo_venta = 'credito' AND estado <> 'cancelada' AND ventas.cliente_id IS NOT NULL
     GROUP BY ventas.cliente_id
  ), a AS (
    SELECT cxc_abonos.cliente_id, sum(monto) m FROM public.cxc_abonos GROUP BY cxc_abonos.cliente_id
  ), nc AS (
    SELECT notas_credito_cliente.cliente_id, sum(monto) m
      FROM public.notas_credito_cliente GROUP BY notas_credito_cliente.cliente_id
  ), base AS (
    SELECT c.id, c.nombre, c.rfc, c.dias_credito, c.limite_credito,
           COALESCE(v.n,0) AS n, COALESCE(v.t,0) AS t, COALESCE(a.m,0) AS ab, COALESCE(nc.m,0) AS ncm,
           v.f AS f
      FROM public.clientes c
      LEFT JOIN v ON v.cliente_id = c.id
      LEFT JOIN a ON a.cliente_id = c.id
      LEFT JOIN nc ON nc.cliente_id = c.id
     WHERE COALESCE(v.n,0) > 0 OR COALESCE(a.m,0) > 0 OR COALESCE(nc.m,0) > 0
  )
  SELECT id, nombre, rfc, dias_credito, limite_credito, n, t, ab, ncm,
         GREATEST(t - ab - ncm, 0) AS saldo,
         GREATEST(ab + ncm - t, 0) AS saldo_a_favor,
         f,
         CASE WHEN f IS NOT NULL THEN (current_date - f)::int END,
         CASE WHEN f IS NOT NULL THEN (f + COALESCE(dias_credito,30)) END,
         CASE WHEN f IS NOT NULL THEN ((f + COALESCE(dias_credito,30)) - current_date)::int END,
         (t - ab - ncm) > 0.5 AND f IS NOT NULL AND (current_date - f) > COALESCE(dias_credito,30)
    FROM base
   ORDER BY (t - ab - ncm) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.cxc_registrar_abono(p_cliente_id uuid, p_monto numeric, p_fecha date, p_metodo_pago text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_comprobante_url text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_venta_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto del abono debe ser mayor a cero'; END IF;

  -- El excedente sobre el saldo NO se rechaza: queda como saldo a favor del
  -- cliente (caso pedido en la junta: nota de crédito posterior a un pago).
  INSERT INTO public.cxc_abonos (cliente_id, venta_id, monto, fecha, metodo_pago, referencia, comprobante_url, notas, created_by)
  VALUES (p_cliente_id, p_venta_id, p_monto, COALESCE(p_fecha, current_date), p_metodo_pago, p_referencia, p_comprobante_url, p_notas, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END; $function$;

-- 4) Conciliación: reparto del cobro de un cliente entre varias ventas a crédito
DROP FUNCTION IF EXISTS public.conciliacion_enviar_a_cuenta(uuid, text, uuid, uuid, uuid[]);
CREATE FUNCTION public.conciliacion_enviar_a_cuenta(
  p_conciliacion_id uuid, p_entidad_tipo text, p_entidad_id uuid, p_cuenta_contable_id uuid,
  p_compra_ids uuid[] DEFAULT NULL::uuid[], p_venta_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conc record; v_mov record; v_cuenta_banco_id uuid; v_poliza_id uuid;
  v_monto numeric; v_restante numeric; v_compra_id uuid; v_venta_id uuid;
  v_aplicar numeric; v_compra record; v_venta record; v_pagado_previo numeric;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
       OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'contraloria'::app_role)) THEN
    RAISE EXCEPTION 'Sin permiso para aplicar conciliaciones a cuentas contables';
  END IF;
  IF p_entidad_tipo NOT IN ('cliente','proveedor') THEN
    RAISE EXCEPTION 'entidad_tipo inválido: %', p_entidad_tipo;
  END IF;

  SELECT * INTO v_conc FROM conciliacion_bancaria WHERE id = p_conciliacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conciliación no encontrada'; END IF;
  IF v_conc.enviado_a_cuenta THEN RAISE EXCEPTION 'Esta conciliación ya fue enviada a cuenta'; END IF;

  SELECT * INTO v_mov FROM movimientos_bancarios WHERE id = v_conc.movimiento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento bancario no encontrado'; END IF;

  SELECT cuenta_contable_id INTO v_cuenta_banco_id FROM cuentas_bancarias WHERE id = v_mov.cuenta_id;
  IF v_cuenta_banco_id IS NULL THEN
    RAISE EXCEPTION 'La cuenta bancaria % no tiene una cuenta contable vinculada (cuentas_bancarias.cuenta_contable_id)', v_mov.cuenta_id;
  END IF;

  v_monto := GREATEST(COALESCE(v_mov.abono,0), COALESCE(v_mov.cargo,0));
  IF v_monto <= 0 THEN RAISE EXCEPTION 'El movimiento bancario no tiene monto válido'; END IF;

  INSERT INTO polizas (tipo, fecha, concepto, estatus, origen, origen_referencia_tipo, origen_referencia_id, created_by)
  VALUES (
    CASE WHEN v_mov.abono > 0 THEN 'ingreso' ELSE 'egreso' END,
    v_mov.fecha,
    'Conciliación bancaria: ' || COALESCE(v_mov.concepto,'') || CASE WHEN v_mov.referencia IS NOT NULL THEN ' — ref. ' || v_mov.referencia ELSE '' END,
    'borrador', 'automatica', 'conciliacion_bancaria', p_conciliacion_id, auth.uid()
  ) RETURNING id INTO v_poliza_id;

  IF v_mov.abono > 0 THEN
    INSERT INTO poliza_movimientos (poliza_id, cuenta_id, cargo, abono, concepto) VALUES
      (v_poliza_id, v_cuenta_banco_id, v_monto, 0, 'Depósito conciliado'),
      (v_poliza_id, p_cuenta_contable_id, 0, v_monto, 'Aplicación de cobro');
  ELSE
    INSERT INTO poliza_movimientos (poliza_id, cuenta_id, cargo, abono, concepto) VALUES
      (v_poliza_id, v_cuenta_banco_id, 0, v_monto, 'Cargo bancario conciliado'),
      (v_poliza_id, p_cuenta_contable_id, v_monto, 0, 'Aplicación de pago');
  END IF;

  UPDATE polizas SET total_cargo = v_monto, total_abono = v_monto, estatus = 'autorizada' WHERE id = v_poliza_id;

  UPDATE conciliacion_bancaria SET
    enviado_a_cuenta = true, entidad_tipo = p_entidad_tipo, entidad_id = p_entidad_id,
    cuenta_contable_id = p_cuenta_contable_id, poliza_id = v_poliza_id,
    enviado_por = auth.uid(), enviado_en = now()
  WHERE id = p_conciliacion_id;

  IF p_entidad_tipo = 'proveedor' AND p_compra_ids IS NOT NULL THEN
    v_restante := v_monto;
    FOR v_compra_id IN SELECT unnest(p_compra_ids) LOOP
      EXIT WHEN v_restante <= 0;
      SELECT * INTO v_compra FROM compras WHERE id = v_compra_id;
      CONTINUE WHEN NOT FOUND;
      SELECT COALESCE(SUM(monto),0) INTO v_pagado_previo FROM pagos_cxp WHERE compra_id = v_compra_id;
      v_aplicar := LEAST(v_restante, v_compra.total - v_pagado_previo);
      IF v_aplicar > 0 THEN
        INSERT INTO pagos_cxp (compra_id, fecha, monto, forma_pago, referencia, notas, creado_por)
        VALUES (v_compra_id, v_mov.fecha, v_aplicar, 'transferencia', v_mov.referencia,
                'Aplicado desde conciliación bancaria', auth.uid());
        IF (v_pagado_previo + v_aplicar) >= (v_compra.total - 0.5) THEN
          UPDATE compras SET pagada = true, estado = 'pagada', fecha_pago_real = v_mov.fecha WHERE id = v_compra_id;
        END IF;
        v_restante := v_restante - v_aplicar;
      END IF;
    END LOOP;
  END IF;

  -- Cliente: reparte el depósito entre las ventas a crédito seleccionadas,
  -- generando abonos (descuenta el historial de crédito del cliente).
  IF p_entidad_tipo = 'cliente' AND p_venta_ids IS NOT NULL THEN
    v_restante := v_monto;
    FOR v_venta_id IN SELECT unnest(p_venta_ids) LOOP
      EXIT WHEN v_restante <= 0;
      SELECT * INTO v_venta FROM ventas WHERE id = v_venta_id;
      CONTINUE WHEN NOT FOUND;
      SELECT COALESCE(SUM(monto),0) INTO v_pagado_previo FROM cxc_abonos WHERE venta_id = v_venta_id;
      v_aplicar := LEAST(v_restante, v_venta.total - v_pagado_previo);
      IF v_aplicar > 0 THEN
        INSERT INTO cxc_abonos (cliente_id, venta_id, monto, fecha, metodo_pago, referencia, notas, created_by)
        VALUES (p_entidad_id, v_venta_id, v_aplicar, v_mov.fecha, 'transferencia', v_mov.referencia,
                'Aplicado desde conciliación bancaria', auth.uid());
        v_restante := v_restante - v_aplicar;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('poliza_id', v_poliza_id, 'monto', v_monto, 'sin_aplicar', COALESCE(v_restante, 0));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cxc_resumen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.conciliacion_enviar_a_cuenta(uuid, text, uuid, uuid, uuid[], uuid[]) TO authenticated;