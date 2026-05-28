
-- ============ BLOQUE 1: Sucursales ============
UPDATE public.sucursales SET activo = false;

INSERT INTO public.sucursales (codigo, nombre, activo) VALUES
  ('SMX-SV',  'Distribuidora Farmacéutica Sanamex San Vicente',     true),
  ('SMX-F36', 'Distribuidora Farmacéutica Sanamex Iztapalapa F36',  true),
  ('SMX-H',   'Distribuidora Farmacéutica Sanamex Iztapalapa H',    true),
  ('SMX-ECA', 'Distribuidora Farmacéutica Sanamex Ecatepec',        true)
ON CONFLICT DO NOTHING;

UPDATE public.sucursales SET activo = true
WHERE codigo IN ('SMX-SV','SMX-F36','SMX-H','SMX-ECA');

INSERT INTO public.almacenes (sucursal_id, nombre, activo)
SELECT s.id, 'Almacén Principal', true
FROM public.sucursales s
WHERE s.codigo IN ('SMX-SV','SMX-F36','SMX-H','SMX-ECA')
  AND NOT EXISTS (SELECT 1 FROM public.almacenes a WHERE a.sucursal_id = s.id);

-- ============ BLOQUE 2: role_permissions + has_permission ============
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rol text NOT NULL,
  modulo text NOT NULL,
  submodulo text NOT NULL DEFAULT '_all',
  permitido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rol, modulo, submodulo)
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados ven permisos" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin gestiona permisos" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _modulo text, _submodulo text DEFAULT '_all')
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.rol = ur.role::text
    WHERE ur.user_id = _user_id
      AND rp.modulo = _modulo
      AND (rp.submodulo = _submodulo OR rp.submodulo = '_all')
      AND rp.permitido = true
  )
$$;

-- ============ BLOQUE 3: asignacion + password resets log ============
CREATE TABLE IF NOT EXISTS public.user_sucursal_asignacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sucursal_id uuid,
  es_principal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sucursal_id)
);

GRANT SELECT ON public.user_sucursal_asignacion TO authenticated;
GRANT ALL ON public.user_sucursal_asignacion TO service_role;

ALTER TABLE public.user_sucursal_asignacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados ven asignaciones" ON public.user_sucursal_asignacion
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin gestiona asignaciones" ON public.user_sucursal_asignacion
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TABLE IF NOT EXISTS public.password_resets_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  reset_by uuid NOT NULL,
  password_assigned text NOT NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.password_resets_log TO authenticated;
GRANT ALL ON public.password_resets_log TO service_role;

ALTER TABLE public.password_resets_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin ve resets" ON public.password_resets_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admin crea resets" ON public.password_resets_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ============ SEED de permisos (Matriz SICAR, sin restaurante) ============
-- Niveles altos: super_admin, admin, supervisor = TODO
INSERT INTO public.role_permissions (rol, modulo, submodulo, permitido)
SELECT r.rol, m.modulo, '_all', true
FROM (VALUES ('super_admin'),('admin'),('supervisor')) r(rol)
CROSS JOIN (VALUES
  ('operaciones'),('consultas'),('procesos'),('reportes'),('estadisticas'),('configuracion')
) m(modulo)
ON CONFLICT DO NOTHING;

-- Gerente / Subgerente
INSERT INTO public.role_permissions (rol, modulo, submodulo, permitido) VALUES
  ('gerente','operaciones','_all',true),
  ('gerente','consultas','_all',true),
  ('gerente','procesos','asistencia',true),
  ('gerente','reportes','_all',true),
  ('gerente','configuracion','_all',true),
  ('subgerente','operaciones','_all',true),
  ('subgerente','consultas','_all',true),
  ('subgerente','procesos','asistencia',true),
  ('subgerente','reportes','_all',true),
  ('subgerente','configuracion','_all',true)
ON CONFLICT DO NOTHING;

-- Auditoría
INSERT INTO public.role_permissions (rol, modulo, submodulo, permitido) VALUES
  ('auditoria','operaciones','articulos',true),
  ('auditoria','operaciones','inv_inicial',true),
  ('auditoria','operaciones','ajuste_inv',true),
  ('auditoria','operaciones','lotes_series',true),
  ('auditoria','consultas','compras',true),
  ('auditoria','consultas','traspasos_ent',true),
  ('auditoria','consultas','ajuste_inv',true),
  ('auditoria','consultas','lotes',true),
  ('auditoria','consultas','articulos',true),
  ('auditoria','reportes','_all',true)
ON CONFLICT DO NOTHING;

-- Almacén / Ventas
INSERT INTO public.role_permissions (rol, modulo, submodulo, permitido) VALUES
  ('almacen_ventas','operaciones','ventas',true),
  ('almacen_ventas','operaciones','traspasos_ent',true),
  ('almacen_ventas','operaciones','factura_cfdi',true),
  ('almacen_ventas','operaciones','cotizacion',true),
  ('almacen_ventas','operaciones','corte_caja',true),
  ('almacen_ventas','operaciones','articulos',true),
  ('almacen_ventas','operaciones','clientes',true),
  ('almacen_ventas','consultas','ventas',true),
  ('almacen_ventas','consultas','traspasos_sal',true),
  ('almacen_ventas','consultas','traspasos_ent',true),
  ('almacen_ventas','reportes','_all',true)
ON CONFLICT DO NOTHING;

-- Ventas
INSERT INTO public.role_permissions (rol, modulo, submodulo, permitido) VALUES
  ('ventas','operaciones','ventas',true),
  ('ventas','operaciones','factura_cfdi',true),
  ('ventas','operaciones','cotizacion',true),
  ('ventas','operaciones','corte_caja',true),
  ('ventas','operaciones','articulos',true),
  ('ventas','operaciones','clientes',true),
  ('ventas','consultas','ventas',true),
  ('ventas','reportes','_all',true)
ON CONFLICT DO NOTHING;

-- Repartidor (chofer): solo rutas/entregas
INSERT INTO public.role_permissions (rol, modulo, submodulo, permitido) VALUES
  ('repartidor','operaciones','rutas',true),
  ('repartidor','consultas','rutas',true)
ON CONFLICT DO NOTHING;
