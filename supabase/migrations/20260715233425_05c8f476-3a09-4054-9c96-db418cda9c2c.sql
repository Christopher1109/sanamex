-- B1: Trigger Compras -> Cuentas por Pagar
-- Idempotente. Respeta contabilidad_parametros.fecha_corte_automatico.
-- Solo actúa sobre compras a crédito (dias_credito > 0 o metodo_pago = 'credito').

CREATE OR REPLACE FUNCTION public.tg_compras_to_cxp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_corte DATE;
  v_fecha DATE;
  v_es_credito BOOLEAN;
  v_dias INT;
  v_venc DATE;
  v_existing_id UUID;
BEGIN
  -- Compras canceladas: ignorar (no crear ni actualizar).
  IF NEW.estado = 'cancelada' THEN
    RETURN NEW;
  END IF;

  -- Fecha de corte Go-Live.
  SELECT fecha_corte_automatico INTO v_corte
    FROM public.contabilidad_parametros
   WHERE id = 1;
  v_corte := COALESCE(v_corte, CURRENT_DATE);

  v_fecha := COALESCE(NEW.fecha_factura, (NEW.created_at AT TIME ZONE 'UTC')::date);

  -- Compra anterior al corte: no generar CxP automática.
  IF v_fecha < v_corte THEN
    RETURN NEW;
  END IF;

  v_dias := COALESCE(NEW.dias_credito, 0);
  v_es_credito := (NEW.metodo_pago = 'credito') OR (v_dias > 0);

  -- Compras de contado: no generan CxP.
  IF NOT v_es_credito THEN
    RETURN NEW;
  END IF;

  -- Sin monto total: no crear.
  IF COALESCE(NEW.total, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_venc := COALESCE(NEW.fecha_pago_limite, v_fecha + v_dias);

  -- ¿Ya existe CxP para esta compra?
  SELECT id INTO v_existing_id
    FROM public.cuentas_por_pagar
   WHERE compra_id = NEW.id
   LIMIT 1;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.cuentas_por_pagar (
      compra_id, proveedor_id, monto, monto_pagado,
      fecha_emision, fecha_vencimiento, estado, notas
    ) VALUES (
      NEW.id, NEW.proveedor_id, NEW.total, 0,
      v_fecha, v_venc, 'pendiente',
      'Generada automáticamente desde compra ' || NEW.numero_compra
    );
  ELSE
    -- Sincronizar solo si la CxP sigue pendiente (no tocar si ya hubo pagos parciales
    -- que cambiarían el saldo — se actualiza monto/vencimiento pero no monto_pagado).
    UPDATE public.cuentas_por_pagar
       SET monto = NEW.total,
           fecha_emision = v_fecha,
           fecha_vencimiento = v_venc,
           proveedor_id = NEW.proveedor_id,
           updated_at = now()
     WHERE id = v_existing_id
       AND estado = 'pendiente';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS compras_to_cxp_trg ON public.compras;

CREATE TRIGGER compras_to_cxp_trg
AFTER INSERT OR UPDATE OF total, fecha_factura, fecha_pago_limite, dias_credito, metodo_pago, estado, proveedor_id
ON public.compras
FOR EACH ROW
EXECUTE FUNCTION public.tg_compras_to_cxp();

COMMENT ON FUNCTION public.tg_compras_to_cxp() IS
  'B1 (jul-2026): genera/sincroniza CxP desde compras a crédito con fecha >= fecha_corte_automatico. Idempotente.';