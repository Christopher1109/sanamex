
-- C1: permitir estado 'nota_credito' en CxP
ALTER TABLE public.cuentas_por_pagar DROP CONSTRAINT IF EXISTS cuentas_por_pagar_estado_check;
ALTER TABLE public.cuentas_por_pagar
  ADD CONSTRAINT cuentas_por_pagar_estado_check
  CHECK (estado IN ('pendiente','parcial','pagada','vencida','cancelada','nota_credito'));

-- C1: trigger devolución proveedor → nota de crédito en CxP (idempotente)
CREATE OR REPLACE FUNCTION public.tg_devolucion_prov_to_cxp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_corte date;
  v_marker text := 'DEV_PROV:' || NEW.id::text;
BEGIN
  SELECT fecha_corte_automatico INTO v_corte FROM public.contabilidad_parametros WHERE id = 1;
  IF v_corte IS NULL THEN v_corte := CURRENT_DATE; END IF;
  IF NEW.fecha < v_corte THEN RETURN NEW; END IF;
  IF COALESCE(NEW.total,0) <= 0 THEN RETURN NEW; END IF;

  -- Idempotencia: no duplicar la nota de crédito para la misma devolución
  IF EXISTS (
    SELECT 1 FROM public.cuentas_por_pagar
    WHERE proveedor_id = NEW.proveedor_id AND notas LIKE '%' || v_marker || '%'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.cuentas_por_pagar
    (proveedor_id, monto, monto_pagado, fecha_emision, fecha_vencimiento, estado, notas)
  VALUES
    (NEW.proveedor_id, NEW.total, 0, NEW.fecha, NEW.fecha, 'nota_credito',
     'Nota de crédito por devolución ' || COALESCE(NEW.numero_devolucion,'') ||
     ' — ' || COALESCE(NEW.motivo,'') || ' [' || v_marker || ']');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS devolucion_prov_to_cxp_trg ON public.devoluciones_proveedor;
CREATE TRIGGER devolucion_prov_to_cxp_trg
AFTER INSERT ON public.devoluciones_proveedor
FOR EACH ROW EXECUTE FUNCTION public.tg_devolucion_prov_to_cxp();

-- C1 y C2: nuevas reglas contables (PENDIENTE — contador debe fijar cuentas)
INSERT INTO public.reglas_contabilizacion (origen, descripcion, activo, cuenta_cargo_id, cuenta_abono_id)
VALUES
  ('devolucion_proveedor',
   'Devolución a proveedor (Proveedores → Inventario) PENDIENTE DE CONFIRMAR CON CONTADOR',
   false, NULL, NULL),
  ('costo_venta',
   'Costo de ventas agrupado diario (Costo de ventas → Inventario) PENDIENTE DE CONFIRMAR CON CONTADOR',
   false, NULL, NULL)
ON CONFLICT (origen) DO NOTHING;
