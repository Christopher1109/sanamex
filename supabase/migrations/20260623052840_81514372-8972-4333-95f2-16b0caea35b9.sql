
-- ============================================================
-- FASE 1 - Prompt 3: Impuestos + Nómina + Roles
-- ============================================================

-- A) Roles nuevos (idempotente)
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'contraloria';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tesoreria';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- B) Parámetros fiscales / nómina
CREATE TABLE IF NOT EXISTS public.impuestos_parametros (
  id int PRIMARY KEY DEFAULT 1,
  coeficiente_utilidad numeric NOT NULL DEFAULT 0.05,
  isn_tasa_pct numeric NOT NULL DEFAULT 3.0,
  ieps_activo boolean NOT NULL DEFAULT false,
  retencion_isr_pct numeric NOT NULL DEFAULT 1.25,
  retencion_iva_pct numeric NOT NULL DEFAULT 10.67,
  periodicidad_nomina text NOT NULL DEFAULT 'quincenal',
  uma_diaria numeric NOT NULL DEFAULT 113.14,
  salario_minimo_diario numeric NOT NULL DEFAULT 278.80,
  anio_vigente int NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT imp_single CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE ON public.impuestos_parametros TO authenticated;
GRANT ALL ON public.impuestos_parametros TO service_role;
ALTER TABLE public.impuestos_parametros ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY imp_param_read ON public.impuestos_parametros FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY imp_param_write ON public.impuestos_parametros FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO public.impuestos_parametros (id) VALUES (1) ON CONFLICT DO NOTHING;

-- C) Declaraciones
CREATE TABLE IF NOT EXISTS public.declaraciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_anio int NOT NULL,
  periodo_mes int,
  tipo text NOT NULL CHECK (tipo IN ('provisional','definitiva','anual','complementaria')),
  impuesto text NOT NULL CHECK (impuesto IN ('IVA','ISR','ISN','RETENCIONES','IEPS')),
  base numeric NOT NULL DEFAULT 0,
  causado numeric NOT NULL DEFAULT 0,
  retenido numeric NOT NULL DEFAULT 0,
  pagado_previo numeric NOT NULL DEFAULT 0,
  a_cargo_o_favor numeric NOT NULL DEFAULT 0,
  estatus text NOT NULL DEFAULT 'borrador' CHECK (estatus IN ('borrador','presentada','pagada','cancelada')),
  detalle jsonb,
  presentada_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.declaraciones TO authenticated;
GRANT ALL ON public.declaraciones TO service_role;
ALTER TABLE public.declaraciones ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY decl_all ON public.declaraciones FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_decl_updated ON public.declaraciones;
CREATE TRIGGER trg_decl_updated BEFORE UPDATE ON public.declaraciones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- D) Nómina: empleados
CREATE TABLE IF NOT EXISTS public.empleados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_empleado text UNIQUE,
  nombre text NOT NULL,
  rfc text,
  curp text,
  nss text,
  fecha_alta date,
  fecha_baja date,
  salario_diario numeric NOT NULL DEFAULT 0,
  sbc numeric NOT NULL DEFAULT 0,
  puesto text,
  departamento text,
  sucursal_id uuid REFERENCES public.sucursales(id),
  tipo_contrato text DEFAULT 'indeterminado',
  riesgo_puesto int DEFAULT 1,
  regimen text DEFAULT '02',
  entidad_federativa text DEFAULT 'MEX',
  banco text,
  clabe text,
  periodicidad_pago text DEFAULT 'quincenal',
  email text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empleados TO authenticated;
GRANT ALL ON public.empleados TO service_role;
ALTER TABLE public.empleados ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY emp_read ON public.empleados FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY emp_write ON public.empleados FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_emp_updated ON public.empleados;
CREATE TRIGGER trg_emp_updated BEFORE UPDATE ON public.empleados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- E) Catálogo de conceptos
CREATE TABLE IF NOT EXISTS public.conceptos_nomina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text UNIQUE NOT NULL,
  descripcion text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('percepcion','deduccion','otro_pago')),
  codigo_sat text,
  grava_isr boolean NOT NULL DEFAULT true,
  grava_imss boolean NOT NULL DEFAULT true,
  formula text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conceptos_nomina TO authenticated;
GRANT ALL ON public.conceptos_nomina TO service_role;
ALTER TABLE public.conceptos_nomina ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY conc_read ON public.conceptos_nomina FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY conc_write ON public.conceptos_nomina FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- F) Asistencia
CREATE TABLE IF NOT EXISTS public.asistencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  entrada time,
  salida time,
  incidencia text CHECK (incidencia IS NULL OR incidencia IN ('falta','retardo','permiso','vacaciones','incapacidad','dia_festivo','descanso_laborado','horas_extra')),
  horas_extra numeric DEFAULT 0,
  origen text NOT NULL DEFAULT 'manual',
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empleado_id, fecha)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asistencia TO authenticated;
GRANT ALL ON public.asistencia TO service_role;
ALTER TABLE public.asistencia ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY asis_all ON public.asistencia FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador') OR public.has_role(auth.uid(),'gerente'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador') OR public.has_role(auth.uid(),'gerente'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- G) Recibos y detalles
CREATE TABLE IF NOT EXISTS public.recibos_nomina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text,
  empleado_id uuid NOT NULL REFERENCES public.empleados(id),
  periodo_inicio date NOT NULL,
  periodo_fin date NOT NULL,
  dias_pagados numeric NOT NULL DEFAULT 0,
  total_percepciones numeric NOT NULL DEFAULT 0,
  total_deducciones numeric NOT NULL DEFAULT 0,
  total_otros_pagos numeric NOT NULL DEFAULT 0,
  neto_pagado numeric NOT NULL DEFAULT 0,
  cfdi_id uuid REFERENCES public.cfdi_emitidos(id),
  estatus text NOT NULL DEFAULT 'borrador' CHECK (estatus IN ('borrador','generado','timbrado','cancelado')),
  es_prueba boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recibos_nomina TO authenticated;
GRANT ALL ON public.recibos_nomina TO service_role;
ALTER TABLE public.recibos_nomina ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rec_all ON public.recibos_nomina FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_rec_updated ON public.recibos_nomina;
CREATE TRIGGER trg_rec_updated BEFORE UPDATE ON public.recibos_nomina
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.recibo_conceptos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recibo_id uuid NOT NULL REFERENCES public.recibos_nomina(id) ON DELETE CASCADE,
  concepto_id uuid REFERENCES public.conceptos_nomina(id),
  clave text NOT NULL,
  descripcion text NOT NULL,
  tipo text NOT NULL,
  importe_gravado numeric NOT NULL DEFAULT 0,
  importe_exento numeric NOT NULL DEFAULT 0,
  importe_total numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recibo_conceptos TO authenticated;
GRANT ALL ON public.recibo_conceptos TO service_role;
ALTER TABLE public.recibo_conceptos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY recc_all ON public.recibo_conceptos FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- H) Comisiones (gancho)
CREATE TABLE IF NOT EXISTS public.comisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  periodo_inicio date NOT NULL,
  periodo_fin date NOT NULL,
  base_calculo numeric NOT NULL DEFAULT 0,
  porcentaje numeric NOT NULL DEFAULT 0,
  monto numeric NOT NULL DEFAULT 0,
  grava boolean NOT NULL DEFAULT false,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comisiones TO authenticated;
GRANT ALL ON public.comisiones TO service_role;
ALTER TABLE public.comisiones ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY com_all ON public.comisiones FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- I) Tablas ISR versionables (gancho)
CREATE TABLE IF NOT EXISTS public.tablas_isr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio int NOT NULL,
  periodicidad text NOT NULL CHECK (periodicidad IN ('mensual','quincenal','semanal','diaria')),
  limite_inferior numeric NOT NULL,
  limite_superior numeric,
  cuota_fija numeric NOT NULL,
  tasa_excedente numeric NOT NULL,
  tipo text NOT NULL DEFAULT 'isr' CHECK (tipo IN ('isr','subsidio')),
  activo boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tablas_isr TO authenticated;
GRANT ALL ON public.tablas_isr TO service_role;
ALTER TABLE public.tablas_isr ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tisr_read ON public.tablas_isr FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tisr_write ON public.tablas_isr FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- J) Permisos por defecto para los 3 módulos y roles
INSERT INTO public.role_permissions (rol, modulo, submodulo, permitido) VALUES
  -- impuestos
  ('super_admin','impuestos','_all',true),
  ('admin','impuestos','_all',true),
  ('contador','impuestos','_all',true),
  ('contraloria','impuestos','_all',true),       -- solo lectura (UI no expone botones de edición)
  -- nomina
  ('super_admin','nomina','_all',true),
  ('admin','nomina','_all',true),
  ('contador','nomina','_all',true),
  -- contraloria (read-only) en finanzas/contabilidad/auditoria/reportes
  ('contraloria','contabilidad','_all',true),
  ('contraloria','reportes_admin','_all',true),
  ('contraloria','bancos','_all',true),
  ('contraloria','conciliacion','_all',true),
  ('contraloria','cuentas_por_pagar','_all',true),
  ('contraloria','fiscal','_all',true),
  ('contraloria','actividad','_all',true),
  -- tesoreria (bancos + conciliacion + cxp)
  ('tesoreria','bancos','_all',true),
  ('tesoreria','conciliacion','_all',true),
  ('tesoreria','cuentas_por_pagar','_all',true)
ON CONFLICT DO NOTHING;
