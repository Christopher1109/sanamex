ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS tipo_venta text NOT NULL DEFAULT 'contado';
ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ventas_tipo_venta_check;
ALTER TABLE public.ventas ADD CONSTRAINT ventas_tipo_venta_check CHECK (tipo_venta IN ('contado','credito'));
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS tipo_venta text NOT NULL DEFAULT 'contado';
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_tipo_venta_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_tipo_venta_check CHECK (tipo_venta IN ('contado','credito'));

CREATE TABLE IF NOT EXISTS public.cxc_abonos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
  monto numeric NOT NULL CHECK (monto > 0),
  fecha date NOT NULL DEFAULT current_date,
  metodo_pago text,
  referencia text,
  comprobante_url text,
  notas text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.cxc_abonos TO authenticated;
GRANT ALL ON public.cxc_abonos TO service_role;
ALTER TABLE public.cxc_abonos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cxc_abonos_select" ON public.cxc_abonos;
CREATE POLICY "cxc_abonos_select" ON public.cxc_abonos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cxc_abonos_insert" ON public.cxc_abonos;
CREATE POLICY "cxc_abonos_insert" ON public.cxc_abonos FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_cxc_abonos_cliente ON public.cxc_abonos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_credito ON public.ventas(cliente_id) WHERE tipo_venta = 'credito';

CREATE OR REPLACE FUNCTION public.cxc_resumen()
RETURNS TABLE (
  cliente_id uuid, cliente_nombre text, rfc text, dias_credito integer, limite_credito numeric,
  num_ventas bigint, total_credito numeric, abonado numeric, saldo numeric,
  venta_mas_antigua date, dias_antiguedad integer, vencido boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH v AS (
    SELECT cliente_id, count(*) n, sum(total) t, min(fecha::date) f
      FROM public.ventas
     WHERE tipo_venta = 'credito' AND estado <> 'cancelada' AND cliente_id IS NOT NULL
     GROUP BY cliente_id
  ), a AS (
    SELECT cliente_id, sum(monto) m FROM public.cxc_abonos GROUP BY cliente_id
  )
  SELECT c.id, c.nombre, c.rfc, c.dias_credito, c.limite_credito,
         COALESCE(v.n,0), COALESCE(v.t,0), COALESCE(a.m,0), COALESCE(v.t,0) - COALESCE(a.m,0),
         v.f, (current_date - v.f)::int,
         (COALESCE(v.t,0) - COALESCE(a.m,0)) > 0
           AND v.f IS NOT NULL
           AND (current_date - v.f) > COALESCE(c.dias_credito, 30)
    FROM public.clientes c
    LEFT JOIN v ON v.cliente_id = c.id
    LEFT JOIN a ON a.cliente_id = c.id
   WHERE COALESCE(v.n,0) > 0 OR COALESCE(a.m,0) > 0
   ORDER BY (COALESCE(v.t,0) - COALESCE(a.m,0)) DESC;
$$;

CREATE OR REPLACE FUNCTION public.cxc_registrar_abono(
  p_cliente_id uuid, p_monto numeric, p_fecha date,
  p_metodo_pago text DEFAULT NULL, p_referencia text DEFAULT NULL,
  p_comprobante_url text DEFAULT NULL, p_notas text DEFAULT NULL,
  p_venta_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo numeric; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto del abono debe ser mayor a cero'; END IF;

  SELECT COALESCE((SELECT sum(total) FROM public.ventas
                    WHERE cliente_id = p_cliente_id AND tipo_venta = 'credito' AND estado <> 'cancelada'), 0)
       - COALESCE((SELECT sum(monto) FROM public.cxc_abonos WHERE cliente_id = p_cliente_id), 0)
    INTO v_saldo;

  IF p_monto > v_saldo + 0.001 THEN
    RAISE EXCEPTION 'El abono (%) no puede ser mayor al saldo pendiente del cliente (%)', p_monto, v_saldo;
  END IF;

  INSERT INTO public.cxc_abonos (cliente_id, venta_id, monto, fecha, metodo_pago, referencia, comprobante_url, notas, created_by)
  VALUES (p_cliente_id, p_venta_id, p_monto, COALESCE(p_fecha, current_date), p_metodo_pago, p_referencia, p_comprobante_url, p_notas, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.cxc_resumen() FROM anon;
REVOKE ALL ON FUNCTION public.cxc_registrar_abono(uuid, numeric, date, text, text, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cxc_resumen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cxc_registrar_abono(uuid, numeric, date, text, text, text, text, uuid) TO authenticated;