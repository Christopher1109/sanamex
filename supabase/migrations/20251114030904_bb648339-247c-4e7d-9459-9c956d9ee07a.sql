-- Drop all policies first
DROP POLICY IF EXISTS "Solo gerentes pueden ver audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Usuarios pueden ver empresas según su alcance organizacional" ON public.empresas;
DROP POLICY IF EXISTS "Usuarios pueden ver estados según su alcance organizacional" ON public.estados;
DROP POLICY IF EXISTS "Usuarios pueden ver insumos de folios que pueden ver" ON public.folio_insumos;
DROP POLICY IF EXISTS "Usuarios que pueden crear folios pueden agregar insumos" ON public.folio_insumos;
DROP POLICY IF EXISTS "Usuarios autorizados pueden actualizar folios en su alcance" ON public.folios;
DROP POLICY IF EXISTS "Usuarios autorizados pueden crear folios en su hospital" ON public.folios;
DROP POLICY IF EXISTS "Usuarios pueden ver folios según su alcance organizacional" ON public.folios;
DROP POLICY IF EXISTS "Usuarios pueden ver procedimientos según su alcance" ON public.hospital_procedimientos;
DROP POLICY IF EXISTS "Gerentes pueden ver todos los hospitales" ON public.hospitales;
DROP POLICY IF EXISTS "Usuarios pueden ver hospitales de su empresa" ON public.hospitales;
DROP POLICY IF EXISTS "Usuarios pueden ver hospitales de su estado" ON public.hospitales;
DROP POLICY IF EXISTS "Usuarios pueden ver su hospital asignado" ON public.hospitales;
DROP POLICY IF EXISTS "Usuarios autorizados pueden actualizar insumos de su hospital" ON public.insumos;
DROP POLICY IF EXISTS "Usuarios autorizados pueden crear insumos en su hospital" ON public.insumos;
DROP POLICY IF EXISTS "Usuarios pueden ver insumos de su hospital o alcance mayor" ON public.insumos;
DROP POLICY IF EXISTS "Usuarios autorizados pueden gestionar médicos de su hospital" ON public.medicos;
DROP POLICY IF EXISTS "Usuarios pueden ver médicos de su hospital" ON public.medicos;
DROP POLICY IF EXISTS "Líderes, supervisores y gerentes pueden gestionar insumos de p" ON public.paquete_insumos;
DROP POLICY IF EXISTS "Todos los usuarios autenticados pueden ver insumos de paquetes" ON public.paquete_insumos;
DROP POLICY IF EXISTS "Líderes, supervisores y gerentes pueden gestionar paquetes" ON public.paquetes_anestesia;
DROP POLICY IF EXISTS "Todos los usuarios autenticados pueden ver paquetes" ON public.paquetes_anestesia;
DROP POLICY IF EXISTS "Los usuarios pueden actualizar su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Los usuarios pueden ver su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Gerentes pueden gestionar insumos de traspasos" ON public.traspaso_insumos;
DROP POLICY IF EXISTS "Gerentes pueden ver insumos de traspasos" ON public.traspaso_insumos;
DROP POLICY IF EXISTS "Gerentes pueden ver todos los traspasos" ON public.traspasos;
DROP POLICY IF EXISTS "Solo gerentes pueden actualizar traspasos" ON public.traspasos;
DROP POLICY IF EXISTS "Solo gerentes pueden crear traspasos" ON public.traspasos;
DROP POLICY IF EXISTS "Usuarios pueden ver unidades según su alcance organizacional" ON public.unidades;
DROP POLICY IF EXISTS "Los usuarios pueden ver sus propios roles" ON public.user_roles;
DROP POLICY IF EXISTS "Solo gerentes pueden gestionar roles" ON public.user_roles;

-- Drop all triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_audit_logs_updated_at ON public.audit_logs;
DROP TRIGGER IF EXISTS update_empresas_updated_at ON public.empresas;
DROP TRIGGER IF EXISTS update_estados_updated_at ON public.estados;
DROP TRIGGER IF EXISTS update_folios_updated_at ON public.folios;
DROP TRIGGER IF EXISTS update_hospitales_updated_at ON public.hospitales;
DROP TRIGGER IF EXISTS update_insumos_updated_at ON public.insumos;
DROP TRIGGER IF EXISTS update_medicos_updated_at ON public.medicos;
DROP TRIGGER IF EXISTS update_paquetes_anestesia_updated_at ON public.paquetes_anestesia;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_traspasos_updated_at ON public.traspasos;
DROP TRIGGER IF EXISTS update_unidades_updated_at ON public.unidades;

-- Drop all tables in correct order (respecting foreign keys)
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.tickets CASCADE;
DROP TABLE IF EXISTS public.folio_insumos CASCADE;
DROP TABLE IF EXISTS public.folios CASCADE;
DROP TABLE IF EXISTS public.traspaso_insumos CASCADE;
DROP TABLE IF EXISTS public.traspasos CASCADE;
DROP TABLE IF EXISTS public.insumos CASCADE;
DROP TABLE IF EXISTS public.paquete_insumos CASCADE;
DROP TABLE IF EXISTS public.paquetes_anestesia CASCADE;
DROP TABLE IF EXISTS public.paquetes_procedimiento CASCADE;
DROP TABLE IF EXISTS public.hospital_procedimientos CASCADE;
DROP TABLE IF EXISTS public.procedimientos CASCADE;
DROP TABLE IF EXISTS public.medicos CASCADE;
DROP TABLE IF EXISTS public.unidades CASCADE;
DROP TABLE IF EXISTS public.hospitales CASCADE;
DROP TABLE IF EXISTS public.estados CASCADE;
DROP TABLE IF EXISTS public.empresas CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop all functions
DROP FUNCTION IF EXISTS public.user_has_hospital_access(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_estado_id(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role) CASCADE;
DROP FUNCTION IF EXISTS public.has_any_role(uuid, app_role[]) CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_hospital_id(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_empresa_id(uuid) CASCADE;

-- Drop all custom types/enums
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.genero CASCADE;
DROP TYPE IF EXISTS public.tipo_anestesia CASCADE;
DROP TYPE IF EXISTS public.especialidad_medica CASCADE;
DROP TYPE IF EXISTS public.estado_folio CASCADE;
DROP TYPE IF EXISTS public.estado_traspaso CASCADE;
DROP TYPE IF EXISTS public.origen_insumo CASCADE;