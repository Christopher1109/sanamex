-- ============================================================
-- SCRIPT DE EXPORTACIÓN DE BASE DE DATOS
-- Sistema CB Médica - Gestión de Anestesia
-- Generado: 2024
-- ============================================================

-- PARTE 1: TIPOS ENUM
-- ============================================================

CREATE TYPE public.app_role AS ENUM (
  'gerente',
  'supervisor', 
  'lider',
  'almacenista',
  'auxiliar',
  'gerente_operaciones',
  'gerente_almacen',
  'cadena_suministros',
  'finanzas'
);

CREATE TYPE public.especialidad_medica AS ENUM (
  'anestesiologia',
  'cirugia_general',
  'traumatologia',
  'ginecologia',
  'urologia',
  'otra'
);

CREATE TYPE public.estado_folio AS ENUM ('activo', 'cancelado', 'completado');
CREATE TYPE public.estado_traspaso AS ENUM ('pendiente', 'aprobado', 'rechazado', 'completado');
CREATE TYPE public.genero AS ENUM ('masculino', 'femenino');

-- PARTE 2: TABLAS BASE (sin foreign keys)
-- ============================================================

-- Estados/Regiones
CREATE TABLE public.states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Hospitales
CREATE TABLE public.hospitales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  codigo TEXT,
  budget_code TEXT,
  display_name TEXT,
  hospital_type TEXT,
  clinic_number TEXT,
  locality TEXT,
  state_id UUID REFERENCES public.states(id),
  estado_id UUID,
  empresa_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Catálogo de Insumos
CREATE TABLE public.insumos_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  clave TEXT,
  descripcion TEXT,
  categoria TEXT,
  tipo TEXT DEFAULT 'insumo',
  unidad TEXT DEFAULT 'pieza',
  presentacion TEXT,
  familia_insumo TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Perfiles de usuario
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  username TEXT,
  hospital_id UUID REFERENCES public.hospitales(id),
  departamento TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Roles de usuario
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- Tabla de usuarios (para referencia, no auth)
CREATE TABLE public.users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  hospital_budget_code TEXT,
  hospital_display_name TEXT,
  state_name TEXT,
  assigned_hospitals TEXT,
  supervisor_group INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Almacenes
CREATE TABLE public.almacenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  nombre TEXT NOT NULL,
  ubicacion TEXT DEFAULT 'Almacén general',
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(hospital_id)
);

-- Inventario por Hospital
CREATE TABLE public.inventario_hospital (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  almacen_id UUID NOT NULL REFERENCES public.almacenes(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  lote TEXT,
  cantidad_inicial INTEGER DEFAULT 0,
  cantidad_actual INTEGER DEFAULT 0,
  cantidad_minima INTEGER DEFAULT 10,
  cantidad_maxima INTEGER,
  fecha_caducidad DATE,
  ubicacion TEXT DEFAULT 'Almacén general',
  estatus TEXT DEFAULT 'activo',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(almacen_id, insumo_catalogo_id, lote)
);

-- Almacén Central
CREATE TABLE public.almacen_central (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_disponible INTEGER DEFAULT 0,
  lote TEXT,
  fecha_caducidad DATE,
  ubicacion TEXT DEFAULT 'Almacén Central México',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Médicos
CREATE TABLE public.medicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  especialidad public.especialidad_medica NOT NULL,
  hospital_id UUID REFERENCES public.hospitales(id),
  hospital_display_name TEXT,
  hospital_budget_code TEXT,
  state_name TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Folios
CREATE TABLE public.folios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_folio TEXT NOT NULL,
  hospital_id UUID REFERENCES public.hospitales(id),
  hospital_display_name TEXT,
  hospital_budget_code TEXT,
  state_name TEXT,
  fecha DATE DEFAULT CURRENT_DATE,
  estado public.estado_folio DEFAULT 'activo',
  -- Datos del paciente
  paciente_nombre TEXT,
  paciente_apellido_paterno TEXT,
  paciente_apellido_materno TEXT,
  paciente_nss TEXT,
  paciente_edad INTEGER,
  paciente_edad_valor INTEGER,
  paciente_edad_unidad TEXT,
  paciente_genero TEXT,
  -- Datos del procedimiento
  tipo_anestesia TEXT,
  anestesia_principal TEXT,
  anestesia_secundaria TEXT,
  cirugia TEXT,
  especialidad_quirurgica TEXT,
  tipo_cirugia TEXT,
  tipo_evento TEXT,
  numero_quirofano TEXT,
  unidad TEXT,
  -- Tiempos
  hora_inicio_anestesia TIME,
  hora_fin_anestesia TIME,
  hora_inicio_procedimiento TIME,
  hora_fin_procedimiento TIME,
  -- Personal médico
  medico_id UUID REFERENCES public.medicos(id),
  cirujano_id UUID REFERENCES public.medicos(id),
  cirujano_nombre TEXT,
  anestesiologo_id UUID REFERENCES public.medicos(id),
  anestesiologo_nombre TEXT,
  -- Otros
  observaciones TEXT,
  cancelado_por UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insumos de Folio
CREATE TABLE public.folios_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id UUID REFERENCES public.folios(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES public.insumos_catalogo(id),
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insumos Adicionales de Folio
CREATE TABLE public.folios_insumos_adicionales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id UUID NOT NULL REFERENCES public.folios(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad INTEGER DEFAULT 1,
  motivo TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Configuración de Insumos
CREATE TABLE public.insumo_configuracion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  min_global_inventario INTEGER,
  max_global_inventario INTEGER,
  min_anestesia INTEGER,
  max_anestesia INTEGER,
  cantidad_default INTEGER,
  tipo_anestesia TEXT,
  tipo_limite TEXT,
  grupo_exclusivo TEXT,
  condicionante TEXT,
  nota TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Alertas de Insumos
CREATE TABLE public.insumos_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  inventario_id UUID REFERENCES public.inventario_hospital(id),
  cantidad_actual INTEGER DEFAULT 0,
  minimo_permitido INTEGER DEFAULT 0,
  prioridad TEXT DEFAULT 'media',
  estado TEXT DEFAULT 'activa',
  generado_por UUID,
  enviado_a_supervisor BOOLEAN DEFAULT false,
  enviado_a_gerente_operaciones BOOLEAN DEFAULT false,
  notas TEXT,
  resuelto_at TIMESTAMPTZ,
  resuelto_por UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Almacenes Provisionales
CREATE TABLE public.almacenes_provisionales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  es_principal BOOLEAN DEFAULT false,
  activo BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inventario de Almacén Provisional
CREATE TABLE public.almacen_provisional_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_provisional_id UUID NOT NULL REFERENCES public.almacenes_provisionales(id) ON DELETE CASCADE,
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_disponible INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Movimientos de Inventario
CREATE TABLE public.movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  inventario_id UUID NOT NULL REFERENCES public.inventario_hospital(id),
  tipo_movimiento TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  cantidad_anterior INTEGER,
  cantidad_nueva INTEGER,
  folio_id UUID REFERENCES public.folios(id),
  traspaso_id UUID,
  usuario_id UUID,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Movimientos de Almacén Provisional
CREATE TABLE public.movimientos_almacen_provisional (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  almacen_provisional_id UUID NOT NULL REFERENCES public.almacenes_provisionales(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  tipo TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  folio_id UUID REFERENCES public.folios(id),
  usuario_id UUID,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Rutas de Distribución
CREATE TABLE public.rutas_distribucion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_ruta TEXT NOT NULL,
  tipo TEXT NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Hospitales por Ruta
CREATE TABLE public.rutas_hospitales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ruta_id UUID NOT NULL REFERENCES public.rutas_distribucion(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Transferencias Central-Hospital
CREATE TABLE public.transferencias_central_hospital (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_destino_id UUID NOT NULL REFERENCES public.hospitales(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  ruta_id UUID REFERENCES public.rutas_distribucion(id),
  cantidad_enviada INTEGER DEFAULT 0,
  fecha DATE DEFAULT CURRENT_DATE,
  estado TEXT DEFAULT 'pendiente',
  tirada_id UUID,
  enviado_por UUID,
  recibido_por UUID,
  recibido_at TIMESTAMPTZ,
  alerta_creada BOOLEAN DEFAULT false,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Alertas de Transferencia
CREATE TABLE public.alertas_transferencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transferencia_id UUID NOT NULL REFERENCES public.transferencias_central_hospital(id),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_enviada INTEGER DEFAULT 0,
  cantidad_aceptada INTEGER,
  cantidad_merma INTEGER DEFAULT 0,
  motivo_merma TEXT,
  estado TEXT DEFAULT 'pendiente',
  tirada_id UUID,
  aceptada_por UUID,
  aceptada_at TIMESTAMPTZ,
  notificado BOOLEAN DEFAULT false,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Mermas de Transferencia
CREATE TABLE public.mermas_transferencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transferencia_id UUID REFERENCES public.transferencias_central_hospital(id),
  alerta_transferencia_id UUID REFERENCES public.alertas_transferencia(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_enviada INTEGER NOT NULL,
  cantidad_recibida INTEGER NOT NULL,
  cantidad_merma INTEGER NOT NULL,
  motivo TEXT,
  registrado_por UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Documentos de Necesidades (Agrupado)
CREATE TABLE public.documentos_necesidades_agrupado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_generacion TIMESTAMPTZ DEFAULT now(),
  estado TEXT DEFAULT 'generado',
  generado_por UUID,
  enviado_a_gerente_almacen BOOLEAN DEFAULT false,
  enviado_at TIMESTAMPTZ,
  procesado_por_almacen BOOLEAN DEFAULT false,
  procesado_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Detalle de Documento Agrupado
CREATE TABLE public.documento_agrupado_detalle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.documentos_necesidades_agrupado(id) ON DELETE CASCADE,
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  total_faltante_requerido INTEGER DEFAULT 0,
  cantidad_cubierta INTEGER DEFAULT 0,
  cantidad_pendiente INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Documentos de Necesidades (Segmentado)
CREATE TABLE public.documentos_necesidades_segmentado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_generacion TIMESTAMPTZ DEFAULT now(),
  estado TEXT DEFAULT 'generado',
  generado_por UUID,
  enviado_a_cadena_suministros BOOLEAN DEFAULT false,
  enviado_at TIMESTAMPTZ,
  procesado_por_cadena BOOLEAN DEFAULT false,
  procesado_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Detalle de Documento Segmentado
CREATE TABLE public.documento_segmentado_detalle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.documentos_necesidades_segmentado(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  existencia_actual INTEGER DEFAULT 0,
  minimo INTEGER DEFAULT 0,
  faltante_requerido INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pedidos de Compra
CREATE TABLE public.pedidos_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_pedido TEXT NOT NULL,
  documento_origen_id UUID REFERENCES public.documentos_necesidades_agrupado(id),
  formato_origen_id UUID,
  estado TEXT DEFAULT 'pendiente',
  total_items INTEGER DEFAULT 0,
  proveedor TEXT,
  fecha_estimada_entrega DATE,
  creado_por UUID,
  aprobado_por UUID,
  aprobado_at TIMESTAMPTZ,
  completado_at TIMESTAMPTZ,
  enviado_a_cadena BOOLEAN DEFAULT false,
  enviado_a_cadena_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Items de Pedido
CREATE TABLE public.pedido_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos_compra(id) ON DELETE CASCADE,
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_solicitada INTEGER DEFAULT 0,
  cantidad_recibida INTEGER DEFAULT 0,
  cantidad_merma INTEGER DEFAULT 0,
  precio_unitario NUMERIC,
  estado TEXT DEFAULT 'pendiente',
  motivo_merma TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Formatos Generados
CREATE TABLE public.formatos_generados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  hospital_id UUID REFERENCES public.hospitales(id),
  data_json JSONB DEFAULT '{}',
  estado TEXT DEFAULT 'generado',
  pdf_url TEXT,
  generado_por UUID,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Requerimientos de Insumos
CREATE TABLE public.insumos_requerimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  alerta_origen_id UUID REFERENCES public.insumos_alertas(id),
  cantidad_requerida INTEGER DEFAULT 0,
  prioridad TEXT DEFAULT 'media',
  estado TEXT DEFAULT 'pendiente',
  generado_por UUID,
  aprobado_por UUID,
  aprobado_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Procedimientos de Hospital
CREATE TABLE public.hospital_procedimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  procedimiento_clave TEXT NOT NULL,
  procedimiento_nombre TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Asignaciones Supervisor-Hospital
CREATE TABLE public.supervisor_hospital_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_user_id UUID NOT NULL,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(supervisor_user_id, hospital_id)
);

-- Insumos de Anestesia (configuración por procedimiento)
CREATE TABLE public.anestesia_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_anestesia TEXT NOT NULL,
  insumo_id UUID REFERENCES public.insumos(id),
  id_bcb TEXT,
  categoria TEXT,
  cantidad_minima INTEGER DEFAULT 0,
  cantidad_maxima INTEGER,
  cantidad_default INTEGER DEFAULT 1,
  tipo_limite TEXT DEFAULT 'rango',
  grupo_exclusivo TEXT,
  condicionante TEXT,
  nota TEXT,
  unidad TEXT,
  orden INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Paquetes de Anestesia
CREATE TABLE public.paquetes_anestesia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  descripcion TEXT,
  hospital_display_name TEXT,
  hospital_budget_code TEXT,
  state_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insumos de Paquete
CREATE TABLE public.paquete_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paquete_id UUID REFERENCES public.paquetes_anestesia(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES public.insumos(id),
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Traspasos entre unidades
CREATE TABLE public.traspasos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_traspaso TEXT NOT NULL,
  fecha DATE DEFAULT CURRENT_DATE,
  estado public.estado_traspaso DEFAULT 'pendiente',
  unidad_origen TEXT,
  unidad_destino TEXT,
  hospital_display_name_origen TEXT,
  hospital_display_name_destino TEXT,
  hospital_budget_code_origen TEXT,
  hospital_budget_code_destino TEXT,
  state_name_origen TEXT,
  state_name_destino TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insumos de Traspaso
CREATE TABLE public.traspaso_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traspaso_id UUID REFERENCES public.traspasos(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES public.insumos(id),
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insumos (tabla legacy)
CREATE TABLE public.insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  clave TEXT,
  descripcion TEXT,
  lote TEXT,
  cantidad INTEGER DEFAULT 0,
  fecha_entrada DATE DEFAULT CURRENT_DATE,
  fecha_caducidad DATE,
  hospital_id UUID REFERENCES public.hospitales(id),
  hospital_display_name TEXT,
  hospital_budget_code TEXT,
  state_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Procedimientos
CREATE TABLE public.procedimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  clave_procedimiento TEXT,
  descripcion TEXT,
  hospital_id UUID REFERENCES public.hospitales(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unidades
CREATE TABLE public.unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  hospital_id UUID REFERENCES public.hospitales(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Configuración Excel
CREATE TABLE public.excel_insumo_config (
  id SERIAL PRIMARY KEY,
  nombre_insumo TEXT NOT NULL,
  tipo_anestesia TEXT NOT NULL,
  id_bcb TEXT,
  min_excel INTEGER,
  max_excel INTEGER,
  tiene_valores_claros BOOLEAN DEFAULT true,
  observaciones TEXT
);

-- PARTE 3: FUNCIONES
-- ============================================================

-- Función para verificar roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Función para verificar gerente almacén
CREATE OR REPLACE FUNCTION public.is_gerente_almacen(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id 
    AND role = 'gerente_almacen'::app_role
  )
$$;

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Función para recalcular alertas
CREATE OR REPLACE FUNCTION public.recalcular_alerta_insumo(p_hospital_id uuid, p_insumo_catalogo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existencia_actual INTEGER;
    v_minimo INTEGER;
    v_inventario_id UUID;
    v_alerta_existente UUID;
BEGIN
    SELECT 
        ih.id,
        COALESCE(SUM(ih.cantidad_actual), 0)
    INTO v_inventario_id, v_existencia_actual
    FROM public.inventario_hospital ih
    WHERE ih.hospital_id = p_hospital_id 
    AND ih.insumo_catalogo_id = p_insumo_catalogo_id
    GROUP BY ih.id
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(ic.min_global_inventario, 10)
    INTO v_minimo
    FROM public.insumo_configuracion ic
    WHERE ic.insumo_catalogo_id = p_insumo_catalogo_id
    LIMIT 1;

    IF v_minimo IS NULL THEN
        v_minimo := 10;
    END IF;

    SELECT id INTO v_alerta_existente
    FROM public.insumos_alertas
    WHERE hospital_id = p_hospital_id
    AND insumo_catalogo_id = p_insumo_catalogo_id
    AND estado = 'activa'
    LIMIT 1;

    IF v_existencia_actual <= v_minimo THEN
        IF v_alerta_existente IS NULL THEN
            INSERT INTO public.insumos_alertas (
                hospital_id, insumo_catalogo_id, inventario_id,
                cantidad_actual, minimo_permitido, prioridad, estado
            ) VALUES (
                p_hospital_id, p_insumo_catalogo_id, v_inventario_id,
                v_existencia_actual, v_minimo,
                CASE 
                    WHEN v_existencia_actual = 0 THEN 'critica'
                    WHEN v_existencia_actual < (v_minimo * 0.5) THEN 'alta'
                    WHEN v_existencia_actual < (v_minimo * 0.75) THEN 'media'
                    ELSE 'baja'
                END,
                'activa'
            );
        ELSE
            UPDATE public.insumos_alertas
            SET cantidad_actual = v_existencia_actual,
                minimo_permitido = v_minimo,
                prioridad = CASE 
                    WHEN v_existencia_actual = 0 THEN 'critica'
                    WHEN v_existencia_actual < (v_minimo * 0.5) THEN 'alta'
                    WHEN v_existencia_actual < (v_minimo * 0.75) THEN 'media'
                    ELSE 'baja'
                END,
                updated_at = now()
            WHERE id = v_alerta_existente;
        END IF;
    ELSE
        IF v_alerta_existente IS NOT NULL THEN
            UPDATE public.insumos_alertas
            SET estado = 'resuelta', resuelto_at = now(), updated_at = now()
            WHERE id = v_alerta_existente;
        END IF;
    END IF;
END;
$$;

-- Trigger para verificar inventario mínimo
CREATE OR REPLACE FUNCTION public.check_inventario_minimo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alerta_existente UUID;
  v_minimo INTEGER;
BEGIN
  SELECT COALESCE(ic.min_global_inventario, 10)
  INTO v_minimo
  FROM public.insumo_configuracion ic
  WHERE ic.insumo_catalogo_id = NEW.insumo_catalogo_id
  LIMIT 1;

  IF v_minimo IS NULL THEN
    v_minimo := 10;
  END IF;

  IF NEW.cantidad_actual < v_minimo THEN
    SELECT id INTO alerta_existente
    FROM public.insumos_alertas
    WHERE inventario_id = NEW.id AND estado = 'activa'
    LIMIT 1;
    
    IF alerta_existente IS NULL THEN
      INSERT INTO public.insumos_alertas (
        hospital_id, insumo_catalogo_id, inventario_id,
        cantidad_actual, minimo_permitido, prioridad
      ) VALUES (
        NEW.hospital_id, NEW.insumo_catalogo_id, NEW.id,
        NEW.cantidad_actual, v_minimo,
        CASE 
          WHEN NEW.cantidad_actual = 0 THEN 'critica'
          WHEN NEW.cantidad_actual < (v_minimo * 0.5) THEN 'alta'
          WHEN NEW.cantidad_actual < (v_minimo * 0.75) THEN 'media'
          ELSE 'baja'
        END
      );
    ELSE
      UPDATE public.insumos_alertas
      SET cantidad_actual = NEW.cantidad_actual,
          minimo_permitido = v_minimo,
          prioridad = CASE 
            WHEN NEW.cantidad_actual = 0 THEN 'critica'
            WHEN NEW.cantidad_actual < (v_minimo * 0.5) THEN 'alta'
            WHEN NEW.cantidad_actual < (v_minimo * 0.75) THEN 'media'
            ELSE 'baja'
          END,
          updated_at = now()
      WHERE id = alerta_existente;
    END IF;
  ELSE
    UPDATE public.insumos_alertas
    SET estado = 'resuelta', resuelto_at = now(), updated_at = now()
    WHERE inventario_id = NEW.id AND estado = 'activa';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger para invocar recálculo
CREATE OR REPLACE FUNCTION public.trigger_check_inventario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.recalcular_alerta_insumo(NEW.hospital_id, NEW.insumo_catalogo_id);
    RETURN NEW;
END;
$$;

-- PARTE 4: TRIGGERS
-- ============================================================

CREATE TRIGGER check_inventario_minimo_trigger
  AFTER INSERT OR UPDATE ON public.inventario_hospital
  FOR EACH ROW
  EXECUTE FUNCTION public.check_inventario_minimo();

CREATE TRIGGER check_inventario_trigger
  AFTER UPDATE ON public.inventario_hospital
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_check_inventario();

-- PARTE 5: HABILITAR RLS
-- ============================================================

ALTER TABLE public.alertas_transferencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almacen_central ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almacen_provisional_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almacenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almacenes_provisionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anestesia_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_agrupado_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_segmentado_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_necesidades_agrupado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_necesidades_segmentado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excel_insumo_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folios_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folios_insumos_adicionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formatos_generados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_procedimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumo_configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumos_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumos_requerimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_hospital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mermas_transferencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_almacen_provisional ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paquete_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paquetes_anestesia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutas_distribucion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutas_hospitales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- PARTE 6: POLÍTICAS RLS (ejemplos principales)
-- ============================================================

-- Hospitales - todos pueden ver
CREATE POLICY "All can view hospitales" ON public.hospitales FOR SELECT USING (true);

-- Insumos catálogo - todos pueden ver
CREATE POLICY "Todos pueden ver catálogo de insumos" ON public.insumos_catalogo FOR SELECT USING (true);
CREATE POLICY "Usuarios autenticados pueden crear insumos en catálogo" ON public.insumos_catalogo FOR INSERT WITH CHECK (true);
CREATE POLICY "Usuarios autenticados pueden actualizar catálogo" ON public.insumos_catalogo FOR UPDATE USING (true);

-- Folios
CREATE POLICY "All can view folios" ON public.folios FOR SELECT USING (true);
CREATE POLICY "Usuarios autenticados pueden crear folios" ON public.folios FOR INSERT WITH CHECK (true);
CREATE POLICY "Usuarios autenticados pueden actualizar folios" ON public.folios FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Supervisores y gerentes pueden eliminar folios" ON public.folios FOR DELETE USING (
  has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'gerente'::app_role)
);

-- Inventario
CREATE POLICY "Todos pueden ver inventario" ON public.inventario_hospital FOR SELECT USING (true);
CREATE POLICY "Usuarios autenticados pueden crear inventario" ON public.inventario_hospital FOR INSERT WITH CHECK (true);
CREATE POLICY "Usuarios autenticados pueden actualizar inventario" ON public.inventario_hospital FOR UPDATE USING (true);

-- User roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Profiles  
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- (Agregar el resto de políticas según necesidad)

-- PARTE 7: REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.inventario_hospital;
ALTER PUBLICATION supabase_realtime ADD TABLE public.almacen_provisional_inventario;
ALTER PUBLICATION supabase_realtime ADD TABLE public.insumos_alertas;

-- Configurar REPLICA IDENTITY para realtime
ALTER TABLE public.inventario_hospital REPLICA IDENTITY FULL;
ALTER TABLE public.almacen_provisional_inventario REPLICA IDENTITY FULL;
