
-- 1. Sucursales: es_cedis
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS es_cedis boolean NOT NULL DEFAULT false;
UPDATE public.sucursales SET es_cedis = true WHERE tipo = 'cedis';
UPDATE public.sucursales SET es_cedis = false WHERE tipo <> 'cedis';

-- 2. Contabilidad: consolidación
ALTER TABLE public.contabilidad_parametros
  ADD COLUMN IF NOT EXISTS consolidacion_activa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sucursales_contables integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS sucursales_fiscales integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS modo_prorrateo_cedis text NOT NULL DEFAULT 'equitativo';

ALTER TABLE public.contabilidad_parametros
  DROP CONSTRAINT IF EXISTS chk_modo_prorrateo_cedis;
ALTER TABLE public.contabilidad_parametros
  ADD CONSTRAINT chk_modo_prorrateo_cedis CHECK (modo_prorrateo_cedis IN ('equitativo','ponderado'));

UPDATE public.contabilidad_parametros
  SET consolidacion_activa = true,
      sucursales_contables = 5,
      sucursales_fiscales = 4,
      modo_prorrateo_cedis = 'equitativo',
      updated_at = now()
  WHERE id = 1;

-- 3-4. Impuestos: IEPS off, ISN vigencia
ALTER TABLE public.impuestos_parametros
  ADD COLUMN IF NOT EXISTS isn_vigencia_desde date NOT NULL DEFAULT '2026-01-01',
  ADD COLUMN IF NOT EXISTS isn_entidad text NOT NULL DEFAULT 'Estado de México';

UPDATE public.impuestos_parametros
  SET ieps_activo = false,
      isn_tasa_pct = 3.00,
      isn_vigencia_desde = '2026-01-01',
      isn_entidad = 'Estado de México',
      updated_at = now()
  WHERE id = 1;

-- 5. Roles: agregar direccion y contabilidad al enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='app_role' AND e.enumlabel='direccion') THEN
    ALTER TYPE public.app_role ADD VALUE 'direccion';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='app_role' AND e.enumlabel='contabilidad') THEN
    ALTER TYPE public.app_role ADD VALUE 'contabilidad';
  END IF;
END $$;

-- Matriz de permisos administrativos
CREATE TABLE IF NOT EXISTS public.admin_permisos_matriz (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rol public.app_role NOT NULL,
  area text NOT NULL,
  consultar boolean NOT NULL DEFAULT false,
  capturar boolean NOT NULL DEFAULT false,
  autorizar_pagos boolean NOT NULL DEFAULT false,
  autorizar_dispersion boolean NOT NULL DEFAULT false,
  dispersar boolean NOT NULL DEFAULT false,
  puesto_asociado text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rol, area)
);

GRANT SELECT ON public.admin_permisos_matriz TO authenticated;
GRANT ALL ON public.admin_permisos_matriz TO service_role;

ALTER TABLE public.admin_permisos_matriz ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_permisos_matriz_read_auth" ON public.admin_permisos_matriz;
CREATE POLICY "admin_permisos_matriz_read_auth"
  ON public.admin_permisos_matriz FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_permisos_matriz_admin_write" ON public.admin_permisos_matriz;
CREATE POLICY "admin_permisos_matriz_admin_write"
  ON public.admin_permisos_matriz FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- 6. Auditoría accesos
CREATE TABLE IF NOT EXISTS public.auditoria_accesos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil text NOT NULL UNIQUE,
  modo text NOT NULL DEFAULT 'solo_lectura' CHECK (modo IN ('solo_lectura','lectura_escritura')),
  modificable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.auditoria_accesos TO authenticated;
GRANT ALL ON public.auditoria_accesos TO service_role;
ALTER TABLE public.auditoria_accesos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auditoria_accesos_read" ON public.auditoria_accesos;
CREATE POLICY "auditoria_accesos_read" ON public.auditoria_accesos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auditoria_accesos_admin_write" ON public.auditoria_accesos;
CREATE POLICY "auditoria_accesos_admin_write" ON public.auditoria_accesos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

INSERT INTO public.auditoria_accesos (perfil, modo, modificable) VALUES
  ('Departamento de Auditoría','solo_lectura', true),
  ('Dirección General','solo_lectura', true),
  ('Dirección Comercial','solo_lectura', true)
ON CONFLICT (perfil) DO UPDATE SET modo=EXCLUDED.modo, modificable=EXCLUDED.modificable, updated_at=now();

-- 7. Configuración de alertas
CREATE TABLE IF NOT EXISTS public.configuracion_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  valor_numero numeric,
  valor_texto text,
  descripcion text,
  vigencia_desde date NOT NULL DEFAULT CURRENT_DATE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.configuracion_alertas TO authenticated;
GRANT ALL ON public.configuracion_alertas TO service_role;
ALTER TABLE public.configuracion_alertas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cfg_alertas_read" ON public.configuracion_alertas;
CREATE POLICY "cfg_alertas_read" ON public.configuracion_alertas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cfg_alertas_admin_write" ON public.configuracion_alertas;
CREATE POLICY "cfg_alertas_admin_write" ON public.configuracion_alertas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

INSERT INTO public.configuracion_alertas (clave, valor_numero, descripcion)
VALUES ('dias_alerta_caducidad', 90, 'Días previos a caducidad para alertar en inventario y reportes')
ON CONFLICT (clave) DO UPDATE SET valor_numero=EXCLUDED.valor_numero, descripcion=EXCLUDED.descripcion, updated_at=now();
