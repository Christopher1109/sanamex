
-- ============================================================
-- MÓDULO A — Cuentas por Pagar (extensiones a compras)
-- ============================================================
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS fecha_programada date,
  ADD COLUMN IF NOT EXISTS prioridad text DEFAULT 'media' CHECK (prioridad IN ('alta','media','baja')),
  ADD COLUMN IF NOT EXISTS cfdi_proveedor_uuid text;

CREATE INDEX IF NOT EXISTS idx_compras_fecha_programada ON public.compras(fecha_programada);
CREATE INDEX IF NOT EXISTS idx_compras_prioridad ON public.compras(prioridad);

-- ============================================================
-- pagos_cxp: historial de pagos (incluye parciales)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pagos_cxp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  monto numeric(14,2) NOT NULL CHECK (monto > 0),
  forma_pago text NOT NULL DEFAULT 'transferencia',
  referencia text,
  banco_cuenta_id uuid,
  notas text,
  comprobante_url text,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_cxp TO authenticated;
GRANT ALL ON public.pagos_cxp TO service_role;
ALTER TABLE public.pagos_cxp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pagos_cxp_select ON public.pagos_cxp;
CREATE POLICY pagos_cxp_select ON public.pagos_cxp FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'subgerente') OR has_role(auth.uid(),'contador') OR has_role(auth.uid(),'auditoria'));

DROP POLICY IF EXISTS pagos_cxp_write ON public.pagos_cxp;
CREATE POLICY pagos_cxp_write ON public.pagos_cxp FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'contador'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'contador'));

CREATE INDEX IF NOT EXISTS idx_pagos_cxp_compra ON public.pagos_cxp(compra_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cxp_fecha ON public.pagos_cxp(fecha);

DROP TRIGGER IF EXISTS trg_pagos_cxp_updated ON public.pagos_cxp;
CREATE TRIGGER trg_pagos_cxp_updated BEFORE UPDATE ON public.pagos_cxp
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Recalcular saldo + estado en compras al cambiar pagos_cxp
CREATE OR REPLACE FUNCTION public.recalc_compra_pagos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_compra_id uuid := COALESCE(NEW.compra_id, OLD.compra_id);
  v_total numeric;
  v_pagado numeric;
BEGIN
  SELECT total INTO v_total FROM compras WHERE id = v_compra_id;
  SELECT COALESCE(SUM(monto),0) INTO v_pagado FROM pagos_cxp WHERE compra_id = v_compra_id;
  UPDATE compras
    SET pagada = (v_pagado >= v_total AND v_total > 0),
        fecha_pago_real = CASE WHEN v_pagado >= v_total AND v_total > 0
                               THEN (SELECT MAX(fecha) FROM pagos_cxp WHERE compra_id = v_compra_id)
                               ELSE NULL END,
        updated_at = now()
   WHERE id = v_compra_id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_recalc_compra_pagos ON public.pagos_cxp;
CREATE TRIGGER trg_recalc_compra_pagos
AFTER INSERT OR UPDATE OR DELETE ON public.pagos_cxp
FOR EACH ROW EXECUTE FUNCTION public.recalc_compra_pagos();

-- ============================================================
-- MÓDULO B — Bancos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bancos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bancos TO authenticated;
GRANT ALL ON public.bancos TO service_role;
ALTER TABLE public.bancos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bancos_select ON public.bancos;
CREATE POLICY bancos_select ON public.bancos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS bancos_write ON public.bancos;
CREATE POLICY bancos_write ON public.bancos FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'contador'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'contador'));

CREATE TABLE IF NOT EXISTS public.cuentas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banco_id uuid NOT NULL REFERENCES public.bancos(id) ON DELETE RESTRICT,
  alias text NOT NULL,
  no_cuenta text,
  clabe text,
  moneda text NOT NULL DEFAULT 'MXN',
  tipo text NOT NULL DEFAULT 'cuenta' CHECK (tipo IN ('cuenta','subcuenta','tpv')),
  parent_id uuid REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  saldo_inicial numeric(14,2) NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cuentas_bancarias TO authenticated;
GRANT ALL ON public.cuentas_bancarias TO service_role;
ALTER TABLE public.cuentas_bancarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ctas_bancarias_select ON public.cuentas_bancarias;
CREATE POLICY ctas_bancarias_select ON public.cuentas_bancarias FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'contador') OR has_role(auth.uid(),'auditoria'));
DROP POLICY IF EXISTS ctas_bancarias_write ON public.cuentas_bancarias;
CREATE POLICY ctas_bancarias_write ON public.cuentas_bancarias FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'contador'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'contador'));

DROP TRIGGER IF EXISTS trg_ctas_bancarias_updated ON public.cuentas_bancarias;
CREATE TRIGGER trg_ctas_bancarias_updated BEFORE UPDATE ON public.cuentas_bancarias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- FK ahora que cuentas_bancarias existe
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pagos_cxp_banco_cuenta_fkey') THEN
    ALTER TABLE public.pagos_cxp
      ADD CONSTRAINT pagos_cxp_banco_cuenta_fkey FOREIGN KEY (banco_cuenta_id)
      REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.movimientos_bancarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL REFERENCES public.cuentas_bancarias(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  concepto text,
  referencia text,
  cargo numeric(14,2) NOT NULL DEFAULT 0,
  abono numeric(14,2) NOT NULL DEFAULT 0,
  saldo numeric(14,2),
  contraparte_nombre text,
  contraparte_clabe text,
  conciliado boolean NOT NULL DEFAULT false,
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','importado','api')),
  proveedor_sugerido_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,
  cliente_sugerido_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_bancarios TO authenticated;
GRANT ALL ON public.movimientos_bancarios TO service_role;
ALTER TABLE public.movimientos_bancarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mov_banc_select ON public.movimientos_bancarios;
CREATE POLICY mov_banc_select ON public.movimientos_bancarios FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'contador') OR has_role(auth.uid(),'auditoria'));
DROP POLICY IF EXISTS mov_banc_write ON public.movimientos_bancarios;
CREATE POLICY mov_banc_write ON public.movimientos_bancarios FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'contador'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'contador'));

CREATE INDEX IF NOT EXISTS idx_mov_banc_cuenta_fecha ON public.movimientos_bancarios(cuenta_id, fecha);
CREATE INDEX IF NOT EXISTS idx_mov_banc_conciliado ON public.movimientos_bancarios(conciliado);

DROP TRIGGER IF EXISTS trg_mov_banc_updated ON public.movimientos_bancarios;
CREATE TRIGGER trg_mov_banc_updated BEFORE UPDATE ON public.movimientos_bancarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MÓDULO C — Conciliación: extender conciliacion_bancaria
-- ============================================================
ALTER TABLE public.conciliacion_bancaria
  ADD COLUMN IF NOT EXISTS movimiento_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS documento_tipo text,     -- 'pago_cxp' | 'cfdi' | 'venta'
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS conciliado_por uuid,
  ADD COLUMN IF NOT EXISTS conciliado_at timestamptz;

-- Permitir SELECT/UPDATE/INSERT a contador en conciliacion
DROP POLICY IF EXISTS conc_contador_select ON public.conciliacion_bancaria;
CREATE POLICY conc_contador_select ON public.conciliacion_bancaria FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'contador'));
DROP POLICY IF EXISTS conc_contador_write ON public.conciliacion_bancaria;
CREATE POLICY conc_contador_write ON public.conciliacion_bancaria FOR ALL TO authenticated
  USING (has_role(auth.uid(),'contador') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente'))
  WITH CHECK (has_role(auth.uid(),'contador') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente'));

-- ============================================================
-- Pre-carga editable de bancos (BBVA + MIFEL)
-- ============================================================
INSERT INTO public.bancos (codigo, nombre) VALUES ('BBVA','BBVA México') ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.bancos (codigo, nombre) VALUES ('MIFEL','Banca Mifel') ON CONFLICT (codigo) DO NOTHING;

DO $$
DECLARE
  v_bbva uuid; v_mifel uuid;
  v_bbva_main uuid; v_mifel_main uuid;
BEGIN
  SELECT id INTO v_bbva FROM bancos WHERE codigo='BBVA';
  SELECT id INTO v_mifel FROM bancos WHERE codigo='MIFEL';

  -- BBVA cuenta principal (idempotente por alias+banco)
  IF NOT EXISTS (SELECT 1 FROM cuentas_bancarias WHERE banco_id=v_bbva AND alias='BBVA — Cuenta Principal') THEN
    INSERT INTO cuentas_bancarias (banco_id, alias, tipo) VALUES (v_bbva,'BBVA — Cuenta Principal','cuenta')
    RETURNING id INTO v_bbva_main;
  ELSE
    SELECT id INTO v_bbva_main FROM cuentas_bancarias WHERE banco_id=v_bbva AND alias='BBVA — Cuenta Principal';
  END IF;

  -- 3 subcuentas BBVA
  INSERT INTO cuentas_bancarias (banco_id, alias, tipo, parent_id)
  SELECT v_bbva, x.alias, 'subcuenta', v_bbva_main FROM (VALUES
    ('BBVA — Subcuenta 1'),('BBVA — Subcuenta 2'),('BBVA — Subcuenta 3')
  ) AS x(alias)
  WHERE NOT EXISTS (SELECT 1 FROM cuentas_bancarias c WHERE c.banco_id=v_bbva AND c.alias=x.alias);

  -- 4 TPV BBVA
  INSERT INTO cuentas_bancarias (banco_id, alias, tipo, parent_id)
  SELECT v_bbva, x.alias, 'tpv', v_bbva_main FROM (VALUES
    ('BBVA — TPV 1'),('BBVA — TPV 2'),('BBVA — TPV 3'),('BBVA — TPV 4')
  ) AS x(alias)
  WHERE NOT EXISTS (SELECT 1 FROM cuentas_bancarias c WHERE c.banco_id=v_bbva AND c.alias=x.alias);

  -- MIFEL cuenta principal
  IF NOT EXISTS (SELECT 1 FROM cuentas_bancarias WHERE banco_id=v_mifel AND alias='MIFEL — Cuenta Principal') THEN
    INSERT INTO cuentas_bancarias (banco_id, alias, tipo) VALUES (v_mifel,'MIFEL — Cuenta Principal','cuenta')
    RETURNING id INTO v_mifel_main;
  ELSE
    SELECT id INTO v_mifel_main FROM cuentas_bancarias WHERE banco_id=v_mifel AND alias='MIFEL — Cuenta Principal';
  END IF;

  -- 4 TPV MIFEL
  INSERT INTO cuentas_bancarias (banco_id, alias, tipo, parent_id)
  SELECT v_mifel, x.alias, 'tpv', v_mifel_main FROM (VALUES
    ('MIFEL — TPV 1'),('MIFEL — TPV 2'),('MIFEL — TPV 3'),('MIFEL — TPV 4')
  ) AS x(alias)
  WHERE NOT EXISTS (SELECT 1 FROM cuentas_bancarias c WHERE c.banco_id=v_mifel AND c.alias=x.alias);
END $$;

-- ============================================================
-- Permisos rol contador para módulos Fase 1
-- ============================================================
INSERT INTO public.role_permissions (rol, modulo, submodulo, permitido) VALUES
  ('contador','cuentas_por_pagar','_all',true),
  ('contador','bancos','_all',true),
  ('contador','conciliacion','_all',true),
  ('admin','bancos','_all',true),
  ('admin','conciliacion','_all',true),
  ('super_admin','bancos','_all',true),
  ('super_admin','conciliacion','_all',true)
ON CONFLICT DO NOTHING;
