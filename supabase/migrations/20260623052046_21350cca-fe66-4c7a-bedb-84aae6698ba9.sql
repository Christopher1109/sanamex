
-- ============================================================
-- FASE 1 - Prompt 2: Contabilidad + Reportes administrativos
-- Idempotente. NO borra nada.
-- ============================================================

-- 1) Catálogo de cuentas
CREATE TABLE IF NOT EXISTS public.catalogo_cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  nivel int NOT NULL DEFAULT 1,
  naturaleza text NOT NULL CHECK (naturaleza IN ('deudora','acreedora')),
  cuenta_padre_id uuid REFERENCES public.catalogo_cuentas(id) ON DELETE SET NULL,
  codigo_agrupador_sat text,
  afectable boolean NOT NULL DEFAULT true,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_cuentas TO authenticated;
GRANT ALL ON public.catalogo_cuentas TO service_role;
ALTER TABLE public.catalogo_cuentas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "cuentas_read_auth" ON public.catalogo_cuentas FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "cuentas_mut_admin" ON public.catalogo_cuentas FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_cuentas_updated ON public.catalogo_cuentas;
CREATE TRIGGER trg_cuentas_updated BEFORE UPDATE ON public.catalogo_cuentas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Pólizas + movimientos
CREATE TABLE IF NOT EXISTS public.polizas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text,
  tipo text NOT NULL CHECK (tipo IN ('ingreso','egreso','diario')),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  concepto text,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  estatus text NOT NULL DEFAULT 'borrador' CHECK (estatus IN ('borrador','autorizada','cancelada')),
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','automatica')),
  origen_referencia_tipo text,
  origen_referencia_id uuid,
  total_cargo numeric NOT NULL DEFAULT 0,
  total_abono numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.polizas TO authenticated;
GRANT ALL ON public.polizas TO service_role;
ALTER TABLE public.polizas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "polizas_admin_all" ON public.polizas FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_polizas_updated ON public.polizas;
CREATE TRIGGER trg_polizas_updated BEFORE UPDATE ON public.polizas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.poliza_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poliza_id uuid NOT NULL REFERENCES public.polizas(id) ON DELETE CASCADE,
  cuenta_id uuid NOT NULL REFERENCES public.catalogo_cuentas(id),
  cargo numeric NOT NULL DEFAULT 0,
  abono numeric NOT NULL DEFAULT 0,
  concepto text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poliza_movimientos TO authenticated;
GRANT ALL ON public.poliza_movimientos TO service_role;
ALTER TABLE public.poliza_movimientos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "polmov_admin_all" ON public.poliza_movimientos FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Validación cargo=abono (no graba pólizas autorizadas descuadradas)
CREATE OR REPLACE FUNCTION public.recalc_poliza_totales()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_poliza_id uuid := COALESCE(NEW.poliza_id, OLD.poliza_id);
  v_cargo numeric;
  v_abono numeric;
  v_estatus text;
BEGIN
  SELECT COALESCE(SUM(cargo),0), COALESCE(SUM(abono),0)
    INTO v_cargo, v_abono
  FROM public.poliza_movimientos WHERE poliza_id = v_poliza_id;
  UPDATE public.polizas SET total_cargo = v_cargo, total_abono = v_abono, updated_at = now()
   WHERE id = v_poliza_id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_polmov_recalc ON public.poliza_movimientos;
CREATE TRIGGER trg_polmov_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.poliza_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.recalc_poliza_totales();

CREATE OR REPLACE FUNCTION public.check_poliza_balanceada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.estatus = 'autorizada' THEN
    IF ABS(COALESCE(NEW.total_cargo,0) - COALESCE(NEW.total_abono,0)) > 0.01 THEN
      RAISE EXCEPTION 'Póliza descuadrada: cargo=% abono=%', NEW.total_cargo, NEW.total_abono;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.poliza_movimientos WHERE poliza_id = NEW.id) THEN
      RAISE EXCEPTION 'Póliza sin movimientos no puede autorizarse';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_polizas_check ON public.polizas;
CREATE TRIGGER trg_polizas_check BEFORE INSERT OR UPDATE ON public.polizas
  FOR EACH ROW EXECUTE FUNCTION public.check_poliza_balanceada();

-- 3) Reglas de contabilización
CREATE TABLE IF NOT EXISTS public.reglas_contabilizacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen text NOT NULL UNIQUE,
  descripcion text,
  cuenta_cargo_id uuid REFERENCES public.catalogo_cuentas(id),
  cuenta_abono_id uuid REFERENCES public.catalogo_cuentas(id),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reglas_contabilizacion TO authenticated;
GRANT ALL ON public.reglas_contabilizacion TO service_role;
ALTER TABLE public.reglas_contabilizacion ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "reglas_admin_all" ON public.reglas_contabilizacion FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_reglas_updated ON public.reglas_contabilizacion;
CREATE TRIGGER trg_reglas_updated BEFORE UPDATE ON public.reglas_contabilizacion
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Sucursales: es_fiscal y tipo (tipo ya existe)
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS es_fiscal boolean NOT NULL DEFAULT true;
-- Marca CEDIS no fiscal
UPDATE public.sucursales SET es_fiscal = false WHERE LOWER(COALESCE(tipo,'')) = 'cedis';
UPDATE public.sucursales SET es_fiscal = true  WHERE LOWER(COALESCE(tipo,'')) <> 'cedis';

-- 5) Parámetros de contabilidad
CREATE TABLE IF NOT EXISTS public.contabilidad_parametros (
  id int PRIMARY KEY DEFAULT 1,
  fecha_inicio_contable date NOT NULL DEFAULT date_trunc('year', now())::date,
  prorrateo_cedis_pct numeric NOT NULL DEFAULT 25.0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contab_single CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE ON public.contabilidad_parametros TO authenticated;
GRANT ALL ON public.contabilidad_parametros TO service_role;
ALTER TABLE public.contabilidad_parametros ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "contab_param_read" ON public.contabilidad_parametros FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "contab_param_write" ON public.contabilidad_parametros FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.contabilidad_parametros (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 6) Permisos para módulos nuevos
INSERT INTO public.role_permissions (rol, modulo, submodulo, permitido)
VALUES
  ('super_admin','contabilidad','_all',true),
  ('admin','contabilidad','_all',true),
  ('contador','contabilidad','_all',true),
  ('super_admin','reportes_admin','_all',true),
  ('admin','reportes_admin','_all',true),
  ('contador','reportes_admin','_all',true)
ON CONFLICT DO NOTHING;

-- 7) Función: balanza de comprobación
CREATE OR REPLACE FUNCTION public.balanza_comprobacion(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_solo_autorizadas boolean DEFAULT true
)
RETURNS TABLE(cuenta_id uuid, codigo text, nombre text, naturaleza text,
              cargos numeric, abonos numeric, saldo numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, c.codigo, c.nombre, c.naturaleza,
    COALESCE(SUM(pm.cargo),0)::numeric,
    COALESCE(SUM(pm.abono),0)::numeric,
    CASE WHEN c.naturaleza='deudora'
         THEN (COALESCE(SUM(pm.cargo),0) - COALESCE(SUM(pm.abono),0))
         ELSE (COALESCE(SUM(pm.abono),0) - COALESCE(SUM(pm.cargo),0))
    END::numeric
  FROM catalogo_cuentas c
  LEFT JOIN poliza_movimientos pm ON pm.cuenta_id = c.id
  LEFT JOIN polizas p ON p.id = pm.poliza_id
   AND (NOT p_solo_autorizadas OR p.estatus='autorizada')
   AND (p_desde IS NULL OR p.fecha >= p_desde)
   AND (p_hasta IS NULL OR p.fecha <= p_hasta)
  WHERE c.activo = true
  GROUP BY c.id, c.codigo, c.nombre, c.naturaleza
  ORDER BY c.codigo;
$$;
