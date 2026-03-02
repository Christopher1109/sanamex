-- ============================================================
-- MIGRACIÓN COMPLETA CB MÉDICA - SISTEMA DE ANESTESIA
-- Ejecutar en tu proyecto Supabase NUEVO
-- ============================================================

-- PASO 1: CREAR TIPOS ENUM
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'gerente', 'supervisor', 'lider', 'almacenista', 'auxiliar',
    'gerente_operaciones', 'gerente_almacen', 'cadena_suministros', 'finanzas'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.especialidad_medica AS ENUM (
    'anestesiologia', 'cirugia_general', 'traumatologia', 
    'ginecologia', 'urologia', 'otra'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.estado_folio AS ENUM (
    'activo', 'cancelado', 'completado', 'borrador'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.estado_traspaso AS ENUM (
    'pendiente', 'aprobado', 'rechazado', 'completado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.genero AS ENUM ('masculino', 'femenino');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.tipo_actividad AS ENUM (
    'folio_creado', 'folio_cancelado', 'folio_borrador_creado', 'folio_borrador_eliminado',
    'traspaso_almacen_provisional', 'devolucion_almacen_principal', 'recepcion_almacen_central',
    'ajuste_inventario', 'almacen_provisional_creado', 'almacen_provisional_eliminado',
    'insumo_agregado', 'insumo_modificado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- PASO 2: CREAR TABLAS
-- ============================================================

-- Estados
CREATE TABLE IF NOT EXISTS public.states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Hospitales
CREATE TABLE IF NOT EXISTS public.hospitales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  codigo TEXT,
  display_name TEXT,
  budget_code TEXT,
  clinic_number TEXT,
  locality TEXT,
  hospital_type TEXT,
  state_id UUID REFERENCES public.states(id),
  estado_id UUID,
  empresa_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Catálogo de Insumos
CREATE TABLE IF NOT EXISTS public.insumos_catalogo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  clave TEXT,
  descripcion TEXT,
  categoria TEXT,
  unidad TEXT DEFAULT 'pieza',
  tipo TEXT DEFAULT 'insumo',
  presentacion TEXT,
  familia_insumo TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Configuración de Insumos
CREATE TABLE IF NOT EXISTS public.insumo_configuracion (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  min_global_inventario INTEGER,
  max_global_inventario INTEGER,
  min_anestesia INTEGER,
  max_anestesia INTEGER,
  cantidad_default INTEGER,
  tipo_anestesia TEXT,
  nota TEXT,
  condicionante TEXT,
  grupo_exclusivo TEXT,
  tipo_limite TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insumos de Anestesia
CREATE TABLE IF NOT EXISTS public.anestesia_insumos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_anestesia TEXT NOT NULL,
  insumo_id UUID,
  id_bcb TEXT,
  categoria TEXT,
  unidad TEXT,
  cantidad_default INTEGER DEFAULT 1,
  cantidad_minima INTEGER DEFAULT 0,
  cantidad_maxima INTEGER,
  condicionante TEXT,
  grupo_exclusivo TEXT,
  tipo_limite TEXT DEFAULT 'rango',
  nota TEXT,
  orden INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insumos (legacy)
CREATE TABLE IF NOT EXISTS public.insumos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  clave TEXT,
  descripcion TEXT,
  cantidad INTEGER DEFAULT 0,
  lote TEXT,
  fecha_caducidad DATE,
  fecha_entrada DATE DEFAULT CURRENT_DATE,
  hospital_id UUID REFERENCES public.hospitales(id),
  hospital_display_name TEXT,
  hospital_budget_code TEXT,
  state_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Almacenes
CREATE TABLE IF NOT EXISTS public.almacenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  ubicacion TEXT DEFAULT 'Almacén general',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(hospital_id)
);

-- Almacenes Provisionales
CREATE TABLE IF NOT EXISTS public.almacenes_provisionales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  es_principal BOOLEAN DEFAULT false,
  activo BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Inventario Hospital
CREATE TABLE IF NOT EXISTS public.inventario_hospital (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  almacen_id UUID NOT NULL REFERENCES public.almacenes(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_actual INTEGER DEFAULT 0,
  cantidad_inicial INTEGER DEFAULT 0,
  cantidad_minima INTEGER DEFAULT 10,
  cantidad_maxima INTEGER,
  lote TEXT,
  fecha_caducidad DATE,
  ubicacion TEXT DEFAULT 'Almacén general',
  estatus TEXT DEFAULT 'activo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Inventario Consolidado
CREATE TABLE IF NOT EXISTS public.inventario_consolidado (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  almacen_id UUID NOT NULL REFERENCES public.almacenes(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_total INTEGER NOT NULL DEFAULT 0,
  cantidad_minima INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Inventario Lotes
CREATE TABLE IF NOT EXISTS public.inventario_lotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consolidado_id UUID NOT NULL REFERENCES public.inventario_consolidado(id),
  lote TEXT,
  cantidad INTEGER NOT NULL DEFAULT 0,
  fecha_caducidad DATE,
  fecha_entrada TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ubicacion TEXT DEFAULT 'Almacén general',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Almacén Central
CREATE TABLE IF NOT EXISTS public.almacen_central (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_disponible INTEGER NOT NULL DEFAULT 0,
  ubicacion TEXT DEFAULT 'Almacén Central México',
  lote TEXT,
  fecha_caducidad DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inventario Almacén Provisional
CREATE TABLE IF NOT EXISTS public.almacen_provisional_inventario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  almacen_provisional_id UUID NOT NULL REFERENCES public.almacenes_provisionales(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_disponible INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL PRIMARY KEY,
  nombre TEXT NOT NULL,
  username TEXT,
  hospital_id UUID REFERENCES public.hospitales(id),
  departamento TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User Roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Users
CREATE TABLE IF NOT EXISTS public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  role public.app_role NOT NULL,
  hospital_id UUID REFERENCES public.hospitales(id),
  state_id UUID REFERENCES public.states(id),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Supervisor Hospital Assignments
CREATE TABLE IF NOT EXISTS public.supervisor_hospital_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, hospital_id)
);

-- Médicos
CREATE TABLE IF NOT EXISTS public.medicos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  especialidad public.especialidad_medica NOT NULL,
  hospital_id UUID REFERENCES public.hospitales(id),
  hospital_display_name TEXT,
  hospital_budget_code TEXT,
  state_name TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Folios
CREATE TABLE IF NOT EXISTS public.folios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_folio TEXT NOT NULL,
  hospital_id UUID REFERENCES public.hospitales(id),
  almacen_provisional_id UUID REFERENCES public.almacenes_provisionales(id),
  medico_id UUID REFERENCES public.medicos(id),
  anestesiologo_id UUID REFERENCES public.medicos(id),
  cirujano_id UUID REFERENCES public.medicos(id),
  anestesiologo_nombre TEXT,
  cirujano_nombre TEXT,
  estado public.estado_folio DEFAULT 'activo',
  fecha DATE DEFAULT CURRENT_DATE,
  tipo_anestesia TEXT,
  anestesia_principal TEXT,
  anestesia_secundaria TEXT,
  tipo_evento TEXT,
  tipo_cirugia TEXT,
  especialidad_quirurgica TEXT,
  cirugia TEXT,
  numero_quirofano TEXT,
  unidad TEXT,
  hora_inicio_procedimiento TIME,
  hora_fin_procedimiento TIME,
  hora_inicio_anestesia TIME,
  hora_fin_anestesia TIME,
  paciente_nombre TEXT,
  paciente_apellido_paterno TEXT,
  paciente_apellido_materno TEXT,
  paciente_nss TEXT,
  paciente_genero TEXT,
  paciente_edad INTEGER,
  paciente_edad_valor INTEGER,
  paciente_edad_unidad TEXT,
  paciente_fecha_nacimiento DATE,
  observaciones TEXT,
  hospital_display_name TEXT,
  hospital_budget_code TEXT,
  state_name TEXT,
  cancelado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Folios Insumos
CREATE TABLE IF NOT EXISTS public.folios_insumos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folio_id UUID REFERENCES public.folios(id),
  insumo_id UUID REFERENCES public.insumos_catalogo(id),
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Folios Insumos Adicionales
CREATE TABLE IF NOT EXISTS public.folios_insumos_adicionales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folio_id UUID NOT NULL REFERENCES public.folios(id),
  insumo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad INTEGER NOT NULL DEFAULT 1,
  motivo TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Movimientos Inventario
CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventario_id UUID NOT NULL REFERENCES public.inventario_hospital(id),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  cantidad INTEGER NOT NULL,
  cantidad_anterior INTEGER,
  cantidad_nueva INTEGER,
  tipo_movimiento TEXT NOT NULL,
  observaciones TEXT,
  folio_id UUID REFERENCES public.folios(id),
  traspaso_id UUID,
  usuario_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Movimientos Almacén Provisional
CREATE TABLE IF NOT EXISTS public.movimientos_almacen_provisional (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  almacen_provisional_id UUID NOT NULL REFERENCES public.almacenes_provisionales(id),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  folio_id UUID REFERENCES public.folios(id),
  usuario_id UUID,
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Alertas de Insumos
CREATE TABLE IF NOT EXISTS public.insumos_alertas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  inventario_id UUID REFERENCES public.inventario_hospital(id),
  consolidado_id UUID REFERENCES public.inventario_consolidado(id),
  cantidad_actual INTEGER NOT NULL DEFAULT 0,
  minimo_permitido INTEGER NOT NULL DEFAULT 0,
  prioridad TEXT NOT NULL DEFAULT 'media',
  estado TEXT NOT NULL DEFAULT 'activa',
  notas TEXT,
  generado_por UUID,
  enviado_a_supervisor BOOLEAN NOT NULL DEFAULT false,
  enviado_a_gerente_operaciones BOOLEAN NOT NULL DEFAULT false,
  resuelto_at TIMESTAMP WITH TIME ZONE,
  resuelto_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Transferencias Central Hospital
CREATE TABLE IF NOT EXISTS public.transferencias_central_hospital (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  estado TEXT NOT NULL DEFAULT 'pendiente',
  notas TEXT,
  creado_por UUID,
  confirmado_por UUID,
  tirada_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Alertas Transferencia
CREATE TABLE IF NOT EXISTS public.alertas_transferencia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transferencia_id UUID NOT NULL REFERENCES public.transferencias_central_hospital(id),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_enviada INTEGER NOT NULL DEFAULT 0,
  cantidad_aceptada INTEGER,
  cantidad_merma INTEGER DEFAULT 0,
  motivo_merma TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  notificado BOOLEAN DEFAULT false,
  notas TEXT,
  tirada_id UUID,
  aceptada_at TIMESTAMP WITH TIME ZONE,
  aceptada_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Mermas Transferencia
CREATE TABLE IF NOT EXISTS public.mermas_transferencia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transferencia_id UUID REFERENCES public.transferencias_central_hospital(id),
  alerta_transferencia_id UUID REFERENCES public.alertas_transferencia(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_enviada INTEGER NOT NULL,
  cantidad_recibida INTEGER NOT NULL,
  cantidad_merma INTEGER NOT NULL,
  motivo TEXT,
  registrado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Documentos Necesidades Agrupado
CREATE TABLE IF NOT EXISTS public.documentos_necesidades_agrupado (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha_generacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  estado TEXT NOT NULL DEFAULT 'generado',
  notas TEXT,
  generado_por UUID,
  enviado_a_gerente_almacen BOOLEAN DEFAULT false,
  enviado_at TIMESTAMP WITH TIME ZONE,
  procesado_por_almacen BOOLEAN DEFAULT false,
  procesado_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Documento Agrupado Detalle
CREATE TABLE IF NOT EXISTS public.documento_agrupado_detalle (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  documento_id UUID NOT NULL REFERENCES public.documentos_necesidades_agrupado(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  total_faltante_requerido INTEGER NOT NULL DEFAULT 0,
  cantidad_cubierta INTEGER DEFAULT 0,
  cantidad_pendiente INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Documentos Necesidades Segmentado
CREATE TABLE IF NOT EXISTS public.documentos_necesidades_segmentado (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha_generacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  estado TEXT NOT NULL DEFAULT 'generado',
  notas TEXT,
  generado_por UUID,
  enviado_a_cadena_suministros BOOLEAN DEFAULT false,
  enviado_at TIMESTAMP WITH TIME ZONE,
  procesado_por_cadena BOOLEAN DEFAULT false,
  procesado_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Documento Segmentado Detalle
CREATE TABLE IF NOT EXISTS public.documento_segmentado_detalle (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  documento_id UUID NOT NULL REFERENCES public.documentos_necesidades_segmentado(id),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  existencia_actual INTEGER NOT NULL DEFAULT 0,
  minimo INTEGER NOT NULL DEFAULT 0,
  faltante_requerido INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Pedidos Compra
CREATE TABLE IF NOT EXISTS public.pedidos_compra (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_pedido TEXT NOT NULL,
  documento_origen_id UUID REFERENCES public.documentos_necesidades_agrupado(id),
  formato_origen_id UUID,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  proveedor TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  creado_por UUID,
  aprobado_por UUID,
  aprobado_at TIMESTAMP WITH TIME ZONE,
  fecha_estimada_entrega DATE,
  enviado_a_cadena BOOLEAN DEFAULT false,
  enviado_a_cadena_at TIMESTAMP WITH TIME ZONE,
  completado_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Pedido Items
CREATE TABLE IF NOT EXISTS public.pedido_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID NOT NULL REFERENCES public.pedidos_compra(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_solicitada INTEGER NOT NULL DEFAULT 0,
  cantidad_recibida INTEGER NOT NULL DEFAULT 0,
  cantidad_merma INTEGER DEFAULT 0,
  motivo_merma TEXT,
  precio_unitario NUMERIC,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Procedimientos
CREATE TABLE IF NOT EXISTS public.procedimientos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  clave_procedimiento TEXT,
  descripcion TEXT,
  hospital_id UUID REFERENCES public.hospitales(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Hospital Procedimientos
CREATE TABLE IF NOT EXISTS public.hospital_procedimientos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  procedimiento_clave TEXT NOT NULL,
  procedimiento_nombre TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Rutas Distribución
CREATE TABLE IF NOT EXISTS public.rutas_distribucion (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_ruta TEXT NOT NULL,
  tipo TEXT NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Rutas Hospitales
CREATE TABLE IF NOT EXISTS public.rutas_hospitales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ruta_id UUID NOT NULL REFERENCES public.rutas_distribucion(id),
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Registro Actividad
CREATE TABLE IF NOT EXISTS public.registro_actividad (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID NOT NULL,
  usuario_nombre TEXT NOT NULL,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  tipo_actividad public.tipo_actividad NOT NULL,
  descripcion TEXT NOT NULL,
  folio_id UUID REFERENCES public.folios(id),
  numero_folio TEXT,
  almacen_origen_id UUID,
  almacen_origen_nombre TEXT,
  almacen_destino_id UUID,
  almacen_destino_nombre TEXT,
  cantidad_total INTEGER,
  insumos_afectados JSONB,
  detalles_adicionales JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Excel Insumo Config
CREATE TABLE IF NOT EXISTS public.excel_insumo_config (
  id SERIAL PRIMARY KEY,
  nombre_insumo TEXT NOT NULL,
  tipo_anestesia TEXT NOT NULL,
  id_bcb TEXT,
  min_excel INTEGER,
  max_excel INTEGER,
  observaciones TEXT,
  tiene_valores_claros BOOLEAN DEFAULT true
);

-- Traspasos (legacy)
CREATE TABLE IF NOT EXISTS public.traspasos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_origen_id UUID REFERENCES public.hospitales(id),
  hospital_destino_id UUID REFERENCES public.hospitales(id),
  estado public.estado_traspaso DEFAULT 'pendiente',
  observaciones TEXT,
  solicitado_por UUID,
  aprobado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Traspaso Insumos (legacy)
CREATE TABLE IF NOT EXISTS public.traspaso_insumos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  traspaso_id UUID REFERENCES public.traspasos(id),
  insumo_id UUID REFERENCES public.insumos(id),
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Paquetes Anestesia (legacy)
CREATE TABLE IF NOT EXISTS public.paquetes_anestesia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  descripcion TEXT,
  hospital_display_name TEXT,
  hospital_budget_code TEXT,
  state_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Paquete Insumos (legacy)
CREATE TABLE IF NOT EXISTS public.paquete_insumos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  paquete_id UUID REFERENCES public.paquetes_anestesia(id),
  insumo_id UUID REFERENCES public.insumos(id),
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Formatos Generados
CREATE TABLE IF NOT EXISTS public.formatos_generados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL,
  hospital_id UUID REFERENCES public.hospitales(id),
  data_json JSONB NOT NULL DEFAULT '{}',
  pdf_url TEXT,
  estado TEXT NOT NULL DEFAULT 'generado',
  notas TEXT,
  generado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insumos Requerimientos
CREATE TABLE IF NOT EXISTS public.insumos_requerimientos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES public.hospitales(id),
  insumo_catalogo_id UUID NOT NULL REFERENCES public.insumos_catalogo(id),
  cantidad_requerida INTEGER NOT NULL DEFAULT 0,
  prioridad TEXT NOT NULL DEFAULT 'media',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  notas TEXT,
  alerta_origen_id UUID REFERENCES public.insumos_alertas(id),
  generado_por UUID,
  aprobado_por UUID,
  aprobado_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unidades (legacy)
CREATE TABLE IF NOT EXISTS public.unidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID REFERENCES public.hospitales(id),
  nombre TEXT NOT NULL,
  tipo TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- PASO 3: CREAR FUNCIONES
-- ============================================================

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

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_gerente_almacen(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id 
    AND role = 'gerente_almacen'::app_role
  )
$$;

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
    WHERE inventario_id = NEW.id
      AND estado = 'activa'
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

CREATE OR REPLACE FUNCTION public.consumir_inventario_fifo(p_consolidado_id uuid, p_cantidad integer)
RETURNS TABLE(lote_id uuid, cantidad_consumida integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restante INTEGER := p_cantidad;
  v_lote RECORD;
BEGIN
  FOR v_lote IN 
    SELECT id, cantidad 
    FROM public.inventario_lotes 
    WHERE consolidado_id = p_consolidado_id AND cantidad > 0
    ORDER BY fecha_entrada ASC
  LOOP
    IF v_restante <= 0 THEN
      EXIT;
    END IF;
    
    IF v_lote.cantidad >= v_restante THEN
      UPDATE public.inventario_lotes SET cantidad = cantidad - v_restante WHERE id = v_lote.id;
      lote_id := v_lote.id;
      cantidad_consumida := v_restante;
      v_restante := 0;
      RETURN NEXT;
    ELSE
      UPDATE public.inventario_lotes SET cantidad = 0 WHERE id = v_lote.id;
      lote_id := v_lote.id;
      cantidad_consumida := v_lote.cantidad;
      v_restante := v_restante - v_lote.cantidad;
      RETURN NEXT;
    END IF;
  END LOOP;
  
  UPDATE public.inventario_consolidado 
  SET cantidad_total = cantidad_total - (p_cantidad - v_restante), updated_at = now()
  WHERE id = p_consolidado_id;
  
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalcular_alerta_consolidado(p_consolidado_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.inventario_consolidado%ROWTYPE;
  v_alerta_existente UUID;
  v_minimo INTEGER;
BEGIN
  SELECT * INTO v_row FROM public.inventario_consolidado WHERE id = p_consolidado_id;
  IF NOT FOUND THEN RETURN; END IF;
  
  SELECT COALESCE(min_global_inventario, 10) INTO v_minimo
  FROM public.insumo_configuracion
  WHERE insumo_catalogo_id = v_row.insumo_catalogo_id
  LIMIT 1;
  
  IF v_minimo IS NULL THEN v_minimo := 10; END IF;
  
  SELECT id INTO v_alerta_existente
  FROM public.insumos_alertas
  WHERE hospital_id = v_row.hospital_id
  AND insumo_catalogo_id = v_row.insumo_catalogo_id
  AND estado = 'activa'
  LIMIT 1;
  
  IF v_row.cantidad_total <= v_minimo THEN
    IF v_alerta_existente IS NULL THEN
      INSERT INTO public.insumos_alertas (
        hospital_id, insumo_catalogo_id, consolidado_id,
        cantidad_actual, minimo_permitido, prioridad, estado
      ) VALUES (
        v_row.hospital_id, v_row.insumo_catalogo_id, p_consolidado_id,
        v_row.cantidad_total, v_minimo,
        CASE 
          WHEN v_row.cantidad_total = 0 THEN 'critica'
          WHEN v_row.cantidad_total < (v_minimo * 0.5) THEN 'alta'
          WHEN v_row.cantidad_total < (v_minimo * 0.75) THEN 'media'
          ELSE 'baja'
        END,
        'activa'
      );
    ELSE
      UPDATE public.insumos_alertas
      SET cantidad_actual = v_row.cantidad_total,
          minimo_permitido = v_minimo,
          consolidado_id = p_consolidado_id,
          prioridad = CASE 
            WHEN v_row.cantidad_total = 0 THEN 'critica'
            WHEN v_row.cantidad_total < (v_minimo * 0.5) THEN 'alta'
            WHEN v_row.cantidad_total < (v_minimo * 0.75) THEN 'media'
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

CREATE OR REPLACE FUNCTION public.trigger_check_consolidado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalcular_alerta_consolidado(NEW.id);
  RETURN NEW;
END;
$$;

-- PASO 4: CREAR TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS check_inventario_minimo_trigger ON public.inventario_hospital;
CREATE TRIGGER check_inventario_minimo_trigger
  AFTER INSERT OR UPDATE ON public.inventario_hospital
  FOR EACH ROW EXECUTE FUNCTION public.check_inventario_minimo();

DROP TRIGGER IF EXISTS check_inventario_trigger ON public.inventario_hospital;
CREATE TRIGGER check_inventario_trigger
  AFTER UPDATE ON public.inventario_hospital
  FOR EACH ROW EXECUTE FUNCTION public.trigger_check_inventario();

DROP TRIGGER IF EXISTS check_consolidado_trigger ON public.inventario_consolidado;
CREATE TRIGGER check_consolidado_trigger
  AFTER UPDATE ON public.inventario_consolidado
  FOR EACH ROW EXECUTE FUNCTION public.trigger_check_consolidado();

-- PASO 5: CREAR ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_folios_hospital_fecha ON public.folios(hospital_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_folios_estado ON public.folios(estado);
CREATE INDEX IF NOT EXISTS idx_inventario_hospital_hospital ON public.inventario_hospital(hospital_id);
CREATE INDEX IF NOT EXISTS idx_inventario_hospital_insumo ON public.inventario_hospital(insumo_catalogo_id);
CREATE INDEX IF NOT EXISTS idx_alertas_hospital_estado ON public.insumos_alertas(hospital_id, estado);
CREATE INDEX IF NOT EXISTS idx_alertas_insumo ON public.insumos_alertas(insumo_catalogo_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_hospital ON public.alertas_transferencia(hospital_id);
CREATE INDEX IF NOT EXISTS idx_insumos_catalogo_nombre ON public.insumos_catalogo(nombre);
CREATE INDEX IF NOT EXISTS idx_insumos_catalogo_clave ON public.insumos_catalogo(clave);
CREATE INDEX IF NOT EXISTS idx_inventario_consolidado_hospital ON public.inventario_consolidado(hospital_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_hospital ON public.movimientos_inventario(hospital_id);
CREATE INDEX IF NOT EXISTS idx_almacen_prov_inv_almacen ON public.almacen_provisional_inventario(almacen_provisional_id);
CREATE INDEX IF NOT EXISTS idx_folios_insumos_folio ON public.folios_insumos(folio_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_hospital ON public.profiles(hospital_id);

-- PASO 6: HABILITAR REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.inventario_hospital;
ALTER PUBLICATION supabase_realtime ADD TABLE public.almacen_provisional_inventario;
ALTER PUBLICATION supabase_realtime ADD TABLE public.insumos_alertas;

ALTER TABLE public.inventario_hospital REPLICA IDENTITY FULL;
ALTER TABLE public.almacen_provisional_inventario REPLICA IDENTITY FULL;
ALTER TABLE public.insumos_alertas REPLICA IDENTITY FULL;

-- PASO 7: HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================================

ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumo_configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anestesia_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almacenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almacenes_provisionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_hospital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_consolidado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almacen_central ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almacen_provisional_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_hospital_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folios_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folios_insumos_adicionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_almacen_provisional ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumos_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencias_central_hospital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_transferencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mermas_transferencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_necesidades_agrupado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_agrupado_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_necesidades_segmentado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_segmentado_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_procedimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutas_distribucion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutas_hospitales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registro_actividad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excel_insumo_config ENABLE ROW LEVEL SECURITY;

-- PASO 8: CREAR POLÍTICAS RLS BÁSICAS (lectura pública para catálogos)
-- ============================================================

-- Políticas SELECT públicas para tablas de referencia
CREATE POLICY "All can view states" ON public.states FOR SELECT USING (true);
CREATE POLICY "All can view hospitales" ON public.hospitales FOR SELECT USING (true);
CREATE POLICY "All can view insumos_catalogo" ON public.insumos_catalogo FOR SELECT USING (true);
CREATE POLICY "All can view insumo_configuracion" ON public.insumo_configuracion FOR SELECT USING (true);
CREATE POLICY "All can view anestesia_insumos" ON public.anestesia_insumos FOR SELECT USING (true);
CREATE POLICY "All can view insumos" ON public.insumos FOR SELECT USING (true);
CREATE POLICY "All can view almacenes" ON public.almacenes FOR SELECT USING (true);
CREATE POLICY "All can view medicos" ON public.medicos FOR SELECT USING (true);
CREATE POLICY "All can view folios" ON public.folios FOR SELECT USING (true);
CREATE POLICY "All can view folios_insumos" ON public.folios_insumos FOR SELECT USING (true);
CREATE POLICY "All can view inventario_hospital" ON public.inventario_hospital FOR SELECT USING (true);
CREATE POLICY "All can view inventario_consolidado" ON public.inventario_consolidado FOR SELECT USING (true);
CREATE POLICY "All can view inventario_lotes" ON public.inventario_lotes FOR SELECT USING (true);
CREATE POLICY "All can view insumos_alertas" ON public.insumos_alertas FOR SELECT USING (true);
CREATE POLICY "All can view movimientos_inventario" ON public.movimientos_inventario FOR SELECT USING (true);
CREATE POLICY "All can view procedimientos" ON public.procedimientos FOR SELECT USING (true);
CREATE POLICY "All can view hospital_procedimientos" ON public.hospital_procedimientos FOR SELECT USING (true);
CREATE POLICY "All can view excel_insumo_config" ON public.excel_insumo_config FOR SELECT USING (true);

-- Políticas INSERT/UPDATE para usuarios autenticados
CREATE POLICY "Auth users can insert folios" ON public.folios FOR INSERT WITH CHECK (true);
CREATE POLICY "Auth users can update folios" ON public.folios FOR UPDATE USING (true);
CREATE POLICY "Auth users can insert folios_insumos" ON public.folios_insumos FOR INSERT WITH CHECK (true);
CREATE POLICY "Auth users can update folios_insumos" ON public.folios_insumos FOR UPDATE USING (true);
CREATE POLICY "Auth users can delete folios_insumos" ON public.folios_insumos FOR DELETE USING (true);
CREATE POLICY "Auth users can insert inventario" ON public.inventario_hospital FOR INSERT WITH CHECK (true);
CREATE POLICY "Auth users can update inventario" ON public.inventario_hospital FOR UPDATE USING (true);
CREATE POLICY "Auth users can insert alertas" ON public.insumos_alertas FOR INSERT WITH CHECK (true);
CREATE POLICY "Auth users can update alertas" ON public.insumos_alertas FOR UPDATE USING (true);
CREATE POLICY "Auth users can insert movimientos" ON public.movimientos_inventario FOR INSERT WITH CHECK (true);
CREATE POLICY "Auth users can insert insumos_catalogo" ON public.insumos_catalogo FOR INSERT WITH CHECK (true);
CREATE POLICY "Auth users can update insumos_catalogo" ON public.insumos_catalogo FOR UPDATE USING (true);
CREATE POLICY "Auth users can insert insumo_config" ON public.insumo_configuracion FOR INSERT WITH CHECK (true);
CREATE POLICY "Auth users can update insumo_config" ON public.insumo_configuracion FOR UPDATE USING (true);
CREATE POLICY "Auth users can delete insumo_config" ON public.insumo_configuracion FOR DELETE USING (true);

-- ============================================================
-- FIN DEL SCHEMA - AHORA IMPORTA LOS DATOS
-- ============================================================
