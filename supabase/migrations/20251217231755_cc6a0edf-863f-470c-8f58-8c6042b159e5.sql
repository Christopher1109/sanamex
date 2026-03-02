-- Índices para consultas frecuentes de folios
CREATE INDEX IF NOT EXISTS idx_folios_hospital_fecha ON public.folios(hospital_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_folios_estado ON public.folios(estado);
CREATE INDEX IF NOT EXISTS idx_folios_hospital_estado ON public.folios(hospital_id, estado);

-- Índices para inventario (consultas más frecuentes)
CREATE INDEX IF NOT EXISTS idx_inventario_hospital_hospital ON public.inventario_hospital(hospital_id);
CREATE INDEX IF NOT EXISTS idx_inventario_hospital_insumo ON public.inventario_hospital(insumo_catalogo_id);
CREATE INDEX IF NOT EXISTS idx_inventario_hospital_composite ON public.inventario_hospital(hospital_id, insumo_catalogo_id);

-- Índices para alertas (muy consultadas)
CREATE INDEX IF NOT EXISTS idx_alertas_hospital_estado ON public.insumos_alertas(hospital_id, estado);
CREATE INDEX IF NOT EXISTS idx_alertas_insumo ON public.insumos_alertas(insumo_catalogo_id);
CREATE INDEX IF NOT EXISTS idx_alertas_estado ON public.insumos_alertas(estado);

-- Índices para transferencias
CREATE INDEX IF NOT EXISTS idx_transferencias_hospital ON public.alertas_transferencia(hospital_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_estado ON public.alertas_transferencia(estado);
CREATE INDEX IF NOT EXISTS idx_transferencias_tirada ON public.alertas_transferencia(tirada_id);

-- Índices para catálogo de insumos (búsquedas frecuentes)
CREATE INDEX IF NOT EXISTS idx_insumos_catalogo_nombre ON public.insumos_catalogo(nombre);
CREATE INDEX IF NOT EXISTS idx_insumos_catalogo_clave ON public.insumos_catalogo(clave);
CREATE INDEX IF NOT EXISTS idx_insumos_catalogo_activo ON public.insumos_catalogo(activo) WHERE activo = true;

-- Índices para inventario consolidado
CREATE INDEX IF NOT EXISTS idx_inventario_consolidado_hospital ON public.inventario_consolidado(hospital_id);
CREATE INDEX IF NOT EXISTS idx_inventario_consolidado_insumo ON public.inventario_consolidado(insumo_catalogo_id);

-- Índices para movimientos (kardex)
CREATE INDEX IF NOT EXISTS idx_movimientos_hospital ON public.movimientos_inventario(hospital_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario ON public.movimientos_inventario(inventario_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON public.movimientos_inventario(created_at DESC);

-- Índices para almacenes provisionales
CREATE INDEX IF NOT EXISTS idx_almacen_prov_inv_almacen ON public.almacen_provisional_inventario(almacen_provisional_id);
CREATE INDEX IF NOT EXISTS idx_almacen_prov_inv_insumo ON public.almacen_provisional_inventario(insumo_catalogo_id);

-- Índices para folios_insumos (join frecuente)
CREATE INDEX IF NOT EXISTS idx_folios_insumos_folio ON public.folios_insumos(folio_id);
CREATE INDEX IF NOT EXISTS idx_folios_insumos_insumo ON public.folios_insumos(insumo_id);

-- Índices para user_roles (consultas de autenticación)
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- Índices para profiles
CREATE INDEX IF NOT EXISTS idx_profiles_hospital ON public.profiles(hospital_id);