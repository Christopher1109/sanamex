ALTER TABLE public.motivos_ajuste
  ADD COLUMN IF NOT EXISTS es_confusion_producto BOOLEAN NOT NULL DEFAULT false;

INSERT INTO public.motivos_ajuste (nombre, tipo, es_confusion_producto)
SELECT 'Confusión de producto', 'ajuste', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.motivos_ajuste WHERE es_confusion_producto = true
);

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

  SELECT 'NCC-' || LPAD((COALESCE(MAX(SUBSTRING(folio FROM 5)::int), 0) + 1)::text, 6, '0')
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