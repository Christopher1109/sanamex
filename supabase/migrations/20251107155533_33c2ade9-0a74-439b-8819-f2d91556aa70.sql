-- =====================================================
-- MULTITENANCY: Jerarquía Organizacional
-- Empresa → Estado → Hospital → Unidad
-- =====================================================

-- 1. Crear tablas de jerarquía organizacional
CREATE TABLE IF NOT EXISTS public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  codigo TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.estados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  codigo TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS public.hospitales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estado_id UUID NOT NULL REFERENCES public.estados(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  direccion TEXT,
  telefono TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  codigo TEXT NOT NULL,
  tipo TEXT, -- 'quirofano', 'urgencias', 'hospitalizacion', etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(hospital_id, codigo)
);

-- 2. Crear empresa y estructura inicial (Grupo CB)
INSERT INTO public.empresas (id, nombre, codigo)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'Grupo CB', 'GCB')
ON CONFLICT (codigo) DO NOTHING;

-- 3. Crear algunos estados de ejemplo
INSERT INTO public.estados (empresa_id, nombre, codigo) VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Nuevo León', 'NL'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Jalisco', 'JAL'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Ciudad de México', 'CDMX'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Guanajuato', 'GTO')
ON CONFLICT DO NOTHING;

-- 4. Crear hospitales de ejemplo para los datos existentes
INSERT INTO public.hospitales (estado_id, codigo, nombre)
SELECT 
  e.id,
  'HGZ6-NL',
  'Hospital General de Zona 6 - Nuevo León'
FROM public.estados e
WHERE e.codigo = 'NL'
ON CONFLICT DO NOTHING;

INSERT INTO public.hospitales (estado_id, codigo, nombre)
SELECT 
  e.id,
  'HGZ-NORTE',
  'Hospital General Zona Norte'
FROM public.estados e
WHERE e.codigo = 'NL'
ON CONFLICT DO NOTHING;

INSERT INTO public.hospitales (estado_id, codigo, nombre)
SELECT 
  e.id,
  'HGZ-SUR',
  'Hospital General Zona Sur'
FROM public.estados e
WHERE e.codigo = 'JAL'
ON CONFLICT DO NOTHING;

INSERT INTO public.hospitales (estado_id, codigo, nombre)
SELECT 
  e.id,
  'HGZ-ESTE',
  'Hospital General Zona Este'
FROM public.estados e
WHERE e.codigo = 'CDMX'
ON CONFLICT DO NOTHING;

-- 5. Agregar hospital_id a tablas existentes
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES public.hospitales(id);

ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES public.hospitales(id),
ADD COLUMN IF NOT EXISTS estado_id UUID REFERENCES public.estados(id),
ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id),
ADD COLUMN IF NOT EXISTS alcance TEXT DEFAULT 'hospital' CHECK (alcance IN ('hospital', 'estado', 'empresa'));

ALTER TABLE public.folios 
ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES public.hospitales(id);

ALTER TABLE public.insumos 
ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES public.hospitales(id);

ALTER TABLE public.medicos 
ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES public.hospitales(id);

ALTER TABLE public.traspasos
ADD COLUMN IF NOT EXISTS hospital_origen_id UUID REFERENCES public.hospitales(id),
ADD COLUMN IF NOT EXISTS hospital_destino_id UUID REFERENCES public.hospitales(id);

-- 6. Migrar datos existentes de "unidad" text a hospital_id
-- Mapeo: "Unidad Central" -> HGZ6-NL, "Unidad Norte" -> HGZ-NORTE, etc.
UPDATE public.profiles p
SET hospital_id = h.id
FROM public.hospitales h
WHERE p.hospital_id IS NULL
  AND ((p.unidad ILIKE '%central%' AND h.codigo = 'HGZ6-NL')
    OR (p.unidad ILIKE '%norte%' AND h.codigo = 'HGZ-NORTE')
    OR (p.unidad ILIKE '%sur%' AND h.codigo = 'HGZ-SUR')
    OR (p.unidad ILIKE '%este%' AND h.codigo = 'HGZ-ESTE'));

UPDATE public.folios f
SET hospital_id = h.id
FROM public.hospitales h
WHERE f.hospital_id IS NULL
  AND ((f.unidad ILIKE '%central%' AND h.codigo = 'HGZ6-NL')
    OR (f.unidad ILIKE '%norte%' AND h.codigo = 'HGZ-NORTE')
    OR (f.unidad ILIKE '%sur%' AND h.codigo = 'HGZ-SUR')
    OR (f.unidad ILIKE '%este%' AND h.codigo = 'HGZ-ESTE'));

UPDATE public.insumos i
SET hospital_id = h.id
FROM public.hospitales h
WHERE i.hospital_id IS NULL
  AND ((i.unidad ILIKE '%central%' AND h.codigo = 'HGZ6-NL')
    OR (i.unidad ILIKE '%norte%' AND h.codigo = 'HGZ-NORTE')
    OR (i.unidad ILIKE '%sur%' AND h.codigo = 'HGZ-SUR')
    OR (i.unidad ILIKE '%este%' AND h.codigo = 'HGZ-ESTE'));

UPDATE public.medicos m
SET hospital_id = h.id
FROM public.hospitales h
WHERE m.hospital_id IS NULL
  AND ((m.unidad ILIKE '%central%' AND h.codigo = 'HGZ6-NL')
    OR (m.unidad ILIKE '%norte%' AND h.codigo = 'HGZ-NORTE')
    OR (m.unidad ILIKE '%sur%' AND h.codigo = 'HGZ-SUR')
    OR (m.unidad ILIKE '%este%' AND h.codigo = 'HGZ-ESTE'));

UPDATE public.traspasos t
SET hospital_origen_id = ho.id,
    hospital_destino_id = hd.id
FROM public.hospitales ho, public.hospitales hd
WHERE t.hospital_origen_id IS NULL
  AND ((t.unidad_origen ILIKE '%central%' AND ho.codigo = 'HGZ6-NL')
    OR (t.unidad_origen ILIKE '%norte%' AND ho.codigo = 'HGZ-NORTE')
    OR (t.unidad_origen ILIKE '%sur%' AND ho.codigo = 'HGZ-SUR')
    OR (t.unidad_origen ILIKE '%este%' AND ho.codigo = 'HGZ-ESTE'))
  AND ((t.unidad_destino ILIKE '%central%' AND hd.codigo = 'HGZ6-NL')
    OR (t.unidad_destino ILIKE '%norte%' AND hd.codigo = 'HGZ-NORTE')
    OR (t.unidad_destino ILIKE '%sur%' AND hd.codigo = 'HGZ-SUR')
    OR (t.unidad_destino ILIKE '%este%' AND hd.codigo = 'HGZ-ESTE'));

-- Asignar hospital_id a user_roles basado en profiles
UPDATE public.user_roles ur
SET hospital_id = p.hospital_id
FROM public.profiles p
WHERE ur.user_id = p.id AND ur.hospital_id IS NULL;

-- 7. Crear tabla de auditoría
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  hospital_id UUID REFERENCES public.hospitales(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 8. Funciones helper para RLS mejorado
CREATE OR REPLACE FUNCTION public.get_user_hospital_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hospital_id FROM public.profiles WHERE id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_estado_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.estado_id 
  FROM public.profiles p
  JOIN public.hospitales h ON p.hospital_id = h.id
  WHERE p.id = _user_id 
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_empresa_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.empresa_id 
  FROM public.profiles p
  JOIN public.hospitales h ON p.hospital_id = h.id
  JOIN public.estados e ON h.estado_id = e.id
  WHERE p.id = _user_id 
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_has_hospital_access(_user_id uuid, _hospital_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
    AND (
      (ur.alcance = 'hospital' AND ur.hospital_id = _hospital_id)
      OR (ur.alcance = 'estado' AND ur.estado_id = (SELECT estado_id FROM public.hospitales WHERE id = _hospital_id))
      OR (ur.alcance = 'empresa')
      OR ur.role IN ('gerente', 'supervisor')
    )
  );
$$;

-- 9. Actualizar RLS policies para usar hospital_id

-- RLS para empresas, estados, hospitales (todos pueden ver)
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos pueden ver empresas" ON public.empresas FOR SELECT USING (true);
CREATE POLICY "Todos pueden ver estados" ON public.estados FOR SELECT USING (true);
CREATE POLICY "Todos pueden ver hospitales" ON public.hospitales FOR SELECT USING (true);
CREATE POLICY "Todos pueden ver unidades" ON public.unidades FOR SELECT USING (true);

-- Actualizar RLS de insumos
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver insumos de su unidad" ON public.insumos;
CREATE POLICY "Usuarios pueden ver insumos de su hospital o alcance mayor"
ON public.insumos FOR SELECT
USING (
  hospital_id = public.get_user_hospital_id(auth.uid())
  OR public.user_has_hospital_access(auth.uid(), hospital_id)
  OR has_any_role(auth.uid(), ARRAY['supervisor'::app_role, 'gerente'::app_role])
);

DROP POLICY IF EXISTS "Almacenistas, líderes, supervisores y gerentes pueden crear in" ON public.insumos;
CREATE POLICY "Usuarios autorizados pueden crear insumos en su hospital"
ON public.insumos FOR INSERT
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['almacenista'::app_role, 'lider'::app_role, 'supervisor'::app_role, 'gerente'::app_role])
  AND (hospital_id = public.get_user_hospital_id(auth.uid()) OR public.user_has_hospital_access(auth.uid(), hospital_id))
);

DROP POLICY IF EXISTS "Almacenistas, líderes, supervisores y gerentes pueden actualiz" ON public.insumos;
CREATE POLICY "Usuarios autorizados pueden actualizar insumos de su hospital"
ON public.insumos FOR UPDATE
USING (
  has_any_role(auth.uid(), ARRAY['almacenista'::app_role, 'lider'::app_role, 'supervisor'::app_role, 'gerente'::app_role])
  AND (hospital_id = public.get_user_hospital_id(auth.uid()) OR public.user_has_hospital_access(auth.uid(), hospital_id))
);

-- Actualizar RLS de folios
DROP POLICY IF EXISTS "Usuarios pueden ver folios de su unidad" ON public.folios;
CREATE POLICY "Usuarios pueden ver folios de su hospital"
ON public.folios FOR SELECT
USING (
  hospital_id = public.get_user_hospital_id(auth.uid())
  OR public.user_has_hospital_access(auth.uid(), hospital_id)
  OR has_any_role(auth.uid(), ARRAY['supervisor'::app_role, 'gerente'::app_role])
);

DROP POLICY IF EXISTS "Auxiliares, líderes, supervisores y gerentes pueden crear foli" ON public.folios;
CREATE POLICY "Usuarios autorizados pueden crear folios en su hospital"
ON public.folios FOR INSERT
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['auxiliar'::app_role, 'lider'::app_role, 'supervisor'::app_role, 'gerente'::app_role])
  AND (hospital_id = public.get_user_hospital_id(auth.uid()) OR public.user_has_hospital_access(auth.uid(), hospital_id))
);

-- Actualizar RLS de medicos
DROP POLICY IF EXISTS "Todos los usuarios autenticados pueden ver médicos" ON public.medicos;
CREATE POLICY "Usuarios pueden ver médicos de su hospital"
ON public.medicos FOR SELECT
USING (
  hospital_id = public.get_user_hospital_id(auth.uid())
  OR public.user_has_hospital_access(auth.uid(), hospital_id)
  OR has_any_role(auth.uid(), ARRAY['supervisor'::app_role, 'gerente'::app_role])
);

DROP POLICY IF EXISTS "Líderes, supervisores y gerentes pueden gestionar médicos" ON public.medicos;
CREATE POLICY "Usuarios autorizados pueden gestionar médicos de su hospital"
ON public.medicos FOR ALL
USING (
  has_any_role(auth.uid(), ARRAY['lider'::app_role, 'supervisor'::app_role, 'gerente'::app_role])
  AND (hospital_id = public.get_user_hospital_id(auth.uid()) OR public.user_has_hospital_access(auth.uid(), hospital_id))
);

-- RLS para audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo gerentes pueden ver audit logs"
ON public.audit_logs FOR SELECT
USING (has_role(auth.uid(), 'gerente'::app_role));

-- 10. Índices para performance
CREATE INDEX IF NOT EXISTS idx_profiles_hospital_id ON public.profiles(hospital_id);
CREATE INDEX IF NOT EXISTS idx_folios_hospital_id ON public.folios(hospital_id);
CREATE INDEX IF NOT EXISTS idx_insumos_hospital_id ON public.insumos(hospital_id);
CREATE INDEX IF NOT EXISTS idx_medicos_hospital_id ON public.medicos(hospital_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_hospital_id ON public.user_roles(hospital_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_alcance ON public.user_roles(user_id, alcance);
CREATE INDEX IF NOT EXISTS idx_audit_logs_hospital_id ON public.audit_logs(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospitales_estado_id ON public.hospitales(estado_id);
CREATE INDEX IF NOT EXISTS idx_estados_empresa_id ON public.estados(empresa_id);

-- 11. Triggers para updated_at
CREATE TRIGGER update_empresas_updated_at BEFORE UPDATE ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_estados_updated_at BEFORE UPDATE ON public.estados
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hospitales_updated_at BEFORE UPDATE ON public.hospitales
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_unidades_updated_at BEFORE UPDATE ON public.unidades
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();