CREATE TABLE IF NOT EXISTS public.cotizador_sugerido_override (
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  cantidad integer NOT NULL CHECK (cantidad >= 0),
  motivo text,
  usuario_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, sucursal_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizador_sugerido_override TO authenticated;
GRANT ALL ON public.cotizador_sugerido_override TO service_role;
ALTER TABLE public.cotizador_sugerido_override ENABLE ROW LEVEL SECURITY;

CREATE POLICY "override_select_operativo" ON public.cotizador_sugerido_override
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
  );

CREATE POLICY "override_write_compras" ON public.cotizador_sugerido_override
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
  );

CREATE OR REPLACE FUNCTION public.cotizador_upsert_override(
  p_producto_id uuid, p_sucursal_id uuid, p_cantidad integer, p_motivo text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
  ) THEN RAISE EXCEPTION 'Sin permiso'; END IF;

  IF p_cantidad IS NULL THEN
    DELETE FROM cotizador_sugerido_override
      WHERE producto_id = p_producto_id AND sucursal_id = p_sucursal_id;
  ELSE
    INSERT INTO cotizador_sugerido_override(producto_id, sucursal_id, cantidad, motivo, usuario_id, updated_at)
    VALUES (p_producto_id, p_sucursal_id, GREATEST(0, p_cantidad), p_motivo, auth.uid(), now())
    ON CONFLICT (producto_id, sucursal_id)
    DO UPDATE SET cantidad = EXCLUDED.cantidad, motivo = EXCLUDED.motivo,
                  usuario_id = EXCLUDED.usuario_id, updated_at = now();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cotizador_overrides_list()
RETURNS TABLE (producto_id uuid, sucursal_id uuid, cantidad integer, updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT producto_id, sucursal_id, cantidad, updated_at
  FROM cotizador_sugerido_override
  WHERE has_role(auth.uid(),'super_admin'::app_role)
     OR has_role(auth.uid(),'admin'::app_role)
     OR has_role(auth.uid(),'gerente'::app_role)
     OR has_role(auth.uid(),'compras'::app_role)
$$;

GRANT EXECUTE ON FUNCTION public.cotizador_upsert_override(uuid,uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cotizador_overrides_list() TO authenticated;
