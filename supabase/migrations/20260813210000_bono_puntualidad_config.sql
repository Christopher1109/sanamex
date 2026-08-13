-- =========================================================
-- Sesión 13-ago-2026: bono de puntualidad "mixto" — configurable
-- por categoría de puesto.
--
-- CONTEXTO: hay dos reglas que no cuadran entre sí:
--   Regla A (ya implementada, confirmada 27-jul-2026 con Contabilidad
--     Sanamex): 10% mensual / 5% quincenal, PLANO para todos los puestos.
--   Regla B (patrón que se ve en el histórico real de CONTPAQi):
--     varía 5% / 6% / 10% según categoría (ventas / almacén-reparto /
--     gerencia), con excepciones caso por caso.
--
-- En vez de adivinar cuál es la correcta, se agrega esta tabla para
-- que el % sea AJUSTABLE por categoría desde la UI, sin necesitar otro
-- cambio de código. Se siembra con 10% para TODAS las categorías —
-- exactamente el comportamiento que ya estaba activo (Regla A) — así
-- que este cambio, por sí solo, NO altera ningún cálculo existente.
-- Se ajusta en cuanto el cliente confirme en la junta cuál regla usar.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.nomina_bono_puntualidad_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL UNIQUE CHECK (categoria IN ('gerente','subgerente','vendedor','almacen','otros')),
  pct_mensual numeric NOT NULL CHECK (pct_mensual >= 0 AND pct_mensual <= 100),
  notas text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.nomina_bono_puntualidad_config IS
  'Porcentaje mensual del bono de puntualidad por categoría de puesto (se prorratea según periodicidad de pago en NominaCalculator.ts). categoria=otros aplica a puestos administrativos/no clasificados. Sembrado con 10% parejo para no cambiar el comportamiento actual — ajustar aquí cuando el cliente confirme la regla definitiva.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nomina_bono_puntualidad_config TO authenticated;
GRANT ALL ON public.nomina_bono_puntualidad_config TO service_role;
ALTER TABLE public.nomina_bono_puntualidad_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bono punt lectura" ON public.nomina_bono_puntualidad_config;
CREATE POLICY "bono punt lectura" ON public.nomina_bono_puntualidad_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bono punt escritura" ON public.nomina_bono_puntualidad_config;
CREATE POLICY "bono punt escritura" ON public.nomina_bono_puntualidad_config FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'direccion'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'direccion'::app_role));

INSERT INTO public.nomina_bono_puntualidad_config (categoria, pct_mensual, notas) VALUES
  ('gerente',    10, 'Regla A (27-jul) — igual para todas las categorías por ahora'),
  ('subgerente', 10, 'Regla A (27-jul) — igual para todas las categorías por ahora'),
  ('vendedor',   10, 'Regla A (27-jul) — igual para todas las categorías por ahora'),
  ('almacen',    10, 'Regla A (27-jul) — igual para todas las categorías por ahora'),
  ('otros',      10, 'Regla A (27-jul) — igual para todas las categorías por ahora')
ON CONFLICT (categoria) DO NOTHING;
