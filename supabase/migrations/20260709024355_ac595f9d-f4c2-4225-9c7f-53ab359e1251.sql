
-- Saldos de apertura (opening balances) por cuenta contable
CREATE TABLE IF NOT EXISTS public.saldos_apertura (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cuenta_id UUID NOT NULL REFERENCES public.catalogo_cuentas(id) ON DELETE CASCADE,
  fecha_corte DATE NOT NULL,
  saldo_deudor NUMERIC(16,2) NOT NULL DEFAULT 0,
  saldo_acreedor NUMERIC(16,2) NOT NULL DEFAULT 0,
  origen TEXT NOT NULL DEFAULT 'importado',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, fecha_corte)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saldos_apertura TO authenticated;
GRANT ALL ON public.saldos_apertura TO service_role;
ALTER TABLE public.saldos_apertura ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa_read" ON public.saldos_apertura FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'contador'::app_role) OR has_role(auth.uid(),'auditoria'::app_role));
CREATE POLICY "sa_write" ON public.saldos_apertura FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'contador'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'contador'::app_role));
CREATE TRIGGER trg_saldos_apertura_updated BEFORE UPDATE ON public.saldos_apertura
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Primas de Riesgo de Trabajo por Registro Patronal (IMSS)
CREATE TABLE IF NOT EXISTS public.primas_riesgo_patronal (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registro_patronal TEXT NOT NULL UNIQUE,
  clase_rt INTEGER,
  prima_rt NUMERIC(10,6) NOT NULL,
  vigencia_desde DATE NOT NULL DEFAULT CURRENT_DATE,
  vigencia_hasta DATE,
  activo BOOLEAN NOT NULL DEFAULT true,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.primas_riesgo_patronal TO authenticated;
GRANT ALL ON public.primas_riesgo_patronal TO service_role;
ALTER TABLE public.primas_riesgo_patronal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prt_read" ON public.primas_riesgo_patronal FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'contador'::app_role) OR has_role(auth.uid(),'auditoria'::app_role));
CREATE POLICY "prt_write" ON public.primas_riesgo_patronal FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'contador'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'contador'::app_role));
CREATE TRIGGER trg_prt_updated BEFORE UPDATE ON public.primas_riesgo_patronal
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Registro patronal + campos IMSS por empleado
ALTER TABLE public.empleados ADD COLUMN IF NOT EXISTS registro_patronal TEXT;
ALTER TABLE public.empleados ADD COLUMN IF NOT EXISTS numero_cuenta TEXT;
ALTER TABLE public.empleados ADD COLUMN IF NOT EXISTS clave_sistema TEXT;

-- Referencias históricas (archivos guardados sólo como respaldo)
CREATE TABLE IF NOT EXISTS public.historicos_referencia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria TEXT NOT NULL,
  periodo TEXT NOT NULL,
  nombre_archivo TEXT NOT NULL,
  descripcion TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historicos_referencia TO authenticated;
GRANT ALL ON public.historicos_referencia TO service_role;
ALTER TABLE public.historicos_referencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_read" ON public.historicos_referencia FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr_write" ON public.historicos_referencia FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'contador'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'contador'::app_role));
CREATE TRIGGER trg_hr_updated BEFORE UPDATE ON public.historicos_referencia
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
