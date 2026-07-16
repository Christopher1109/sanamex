
-- 1. Tabla nueva: permisos finos por usuario y módulo
CREATE TABLE public.user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modulo text NOT NULL,
  nivel_acceso text NOT NULL DEFAULT 'sin_acceso'
    CHECK (nivel_acceso IN ('sin_acceso','consultar','capturar','autorizar','administrar')),
  otorgado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, modulo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_module_access TO authenticated;
GRANT ALL ON public.user_module_access TO service_role;

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

-- Los usuarios pueden leer sus propios permisos (para que el Sidebar cargue)
CREATE POLICY "uma_self_read" ON public.user_module_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Solo super_admin puede escribir/leer todo
CREATE POLICY "uma_super_admin_all" ON public.user_module_access
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- admin también puede leer (para gestión), pero solo super_admin escribe
CREATE POLICY "uma_admin_read" ON public.user_module_access
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_uma_user ON public.user_module_access(user_id);
CREATE INDEX idx_uma_modulo ON public.user_module_access(modulo);

CREATE TRIGGER trg_uma_updated_at
  BEFORE UPDATE ON public.user_module_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Función helper: has_module_access(user, modulo, nivel_minimo)
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id uuid, _modulo text, _min_nivel text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    -- Bypass: super_admin y admin siempre pasan
    has_role(_user_id, 'super_admin'::app_role)
    OR has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_module_access uma
      WHERE uma.user_id = _user_id
        AND uma.modulo = _modulo
        AND (
          CASE uma.nivel_acceso
            WHEN 'administrar' THEN 5
            WHEN 'autorizar'  THEN 4
            WHEN 'capturar'   THEN 3
            WHEN 'consultar'  THEN 2
            WHEN 'sin_acceso' THEN 1
            ELSE 0
          END
        ) >= (
          CASE _min_nivel
            WHEN 'administrar' THEN 5
            WHEN 'autorizar'  THEN 4
            WHEN 'capturar'   THEN 3
            WHEN 'consultar'  THEN 2
            WHEN 'sin_acceso' THEN 1
            ELSE 0
          END
        )
    )
$$;

-- 3. Backfill: sembrar permisos para los usuarios existentes según su rol
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT ur.user_id, ur.role FROM public.user_roles ur LOOP
    -- super_admin / admin: bypass, no requieren filas (pero las insertamos para verlas en UI)
    IF r.role IN ('super_admin','admin') THEN
      INSERT INTO public.user_module_access (user_id, modulo, nivel_acceso)
      SELECT r.user_id, m, 'administrar'
      FROM unnest(ARRAY[
        'articulos','proveedores','listas_precios','clientes','compras','ventas','pos',
        'traspasos','devoluciones_proveedor','inventario','caducidades','rotacion',
        'rentabilidad_lotes','reportes','cuentas_por_pagar','bancos','conciliacion',
        'contabilidad','reportes_admin','cfdi','impuestos','nomina','cargas_masivas',
        'ventas_offline','actividad','super_admin'
      ]) AS m
      ON CONFLICT (user_id, modulo) DO NOTHING;

    ELSIF r.role = 'gerente' THEN
      INSERT INTO public.user_module_access (user_id, modulo, nivel_acceso) VALUES
        (r.user_id,'articulos','administrar'),
        (r.user_id,'proveedores','administrar'),
        (r.user_id,'listas_precios','administrar'),
        (r.user_id,'clientes','administrar'),
        (r.user_id,'compras','administrar'),
        (r.user_id,'ventas','administrar'),
        (r.user_id,'pos','administrar'),
        (r.user_id,'traspasos','administrar'),
        (r.user_id,'devoluciones_proveedor','administrar'),
        (r.user_id,'inventario','administrar'),
        (r.user_id,'caducidades','administrar'),
        (r.user_id,'rotacion','consultar'),
        (r.user_id,'rentabilidad_lotes','consultar'),
        (r.user_id,'reportes','consultar'),
        (r.user_id,'cuentas_por_pagar','capturar'),
        (r.user_id,'bancos','consultar'),
        (r.user_id,'conciliacion','capturar'),
        (r.user_id,'contabilidad','sin_acceso'),
        (r.user_id,'reportes_admin','consultar'),
        (r.user_id,'cfdi','capturar'),
        (r.user_id,'impuestos','sin_acceso'),
        (r.user_id,'nomina','sin_acceso'),
        (r.user_id,'cargas_masivas','capturar'),
        (r.user_id,'ventas_offline','consultar'),
        (r.user_id,'actividad','consultar'),
        (r.user_id,'super_admin','sin_acceso')
      ON CONFLICT (user_id, modulo) DO NOTHING;

    ELSIF r.role = 'subgerente' THEN
      INSERT INTO public.user_module_access (user_id, modulo, nivel_acceso) VALUES
        (r.user_id,'articulos','capturar'),
        (r.user_id,'proveedores','consultar'),
        (r.user_id,'listas_precios','consultar'),
        (r.user_id,'clientes','capturar'),
        (r.user_id,'compras','capturar'),
        (r.user_id,'ventas','capturar'),
        (r.user_id,'pos','capturar'),
        (r.user_id,'traspasos','capturar'),
        (r.user_id,'devoluciones_proveedor','capturar'),
        (r.user_id,'inventario','capturar'),
        (r.user_id,'caducidades','consultar'),
        (r.user_id,'rotacion','consultar'),
        (r.user_id,'rentabilidad_lotes','sin_acceso'),
        (r.user_id,'reportes','consultar'),
        (r.user_id,'cuentas_por_pagar','consultar'),
        (r.user_id,'bancos','sin_acceso'),
        (r.user_id,'conciliacion','sin_acceso'),
        (r.user_id,'contabilidad','sin_acceso'),
        (r.user_id,'reportes_admin','sin_acceso'),
        (r.user_id,'cfdi','sin_acceso'),
        (r.user_id,'impuestos','sin_acceso'),
        (r.user_id,'nomina','sin_acceso'),
        (r.user_id,'cargas_masivas','sin_acceso'),
        (r.user_id,'ventas_offline','consultar'),
        (r.user_id,'actividad','sin_acceso'),
        (r.user_id,'super_admin','sin_acceso')
      ON CONFLICT (user_id, modulo) DO NOTHING;

    ELSIF r.role IN ('ventas','almacen_ventas') THEN
      INSERT INTO public.user_module_access (user_id, modulo, nivel_acceso) VALUES
        (r.user_id,'articulos','consultar'),
        (r.user_id,'clientes','capturar'),
        (r.user_id,'ventas','capturar'),
        (r.user_id,'pos','capturar'),
        (r.user_id,'inventario','consultar'),
        (r.user_id,'caducidades','consultar'),
        (r.user_id,'ventas_offline','capturar')
      ON CONFLICT (user_id, modulo) DO NOTHING;

    ELSIF r.role = 'almacen' THEN
      INSERT INTO public.user_module_access (user_id, modulo, nivel_acceso) VALUES
        (r.user_id,'articulos','consultar'),
        (r.user_id,'inventario','capturar'),
        (r.user_id,'traspasos','capturar'),
        (r.user_id,'caducidades','capturar'),
        (r.user_id,'compras','consultar')
      ON CONFLICT (user_id, modulo) DO NOTHING;

    ELSIF r.role = 'repartidor' THEN
      INSERT INTO public.user_module_access (user_id, modulo, nivel_acceso) VALUES
        (r.user_id,'ventas','consultar'),
        (r.user_id,'clientes','consultar')
      ON CONFLICT (user_id, modulo) DO NOTHING;

    ELSIF r.role = 'auditoria' THEN
      INSERT INTO public.user_module_access (user_id, modulo, nivel_acceso)
      SELECT r.user_id, m, 'consultar'
      FROM unnest(ARRAY[
        'articulos','proveedores','clientes','compras','ventas','inventario','caducidades',
        'rotacion','rentabilidad_lotes','reportes','cuentas_por_pagar','bancos',
        'conciliacion','contabilidad','cfdi','actividad','reportes_admin'
      ]) AS m
      ON CONFLICT (user_id, modulo) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- 4. Re-conectar RLS de tablas sensibles al nuevo sistema
-- Convención: sumar has_module_access además del has_role existente (aditivo)

-- Cuentas por pagar
DROP POLICY IF EXISTS cxp_select_staff ON public.cuentas_por_pagar;
CREATE POLICY cxp_select_staff ON public.cuentas_por_pagar
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
    OR has_role(auth.uid(),'auditoria'::app_role)
    OR has_module_access(auth.uid(),'cuentas_por_pagar','consultar')
  );

DROP POLICY IF EXISTS cxp_write_staff ON public.cuentas_por_pagar;
CREATE POLICY cxp_write_staff ON public.cuentas_por_pagar
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
    OR has_module_access(auth.uid(),'cuentas_por_pagar','capturar')
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
    OR has_module_access(auth.uid(),'cuentas_por_pagar','capturar')
  );

-- pagos_cxp
DROP POLICY IF EXISTS pagos_cxp_select ON public.pagos_cxp;
CREATE POLICY pagos_cxp_select ON public.pagos_cxp
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'subgerente'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_role(auth.uid(),'auditoria'::app_role)
    OR has_module_access(auth.uid(),'cuentas_por_pagar','consultar')
  );

DROP POLICY IF EXISTS pagos_cxp_write ON public.pagos_cxp;
CREATE POLICY pagos_cxp_write ON public.pagos_cxp
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'cuentas_por_pagar','capturar')
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'cuentas_por_pagar','capturar')
  );

-- Bancos (cuentas)
DROP POLICY IF EXISTS ctas_bancarias_select ON public.cuentas_bancarias;
CREATE POLICY ctas_bancarias_select ON public.cuentas_bancarias
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_role(auth.uid(),'auditoria'::app_role)
    OR has_module_access(auth.uid(),'bancos','consultar')
  );

DROP POLICY IF EXISTS ctas_bancarias_write ON public.cuentas_bancarias;
CREATE POLICY ctas_bancarias_write ON public.cuentas_bancarias
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'bancos','capturar')
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'bancos','capturar')
  );

-- Bancos (movimientos)
DROP POLICY IF EXISTS mov_banc_select ON public.movimientos_bancarios;
CREATE POLICY mov_banc_select ON public.movimientos_bancarios
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_role(auth.uid(),'auditoria'::app_role)
    OR has_module_access(auth.uid(),'bancos','consultar')
  );

DROP POLICY IF EXISTS mov_banc_write ON public.movimientos_bancarios;
CREATE POLICY mov_banc_write ON public.movimientos_bancarios
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'bancos','capturar')
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'bancos','capturar')
  );

-- Conciliación
DROP POLICY IF EXISTS "Auditoria ve conciliacion" ON public.conciliacion_bancaria;
CREATE POLICY "Auditoria ve conciliacion" ON public.conciliacion_bancaria
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'auditoria'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_module_access(auth.uid(),'conciliacion','consultar')
  );

DROP POLICY IF EXISTS conc_contador_select ON public.conciliacion_bancaria;
DROP POLICY IF EXISTS conc_contador_write ON public.conciliacion_bancaria;
CREATE POLICY conc_write ON public.conciliacion_bancaria
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'conciliacion','capturar')
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'conciliacion','capturar')
  );

-- Contabilidad (pólizas)
DROP POLICY IF EXISTS polizas_admin_all ON public.polizas;
CREATE POLICY polizas_all ON public.polizas
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'contabilidad','consultar')
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'contabilidad','capturar')
  );

-- CFDI
DROP POLICY IF EXISTS cfdi_select_fiscal ON public.cfdi_emitidos;
CREATE POLICY cfdi_select_fiscal ON public.cfdi_emitidos
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_role(auth.uid(),'contabilidad'::app_role)
    OR has_role(auth.uid(),'contraloria'::app_role)
    OR has_role(auth.uid(),'auditoria'::app_role)
    OR has_role(auth.uid(),'direccion'::app_role)
    OR has_module_access(auth.uid(),'cfdi','consultar')
  );

DROP POLICY IF EXISTS "Admin actualiza cfdi" ON public.cfdi_emitidos;
CREATE POLICY "Admin actualiza cfdi" ON public.cfdi_emitidos
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_module_access(auth.uid(),'cfdi','capturar')
  );

-- Empleados
DROP POLICY IF EXISTS emp_read_admin ON public.empleados;
CREATE POLICY emp_read_admin ON public.empleados
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_role(auth.uid(),'contabilidad'::app_role)
    OR has_role(auth.uid(),'contraloria'::app_role)
    OR has_role(auth.uid(),'direccion'::app_role)
    OR has_role(auth.uid(),'tesoreria'::app_role)
    OR has_module_access(auth.uid(),'nomina','consultar')
  );

DROP POLICY IF EXISTS emp_write ON public.empleados;
CREATE POLICY emp_write ON public.empleados
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'nomina','capturar')
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'nomina','capturar')
  );

-- Recibos nómina
DROP POLICY IF EXISTS rec_all ON public.recibos_nomina;
CREATE POLICY rec_all ON public.recibos_nomina
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'nomina','consultar')
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'contador'::app_role)
    OR has_module_access(auth.uid(),'nomina','capturar')
  );
