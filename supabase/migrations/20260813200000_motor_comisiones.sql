-- =========================================================
-- Sesión 13-ago-2026: motor de comisiones (Plan Equipo).
--
-- Hasta ahora "Comisiones" era 100% captura manual: el usuario
-- tecleaba base, %, y monto a mano por cada empleado. El Excel real
-- que compartió el cliente (Esquema_Comisiones_Sanamex.xlsx) usa una
-- lógica de escalones por SUCURSAL:
--   Ventas -> Utilidad Bruta -> menos Gastos -> Utilidad Neta
--   -> cae en un escalón (tier) -> % de comisión de ese escalón
--   -> el total se reparte entre Gerente/Subgerente/Vendedores/Almacén
--
-- Este es el "Plan Equipo" (utilidad de sucursal, repartida por rol).
-- El Excel también tenía "Plan Individual", "Bono Gerentes" (escalones
-- aparte) y "Bonos trimestrales A-P-P / metas consecutivas" (montos
-- fijos por tier) — ESOS TRES QUEDAN FUERA de esta primera versión
-- por tiempo; se documentan como pendiente explícito, no se inventan.
--
-- ⚠️ LOS VALORES SEMBRADOS ABAJO (rangos de escalón, %, reparto por
-- rol) SON EJEMPLO/PLACEHOLDER — nadie nos dio las cifras reales del
-- Excel en un formato que se pudiera copiar 1:1 con confianza. Se
-- documenta así a propósito para que se editen desde la UI en cuanto
-- el cliente confirme sus cifras reales. No se debe presentar como
-- definitivo.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Escalones de comisión por utilidad neta (Plan Equipo)
--    sucursal_id NULL = aplica igual a todas las sucursales que no
--    tengan un escalón propio para ese año/trimestre.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comisiones_escalones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE CASCADE,
  anio int NOT NULL,
  trimestre int NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  orden int NOT NULL,
  limite_inferior numeric NOT NULL,
  limite_superior numeric,
  pct_comision numeric NOT NULL CHECK (pct_comision >= 0 AND pct_comision <= 100),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.comisiones_escalones IS
  'Escalones de % de comisión según Utilidad Neta de la sucursal en el trimestre. limite_superior NULL = sin tope (escalón más alto). Editable por trimestre para que el cliente los ajuste cada Q como pidió.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comisiones_escalones TO authenticated;
GRANT ALL ON public.comisiones_escalones TO service_role;
ALTER TABLE public.comisiones_escalones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "escalones lectura" ON public.comisiones_escalones;
CREATE POLICY "escalones lectura" ON public.comisiones_escalones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "escalones escritura" ON public.comisiones_escalones;
CREATE POLICY "escalones escritura" ON public.comisiones_escalones FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'direccion'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'direccion'::app_role));

-- ---------------------------------------------------------
-- 2) Reparto del monto de comisión entre roles de la sucursal
--    (debe sumar 100 entre las categorías activas — se valida en la app)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comisiones_reparto_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL UNIQUE CHECK (categoria IN ('gerente','subgerente','vendedor','almacen')),
  pct_reparto numeric NOT NULL CHECK (pct_reparto >= 0 AND pct_reparto <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.comisiones_reparto_roles IS
  'Qué % del monto total de comisión de la sucursal le toca a cada categoría de puesto. Dentro de una categoría, el monto se reparte en partes iguales entre los empleados activos de esa sucursal en esa categoría.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comisiones_reparto_roles TO authenticated;
GRANT ALL ON public.comisiones_reparto_roles TO service_role;
ALTER TABLE public.comisiones_reparto_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reparto lectura" ON public.comisiones_reparto_roles;
CREATE POLICY "reparto lectura" ON public.comisiones_reparto_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "reparto escritura" ON public.comisiones_reparto_roles;
CREATE POLICY "reparto escritura" ON public.comisiones_reparto_roles FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'direccion'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'direccion'::app_role));

-- ---------------------------------------------------------
-- 3) Corridas de cálculo (auditoría — qué se calculó, cuándo, con qué
--    cifras de gastos capturadas a mano, y a qué escalón cayó)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comisiones_calculo_sucursal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id),
  anio int NOT NULL,
  trimestre int NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  ventas_totales numeric NOT NULL DEFAULT 0,
  costo_ventas numeric NOT NULL DEFAULT 0,
  utilidad_bruta numeric NOT NULL DEFAULT 0,
  gastos_periodo numeric NOT NULL DEFAULT 0,
  utilidad_neta numeric NOT NULL DEFAULT 0,
  escalon_id uuid REFERENCES public.comisiones_escalones(id),
  pct_comision_aplicado numeric NOT NULL DEFAULT 0,
  comision_total numeric NOT NULL DEFAULT 0,
  aplicada boolean NOT NULL DEFAULT false,
  calculado_por uuid,
  calculado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sucursal_id, anio, trimestre, calculado_en)
);
COMMENT ON COLUMN public.comisiones_calculo_sucursal.gastos_periodo IS
  'Captura MANUAL — todavía no existe un módulo de gastos operativos por sucursal en el sistema (renta, financiamiento, administrativos). Hasta que exista, quien corre el cálculo teclea el total de gastos del trimestre.';

GRANT SELECT, INSERT, UPDATE ON public.comisiones_calculo_sucursal TO authenticated;
GRANT ALL ON public.comisiones_calculo_sucursal TO service_role;
ALTER TABLE public.comisiones_calculo_sucursal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calculo lectura" ON public.comisiones_calculo_sucursal;
CREATE POLICY "calculo lectura" ON public.comisiones_calculo_sucursal FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "calculo escritura" ON public.comisiones_calculo_sucursal;
CREATE POLICY "calculo escritura" ON public.comisiones_calculo_sucursal FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'direccion'::app_role) OR has_role(auth.uid(),'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'direccion'::app_role) OR has_role(auth.uid(),'gerente'::app_role));

-- Vincula cada comisión individual (tabla `comisiones` ya existente) a
-- la corrida que la generó, para poder auditar/deshacer.
ALTER TABLE public.comisiones ADD COLUMN IF NOT EXISTS calculo_id uuid REFERENCES public.comisiones_calculo_sucursal(id);
ALTER TABLE public.comisiones ADD COLUMN IF NOT EXISTS categoria_reparto text;

-- ---------------------------------------------------------
-- 4) Semilla EJEMPLO — 3 escalones globales (sucursal_id NULL) para
--    el trimestre actual, y reparto por rol EJEMPLO. Editar en cuanto
--    el cliente confirme sus cifras reales.
-- ---------------------------------------------------------
DO $$
DECLARE
  v_anio int := EXTRACT(YEAR FROM now())::int;
  v_trimestre int := CEIL(EXTRACT(MONTH FROM now())::numeric / 3);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.comisiones_escalones WHERE sucursal_id IS NULL AND anio = v_anio AND trimestre = v_trimestre) THEN
    INSERT INTO public.comisiones_escalones (sucursal_id, anio, trimestre, orden, limite_inferior, limite_superior, pct_comision, notas) VALUES
      (NULL, v_anio, v_trimestre, 1, 0,       50000,  2, 'EJEMPLO — ajustar con cifras reales del cliente'),
      (NULL, v_anio, v_trimestre, 2, 50000,   150000, 4, 'EJEMPLO — ajustar con cifras reales del cliente'),
      (NULL, v_anio, v_trimestre, 3, 150000,  NULL,   6, 'EJEMPLO — ajustar con cifras reales del cliente');
  END IF;
END $$;

INSERT INTO public.comisiones_reparto_roles (categoria, pct_reparto) VALUES
  ('gerente', 30), ('subgerente', 20), ('vendedor', 35), ('almacen', 15)
ON CONFLICT (categoria) DO NOTHING;
