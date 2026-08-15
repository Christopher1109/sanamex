CREATE TABLE public.comisiones_escalones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE CASCADE,
  anio int NOT NULL,
  trimestre int NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  orden int NOT NULL,
  limite_inferior numeric NOT NULL DEFAULT 0,
  limite_superior numeric,
  pct_comision numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comisiones_escalones TO authenticated;
GRANT ALL ON public.comisiones_escalones TO service_role;
ALTER TABLE public.comisiones_escalones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "escalones_select" ON public.comisiones_escalones FOR SELECT TO authenticated USING (true);
CREATE POLICY "escalones_manage" ON public.comisiones_escalones FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direccion') OR has_role(auth.uid(),'contraloria'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direccion') OR has_role(auth.uid(),'contraloria'));
CREATE TRIGGER trg_escalones_updated BEFORE UPDATE ON public.comisiones_escalones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.comisiones_reparto_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL UNIQUE CHECK (categoria IN ('gerente','subgerente','vendedor','almacen')),
  pct_reparto numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comisiones_reparto_roles TO authenticated;
GRANT ALL ON public.comisiones_reparto_roles TO service_role;
ALTER TABLE public.comisiones_reparto_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reparto_select" ON public.comisiones_reparto_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "reparto_manage" ON public.comisiones_reparto_roles FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direccion') OR has_role(auth.uid(),'contraloria'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direccion') OR has_role(auth.uid(),'contraloria'));
CREATE TRIGGER trg_reparto_updated BEFORE UPDATE ON public.comisiones_reparto_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.comisiones_calculo_sucursal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  anio int NOT NULL,
  trimestre int NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  ventas_totales numeric NOT NULL DEFAULT 0,
  costo_ventas numeric NOT NULL DEFAULT 0,
  utilidad_bruta numeric NOT NULL DEFAULT 0,
  gastos_periodo numeric NOT NULL DEFAULT 0,
  utilidad_neta numeric NOT NULL DEFAULT 0,
  escalon_id uuid REFERENCES public.comisiones_escalones(id) ON DELETE SET NULL,
  pct_comision_aplicado numeric NOT NULL DEFAULT 0,
  comision_total numeric NOT NULL DEFAULT 0,
  aplicada boolean NOT NULL DEFAULT false,
  calculado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comisiones_calculo_sucursal TO authenticated;
GRANT ALL ON public.comisiones_calculo_sucursal TO service_role;
ALTER TABLE public.comisiones_calculo_sucursal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calculo_select" ON public.comisiones_calculo_sucursal FOR SELECT TO authenticated USING (true);
CREATE POLICY "calculo_manage" ON public.comisiones_calculo_sucursal FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direccion') OR has_role(auth.uid(),'contraloria'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direccion') OR has_role(auth.uid(),'contraloria'));
CREATE TRIGGER trg_calculo_updated BEFORE UPDATE ON public.comisiones_calculo_sucursal FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.comisiones
  ADD COLUMN IF NOT EXISTS calculo_id uuid REFERENCES public.comisiones_calculo_sucursal(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS categoria_reparto text;

INSERT INTO public.comisiones_reparto_roles (categoria, pct_reparto) VALUES
  ('gerente', 40), ('subgerente', 20), ('vendedor', 30), ('almacen', 10)
ON CONFLICT (categoria) DO NOTHING;

INSERT INTO public.comisiones_escalones (sucursal_id, anio, trimestre, orden, limite_inferior, limite_superior, pct_comision)
SELECT NULL, a.anio, t.trimestre, e.orden, e.li, e.ls, e.pct
FROM (VALUES (2026)) a(anio),
     (VALUES (1),(2),(3),(4)) t(trimestre),
     (VALUES (1, 0, 100000, 2), (2, 100000.01, 300000, 4), (3, 300000.01, 600000, 6), (4, 600000.01, NULL, 8)) e(orden, li, ls, pct);