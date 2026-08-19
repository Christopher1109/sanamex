-- Junta SANAMEX 15-ago-2026, punto "Notas de crédito, pagos parciales y
-- cuentas por cobrar": Contabilidad planteó el cálculo del saldo cuando una
-- factura tiene pagos parciales y notas de crédito. Se acordó incorporar la
-- disminución correspondiente y reflejar los saldos a favor.
--
-- Hoy solo existe notas_credito_proveedor (lado CxP). Esta migración agrega
-- el equivalente del lado cliente/CxC, siguiendo el mismo patrón (ver
-- 20260730070000_contabilidad_fiscal_fase1.sql).
--
-- IMPORTANTE: la función `cxc_resumen` que usa CuentasPorCobrarPage.tsx y el
-- nuevo reporte de Reportes Administrativos NO está en las migraciones de
-- este repo (se creó fuera de git), así que esta migración NO la toca para
-- no arriesgar redefinir a ciegas un cálculo financiero que ya está en
-- producción. El saldo ajustado por notas de crédito se calcula por ahora
-- en el frontend (ver CuentasPorCobrarPage.tsx). Pendiente: alguien con
-- acceso a la base real debe extraer la definición actual de `cxc_resumen`
-- (pg_get_functiondef), meterla a una migración, y ahí sí restar
-- notas_credito_cliente para que el saldo "oficial" (el que valida el tope
-- de abonos) ya la incluya.

CREATE TABLE IF NOT EXISTS public.notas_credito_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  venta_id uuid REFERENCES public.ventas(id),
  monto numeric NOT NULL CHECK (monto > 0),
  motivo text,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  aplicada boolean NOT NULL DEFAULT true,
  creada_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notas_credito_cliente IS
  'Notas de crédito a favor del cliente (devoluciones, ajustes, descuentos posteriores a la venta) que disminuyen su saldo en Cuentas por Cobrar. Ver cxc_resumen para el cálculo agregado de saldo por cliente — pendiente de actualizar server-side para restar esta tabla.';

GRANT SELECT, INSERT, UPDATE ON public.notas_credito_cliente TO authenticated;
GRANT ALL ON public.notas_credito_cliente TO service_role;
ALTER TABLE public.notas_credito_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "NC cliente lectura" ON public.notas_credito_cliente;
CREATE POLICY "NC cliente lectura" ON public.notas_credito_cliente
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "NC cliente escritura" ON public.notas_credito_cliente;
CREATE POLICY "NC cliente escritura" ON public.notas_credito_cliente
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'contraloria'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'contraloria'::app_role));

CREATE OR REPLACE FUNCTION public.crear_nota_credito_cliente(
  p_cliente_id uuid,
  p_monto numeric,
  p_motivo text DEFAULT NULL,
  p_venta_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folio text;
  v_nc_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
          OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'contraloria'::app_role)) THEN
    RAISE EXCEPTION 'No tienes permiso para registrar notas de crédito de cliente';
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto de la nota de crédito debe ser mayor a cero';
  END IF;

  SELECT 'NCC-' || LPAD(COALESCE(MAX(SUBSTRING(folio FROM 6)::int), 0) + 1::text, 6, '0')
    INTO v_folio
    FROM public.notas_credito_cliente
    WHERE folio ~ '^NCC-\d+$';

  INSERT INTO public.notas_credito_cliente (folio, cliente_id, venta_id, monto, motivo, creada_por)
  VALUES (v_folio, p_cliente_id, p_venta_id, p_monto, p_motivo, auth.uid())
  RETURNING id INTO v_nc_id;

  RETURN v_nc_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_nota_credito_cliente(uuid, numeric, text, uuid) TO authenticated;
