-- Crear enum para roles de usuario
CREATE TYPE app_role AS ENUM ('auxiliar', 'almacenista', 'lider', 'supervisor', 'gerente');

-- Crear enum para especialidades médicas
CREATE TYPE especialidad_medica AS ENUM ('anestesiologo', 'cirujano');

-- Crear enum para géneros
CREATE TYPE genero AS ENUM ('M', 'F', 'Otro');

-- Crear enum para tipos de anestesia
CREATE TYPE tipo_anestesia AS ENUM (
  'general_balanceada_adulto',
  'general_balanceada_pediatrica',
  'general_alta_especialidad',
  'general_endovenosa',
  'locorregional',
  'sedacion'
);

-- Crear enum para origen de insumos
CREATE TYPE origen_insumo AS ENUM ('LOAD', 'Prestado');

-- Crear enum para estados
CREATE TYPE estado_folio AS ENUM ('activo', 'cancelado');
CREATE TYPE estado_traspaso AS ENUM ('pendiente', 'completado', 'rechazado');

-- Tabla de perfiles de usuario
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_completo TEXT,
  unidad TEXT NOT NULL DEFAULT 'Unidad Central',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Tabla de roles de usuario (separada por seguridad)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Tabla de médicos
CREATE TABLE public.medicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  especialidad especialidad_medica NOT NULL,
  subespecialidad TEXT,
  unidad TEXT NOT NULL,
  telefono TEXT,
  procedimientos_realizados INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.medicos ENABLE ROW LEVEL SECURITY;

-- Tabla de insumos
CREATE TABLE public.insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  lote TEXT NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad >= 0),
  fecha_caducidad DATE NOT NULL,
  unidad TEXT NOT NULL,
  origen origen_insumo NOT NULL,
  stock_minimo INTEGER NOT NULL DEFAULT 10,
  categoria TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;

-- Tabla de paquetes de anestesia
CREATE TABLE public.paquetes_anestesia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_anestesia NOT NULL UNIQUE,
  descripcion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.paquetes_anestesia ENABLE ROW LEVEL SECURITY;

-- Tabla de insumos por paquete (relación muchos a muchos)
CREATE TABLE public.paquete_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paquete_id UUID NOT NULL REFERENCES public.paquetes_anestesia(id) ON DELETE CASCADE,
  nombre_insumo TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.paquete_insumos ENABLE ROW LEVEL SECURITY;

-- Tabla de folios
CREATE TABLE public.folios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_folio TEXT NOT NULL UNIQUE,
  paciente_nombre TEXT NOT NULL,
  paciente_edad INTEGER NOT NULL CHECK (paciente_edad >= 0 AND paciente_edad <= 150),
  paciente_genero genero NOT NULL,
  cirugia TEXT NOT NULL,
  tipo_anestesia tipo_anestesia NOT NULL,
  cirujano_id UUID REFERENCES public.medicos(id),
  anestesiologo_id UUID REFERENCES public.medicos(id),
  unidad TEXT NOT NULL,
  estado estado_folio NOT NULL DEFAULT 'activo',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  cancelado_por UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.folios ENABLE ROW LEVEL SECURITY;

-- Tabla de insumos utilizados en folios
CREATE TABLE public.folio_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id UUID NOT NULL REFERENCES public.folios(id) ON DELETE CASCADE,
  nombre_insumo TEXT NOT NULL,
  lote TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.folio_insumos ENABLE ROW LEVEL SECURITY;

-- Tabla de traspasos entre unidades
CREATE TABLE public.traspasos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad_origen TEXT NOT NULL,
  unidad_destino TEXT NOT NULL,
  estado estado_traspaso NOT NULL DEFAULT 'pendiente',
  solicitado_por UUID NOT NULL REFERENCES public.profiles(id),
  aprobado_por UUID REFERENCES public.profiles(id),
  motivo_rechazo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.traspasos ENABLE ROW LEVEL SECURITY;

-- Tabla de insumos en traspasos
CREATE TABLE public.traspaso_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traspaso_id UUID NOT NULL REFERENCES public.traspasos(id) ON DELETE CASCADE,
  nombre_insumo TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.traspaso_insumos ENABLE ROW LEVEL SECURITY;

-- Función para verificar roles (evita recursión en RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Función para verificar si el usuario tiene alguno de varios roles
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles app_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = ANY(_roles)
  )
$$;

-- Función para actualizar timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Función para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre_completo, unidad)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'unidad', 'Unidad Central')
  );
  
  -- Asignar rol inicial (auxiliar por defecto)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'auxiliar')
  );
  
  RETURN NEW;
END;
$$;

-- Trigger para crear perfil automáticamente
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Triggers para actualizar timestamps
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_medicos_updated_at
  BEFORE UPDATE ON public.medicos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_insumos_updated_at
  BEFORE UPDATE ON public.insumos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_paquetes_updated_at
  BEFORE UPDATE ON public.paquetes_anestesia
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_folios_updated_at
  BEFORE UPDATE ON public.folios
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_traspasos_updated_at
  BEFORE UPDATE ON public.traspasos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===== POLÍTICAS RLS =====

-- Políticas para profiles
CREATE POLICY "Los usuarios pueden ver su propio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Los usuarios pueden actualizar su propio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Políticas para user_roles
CREATE POLICY "Los usuarios pueden ver sus propios roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Solo gerentes pueden gestionar roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'gerente'));

-- Políticas para médicos
CREATE POLICY "Todos los usuarios autenticados pueden ver médicos"
  ON public.medicos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Líderes, supervisores y gerentes pueden gestionar médicos"
  ON public.medicos FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['lider', 'supervisor', 'gerente']::app_role[]));

-- Políticas para insumos
CREATE POLICY "Usuarios autenticados pueden ver insumos de su unidad"
  ON public.insumos FOR SELECT
  TO authenticated
  USING (
    unidad IN (
      SELECT profiles.unidad FROM public.profiles WHERE profiles.id = auth.uid()
    )
    OR public.has_any_role(auth.uid(), ARRAY['supervisor', 'gerente']::app_role[])
  );

CREATE POLICY "Almacenistas, líderes, supervisores y gerentes pueden crear insumos"
  ON public.insumos FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['almacenista', 'lider', 'supervisor', 'gerente']::app_role[])
  );

CREATE POLICY "Almacenistas, líderes, supervisores y gerentes pueden actualizar insumos"
  ON public.insumos FOR UPDATE
  USING (
    public.has_any_role(auth.uid(), ARRAY['almacenista', 'lider', 'supervisor', 'gerente']::app_role[])
  );

-- Políticas para paquetes de anestesia
CREATE POLICY "Todos los usuarios autenticados pueden ver paquetes"
  ON public.paquetes_anestesia FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Líderes, supervisores y gerentes pueden gestionar paquetes"
  ON public.paquetes_anestesia FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['lider', 'supervisor', 'gerente']::app_role[]));

-- Políticas para paquete_insumos
CREATE POLICY "Todos los usuarios autenticados pueden ver insumos de paquetes"
  ON public.paquete_insumos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Líderes, supervisores y gerentes pueden gestionar insumos de paquetes"
  ON public.paquete_insumos FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['lider', 'supervisor', 'gerente']::app_role[]));

-- Políticas para folios
CREATE POLICY "Usuarios pueden ver folios de su unidad"
  ON public.folios FOR SELECT
  TO authenticated
  USING (
    unidad IN (
      SELECT profiles.unidad FROM public.profiles WHERE profiles.id = auth.uid()
    )
    OR public.has_any_role(auth.uid(), ARRAY['supervisor', 'gerente']::app_role[])
  );

CREATE POLICY "Auxiliares, líderes, supervisores y gerentes pueden crear folios"
  ON public.folios FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['auxiliar', 'lider', 'supervisor', 'gerente']::app_role[])
  );

CREATE POLICY "Líderes, supervisores y gerentes pueden actualizar folios"
  ON public.folios FOR UPDATE
  USING (
    public.has_any_role(auth.uid(), ARRAY['lider', 'supervisor', 'gerente']::app_role[])
  );

-- Políticas para folio_insumos
CREATE POLICY "Usuarios pueden ver insumos de folios que pueden ver"
  ON public.folio_insumos FOR SELECT
  TO authenticated
  USING (
    folio_id IN (
      SELECT id FROM public.folios
      WHERE folios.unidad IN (
        SELECT profiles.unidad FROM public.profiles WHERE profiles.id = auth.uid()
      )
      OR public.has_any_role(auth.uid(), ARRAY['supervisor', 'gerente']::app_role[])
    )
  );

CREATE POLICY "Usuarios que pueden crear folios pueden agregar insumos"
  ON public.folio_insumos FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['auxiliar', 'lider', 'supervisor', 'gerente']::app_role[])
  );

-- Políticas para traspasos
CREATE POLICY "Gerentes pueden ver todos los traspasos"
  ON public.traspasos FOR SELECT
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Solo gerentes pueden crear traspasos"
  ON public.traspasos FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Solo gerentes pueden actualizar traspasos"
  ON public.traspasos FOR UPDATE
  USING (public.has_role(auth.uid(), 'gerente'));

-- Políticas para traspaso_insumos
CREATE POLICY "Gerentes pueden ver insumos de traspasos"
  ON public.traspaso_insumos FOR SELECT
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerentes pueden gestionar insumos de traspasos"
  ON public.traspaso_insumos FOR ALL
  USING (public.has_role(auth.uid(), 'gerente'));

-- Insertar paquetes de anestesia por defecto
INSERT INTO public.paquetes_anestesia (tipo, descripcion) VALUES
  ('general_balanceada_adulto', 'Para procedimientos quirúrgicos generales en adultos'),
  ('general_balanceada_pediatrica', 'Adaptado para pacientes pediátricos'),
  ('general_alta_especialidad', 'Para cirugías complejas de larga duración'),
  ('general_endovenosa', 'Técnica totalmente intravenosa'),
  ('locorregional', 'Bloqueos nerviosos y epidurales'),
  ('sedacion', 'Para procedimientos ambulatorios y endoscopías');

-- Insertar insumos de ejemplo por paquete
INSERT INTO public.paquete_insumos (paquete_id, nombre_insumo, cantidad)
SELECT 
  p.id,
  i.nombre,
  i.cantidad
FROM public.paquetes_anestesia p
CROSS JOIN LATERAL (
  VALUES
    ('Propofol 200mg', 2),
    ('Fentanilo 500mcg', 1),
    ('Rocuronio 50mg', 1),
    ('Sevoflurano', 1)
) AS i(nombre, cantidad)
WHERE p.tipo = 'general_balanceada_adulto'

UNION ALL

SELECT 
  p.id,
  i.nombre,
  i.cantidad
FROM public.paquetes_anestesia p
CROSS JOIN LATERAL (
  VALUES
    ('Propofol 200mg', 1),
    ('Fentanilo 500mcg', 1),
    ('Rocuronio 50mg', 1),
    ('Sevoflurano', 1)
) AS i(nombre, cantidad)
WHERE p.tipo = 'general_balanceada_pediatrica'

UNION ALL

SELECT 
  p.id,
  i.nombre,
  i.cantidad
FROM public.paquetes_anestesia p
CROSS JOIN LATERAL (
  VALUES
    ('Propofol 200mg', 3),
    ('Fentanilo 500mcg', 2),
    ('Rocuronio 50mg', 2),
    ('Remifentanilo', 1),
    ('Sevoflurano', 2)
) AS i(nombre, cantidad)
WHERE p.tipo = 'general_alta_especialidad'

UNION ALL

SELECT 
  p.id,
  i.nombre,
  i.cantidad
FROM public.paquetes_anestesia p
CROSS JOIN LATERAL (
  VALUES
    ('Propofol 200mg', 4),
    ('Remifentanilo', 2),
    ('Rocuronio 50mg', 1)
) AS i(nombre, cantidad)
WHERE p.tipo = 'general_endovenosa'

UNION ALL

SELECT 
  p.id,
  i.nombre,
  i.cantidad
FROM public.paquetes_anestesia p
CROSS JOIN LATERAL (
  VALUES
    ('Lidocaína 2%', 2),
    ('Bupivacaína 0.5%', 2),
    ('Fentanilo 500mcg', 1)
) AS i(nombre, cantidad)
WHERE p.tipo = 'locorregional'

UNION ALL

SELECT 
  p.id,
  i.nombre,
  i.cantidad
FROM public.paquetes_anestesia p
CROSS JOIN LATERAL (
  VALUES
    ('Propofol 200mg', 1),
    ('Midazolam', 1),
    ('Fentanilo 500mcg', 1)
) AS i(nombre, cantidad)
WHERE p.tipo = 'sedacion';

-- Crear índices para mejorar el rendimiento
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);
CREATE INDEX idx_medicos_especialidad ON public.medicos(especialidad);
CREATE INDEX idx_medicos_unidad ON public.medicos(unidad);
CREATE INDEX idx_insumos_unidad ON public.insumos(unidad);
CREATE INDEX idx_insumos_fecha_caducidad ON public.insumos(fecha_caducidad);
CREATE INDEX idx_folios_unidad ON public.folios(unidad);
CREATE INDEX idx_folios_created_at ON public.folios(created_at);
CREATE INDEX idx_folios_estado ON public.folios(estado);
CREATE INDEX idx_traspasos_estado ON public.traspasos(estado);