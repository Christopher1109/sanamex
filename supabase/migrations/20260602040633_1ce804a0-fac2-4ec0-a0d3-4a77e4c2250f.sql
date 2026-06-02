
-- Ampliar productos
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS codigo_interno text,
  ADD COLUMN IF NOT EXISTS formula text,
  ADD COLUMN IF NOT EXISTS sustancia_activa text,
  ADD COLUMN IF NOT EXISTS presentacion text,
  ADD COLUMN IF NOT EXISTS forma_farmaceutica text,
  ADD COLUMN IF NOT EXISTS laboratorio text,
  ADD COLUMN IF NOT EXISTS indice_terapeutico text,
  ADD COLUMN IF NOT EXISTS registro_sanitario text,
  ADD COLUMN IF NOT EXISTS fraccion_arancelaria text,
  ADD COLUMN IF NOT EXISTS receta_medica boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS departamento text,
  ADD COLUMN IF NOT EXISTS estatus text DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS clasificacion_80_20 text,
  ADD COLUMN IF NOT EXISTS iva_tasa numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ieps numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clave_sat text,
  ADD COLUMN IF NOT EXISTS fecha_carga_erp date,
  ADD COLUMN IF NOT EXISTS costo numeric DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_productos_laboratorio ON public.productos(laboratorio);
CREATE INDEX IF NOT EXISTS idx_productos_departamento ON public.productos(departamento);
CREATE INDEX IF NOT EXISTS idx_productos_codigo_interno ON public.productos(codigo_interno);

-- Nueva tabla de precios escalonados
CREATE TABLE IF NOT EXISTS public.producto_precios_escalonados (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  nivel integer NOT NULL CHECK (nivel BETWEEN 1 AND 4),
  precio numeric NOT NULL DEFAULT 0,
  cantidad_minima integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, nivel)
);

GRANT SELECT ON public.producto_precios_escalonados TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.producto_precios_escalonados TO authenticated;
GRANT ALL ON public.producto_precios_escalonados TO service_role;

ALTER TABLE public.producto_precios_escalonados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven precios escalonados"
  ON public.producto_precios_escalonados FOR SELECT
  USING (true);

CREATE POLICY "Admin/gerente gestionan precios escalonados ins"
  ON public.producto_precios_escalonados FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));

CREATE POLICY "Admin/gerente gestionan precios escalonados upd"
  ON public.producto_precios_escalonados FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));

CREATE POLICY "Admin/gerente gestionan precios escalonados del"
  ON public.producto_precios_escalonados FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));

CREATE TRIGGER trg_pp_escalonados_updated_at
  BEFORE UPDATE ON public.producto_precios_escalonados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Permitir eliminar productos
CREATE POLICY "Admin/gerente eliminan productos"
  ON public.productos FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));
