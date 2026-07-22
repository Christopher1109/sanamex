-- Multi-código interno por lote/caducidad (pedido Alejandro, sesión 20-jul-2026)
-- APLICADA DIRECTO EN LOVABLE CLOUD el 21-jul-2026 vía MCP.
-- Este archivo es el registro de la migración para historial del repo.

CREATE TABLE public.producto_codigos_lote (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.lotes(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  precio_especial numeric NOT NULL CHECK (precio_especial >= 0),
  motivo text NOT NULL DEFAULT 'caducidad_corta',
  activo boolean NOT NULL DEFAULT true,
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producto_codigos_lote_codigo_unico UNIQUE (codigo)
);

CREATE INDEX idx_pcl_producto ON public.producto_codigos_lote (producto_id);
CREATE INDEX idx_pcl_lote ON public.producto_codigos_lote (lote_id);
CREATE INDEX idx_pcl_codigo_activo ON public.producto_codigos_lote (codigo) WHERE activo;

ALTER TABLE public.venta_lineas
  ADD COLUMN codigo_lote_id uuid REFERENCES public.producto_codigos_lote(id),
  ADD COLUMN precio_lista numeric;

CREATE INDEX idx_venta_lineas_codigo_lote ON public.venta_lineas (codigo_lote_id) WHERE codigo_lote_id IS NOT NULL;

ALTER TABLE public.producto_codigos_lote ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados ven codigos de lote"
  ON public.producto_codigos_lote FOR SELECT TO authenticated USING (true);

CREATE POLICY "Operativos crean codigos de lote"
  ON public.producto_codigos_lote FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gerente'::app_role) OR
    has_role(auth.uid(), 'subgerente'::app_role) OR
    has_role(auth.uid(), 'almacen'::app_role)
  );

CREATE POLICY "Operativos actualizan codigos de lote"
  ON public.producto_codigos_lote FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gerente'::app_role) OR
    has_role(auth.uid(), 'subgerente'::app_role) OR
    has_role(auth.uid(), 'almacen'::app_role)
  );

CREATE OR REPLACE FUNCTION public.set_updated_at_pcl()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pcl_updated_at
  BEFORE UPDATE ON public.producto_codigos_lote
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_pcl();
