-- =========================================================
-- Sesión 30-jul-2026: Contabilidad fiscal — notas de crédito de
-- proveedor, clasificación de facturación urgente/acumulable, y
-- conciliación bancaria -> cuenta deudora/acreedora con póliza automática.
--
-- OJO — hallazgo importante durante esta sesión: el sistema tiene DOS
-- conceptos de "compra" que NO comparten ID:
--   - ordenes_compra: el flujo del Cotizador (grupo/orden madre, revisión
--     de gerente, autorización de admin).
--   - compras + pagos_cxp: la fuente de verdad real para Cuentas por Pagar
--     (así lo usa CuentasPorPagarPage.tsx y lo dice explícito el comentario
--     en src/lib/cxp.ts: "Única fuente de verdad para registrar un pago").
-- Las notas de crédito y la conciliación de este archivo se enlazan contra
-- `compras`, no contra `cuentas_por_pagar` (esa tabla existe pero no es la
-- que se ve en pantalla — quedó como hallazgo para revisar aparte).
-- =========================================================

-- ---------------------------------------------------------
-- 1) Notas de crédito de proveedor (3 tipos)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notas_credito_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL,
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id),
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['incidencia','negociada','objetivo_trimestral'])),
  monto numeric NOT NULL CHECK (monto > 0),
  motivo text,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  compra_id uuid REFERENCES public.compras(id),
  producto_id uuid REFERENCES public.productos(id),
  cantidad_incidencia integer,
  lote_id uuid REFERENCES public.lotes(id),
  es_retroactiva boolean NOT NULL DEFAULT false,
  periodo_inicio date,
  periodo_fin date,
  aplicada boolean NOT NULL DEFAULT false,
  poliza_id uuid REFERENCES public.polizas(id),
  creada_por uuid,
  aplicada_por uuid,
  aplicada_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.notas_credito_proveedor.cantidad_incidencia IS
  'Cantidad de piezas asociada al ajuste. Para tipo=incidencia: piezas faltantes a descontar de inventario. Para tipo=negociada: piezas sobre las que se prorratea el descuento de costo unitario (monto / cantidad_incidencia).';
COMMENT ON TABLE public.notas_credito_proveedor IS
  'tipo=incidencia: faltante de piezas, ajusta inventario de inmediato. tipo=negociada: descuento por volumen/protección de precio, impacta costo_unitario del lote. tipo=objetivo_trimestral: beneficio financiero, no toca costo ni inventario; es_retroactiva queda como bandera informativa — la lógica de recálculo retroactivo de rentabilidad histórica NO está implementada todavía (pendiente de definir viabilidad con el cliente). compra_id referencia compras(id) (la fuente de verdad real de CxP), NO ordenes_compra.';

GRANT SELECT, INSERT, UPDATE ON public.notas_credito_proveedor TO authenticated;
GRANT ALL ON public.notas_credito_proveedor TO service_role;
ALTER TABLE public.notas_credito_proveedor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "NC proveedor lectura" ON public.notas_credito_proveedor;
CREATE POLICY "NC proveedor lectura" ON public.notas_credito_proveedor
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "NC proveedor escritura" ON public.notas_credito_proveedor;
CREATE POLICY "NC proveedor escritura" ON public.notas_credito_proveedor
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'contraloria'::app_role) OR has_role(auth.uid(),'compras'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'contraloria'::app_role) OR has_role(auth.uid(),'compras'::app_role));

CREATE OR REPLACE FUNCTION public.crear_nota_credito_proveedor(
  p_proveedor_id uuid,
  p_tipo text,
  p_monto numeric,
  p_motivo text DEFAULT NULL,
  p_compra_id uuid DEFAULT NULL,
  p_producto_id uuid DEFAULT NULL,
  p_cantidad_incidencia integer DEFAULT NULL,
  p_lote_id uuid DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_es_retroactiva boolean DEFAULT false,
  p_periodo_inicio date DEFAULT NULL,
  p_periodo_fin date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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
       OR has_role(auth.uid(),'compras'::app_role)) THEN
    RAISE EXCEPTION 'Sin permiso para crear notas de crédito de proveedor';
  END IF;
  IF p_tipo NOT IN ('incidencia','negociada','objetivo_trimestral') THEN
    RAISE EXCEPTION 'Tipo de nota de crédito inválido: %', p_tipo;
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto de la nota de crédito debe ser mayor a cero';
  END IF;

  v_folio := 'NC-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,4);

  INSERT INTO notas_credito_proveedor
    (folio, proveedor_id, tipo, monto, motivo, compra_id, producto_id,
     cantidad_incidencia, lote_id, es_retroactiva, periodo_inicio, periodo_fin, creada_por)
  VALUES
    (v_folio, p_proveedor_id, p_tipo, p_monto, p_motivo, p_compra_id, p_producto_id,
     p_cantidad_incidencia, p_lote_id, p_es_retroactiva, p_periodo_inicio, p_periodo_fin, auth.uid())
  RETURNING id INTO v_nc_id;

  -- Aplica contra la COMPRA real (compras + pagos_cxp).
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

  IF p_tipo = 'negociada' AND p_lote_id IS NOT NULL AND p_cantidad_incidencia IS NOT NULL AND p_cantidad_incidencia > 0 THEN
    v_ajuste_unitario := p_monto / p_cantidad_incidencia;
    UPDATE lotes SET costo_unitario = GREATEST(costo_unitario - v_ajuste_unitario, 0) WHERE id = p_lote_id;
  END IF;

  UPDATE notas_credito_proveedor SET aplicada = true, aplicada_por = auth.uid(), aplicada_en = now() WHERE id = v_nc_id;

  RETURN jsonb_build_object('id', v_nc_id, 'folio', v_folio);
END;
$function$;

-- ---------------------------------------------------------
-- 2) Facturación: distinguir "requiere factura" (urgente, mismo día)
--    de público en general (acumulable, se timbra en lote)
-- ---------------------------------------------------------
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS requiere_factura boolean;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS requiere_factura boolean;

COMMENT ON COLUMN public.ventas.requiere_factura IS
  'NULL = no clasificado (se trata como público en general / acumulable). true = cliente pidió factura específica, debe timbrarse el mismo día. false = confirmado que no requiere factura individual.';

UPDATE public.ventas SET requiere_factura = true WHERE requiere_factura IS NULL AND cliente_id IS NOT NULL;
UPDATE public.pedidos SET requiere_factura = true WHERE requiere_factura IS NULL AND cliente_id IS NOT NULL;

-- ---------------------------------------------------------
-- 3) Conciliación bancaria -> cuenta deudora/acreedora con póliza automática
-- ---------------------------------------------------------
ALTER TABLE public.conciliacion_bancaria
  ADD COLUMN IF NOT EXISTS enviado_a_cuenta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entidad_tipo text,
  ADD COLUMN IF NOT EXISTS entidad_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta_contable_id uuid REFERENCES public.catalogo_cuentas(id),
  ADD COLUMN IF NOT EXISTS poliza_id uuid REFERENCES public.polizas(id),
  ADD COLUMN IF NOT EXISTS enviado_por uuid,
  ADD COLUMN IF NOT EXISTS enviado_en timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conciliacion_bancaria_entidad_tipo_check') THEN
    ALTER TABLE public.conciliacion_bancaria
      ADD CONSTRAINT conciliacion_bancaria_entidad_tipo_check
      CHECK (entidad_tipo IS NULL OR entidad_tipo IN ('cliente','proveedor'));
  END IF;
END $$;

-- NOTA sobre el trigger check_poliza_balanceada (ya existente): exige que,
-- para poner estatus='autorizada' en una póliza, YA existan filas en
-- poliza_movimientos para esa póliza. Por eso esta función crea la póliza
-- en 'borrador', inserta los movimientos, y HASTA AL FINAL la pasa a
-- 'autorizada'. (Este mismo patrón se corrigió también en el flujo manual de
-- "Nueva póliza" del frontend, ContabilidadPage.tsx, que tenía el mismo
-- problema: intentaba crear la póliza ya autorizada, antes de insertar
-- ningún movimiento.)
CREATE OR REPLACE FUNCTION public.conciliacion_enviar_a_cuenta(
  p_conciliacion_id uuid,
  p_entidad_tipo text,
  p_entidad_id uuid,
  p_cuenta_contable_id uuid,
  p_compra_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_conc record;
  v_mov record;
  v_cuenta_banco_id uuid;
  v_poliza_id uuid;
  v_monto numeric;
  v_restante numeric;
  v_compra_id uuid;
  v_aplicar numeric;
  v_compra record;
  v_pagado_previo numeric;
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

  RETURN jsonb_build_object('poliza_id', v_poliza_id, 'monto', v_monto);
END;
$function$;
