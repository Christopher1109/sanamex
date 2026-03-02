-- =============================================
-- ÍNDICES DE RENDIMIENTO PARA ALTO VOLUMEN
-- =============================================

-- Índices para FOLIOS (tabla más consultada)
CREATE INDEX IF NOT EXISTS idx_folios_hospital_fecha ON public.folios (hospital_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_folios_estado ON public.folios (estado);
CREATE INDEX IF NOT EXISTS idx_folios_fecha ON public.folios (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_folios_numero ON public.folios (numero_folio);
CREATE INDEX IF NOT EXISTS idx_folios_created_at ON public.folios (created_at DESC);

-- Índices para FOLIOS_INSUMOS (joins frecuentes)
CREATE INDEX IF NOT EXISTS idx_folios_insumos_folio ON public.folios_insumos (folio_id);
CREATE INDEX IF NOT EXISTS idx_folios_insumos_insumo ON public.folios_insumos (insumo_id);

-- Índices para FOLIOS_INSUMOS_COSTOS (reportes financieros)
CREATE INDEX IF NOT EXISTS idx_folios_costos_folio ON public.folios_insumos_costos (folio_id);
CREATE INDEX IF NOT EXISTS idx_folios_costos_insumo ON public.folios_insumos_costos (insumo_catalogo_id);

-- Índices para INVENTARIO_CONSOLIDADO
CREATE INDEX IF NOT EXISTS idx_inventario_consolidado_hospital ON public.inventario_consolidado (hospital_id);
CREATE INDEX IF NOT EXISTS idx_inventario_consolidado_insumo ON public.inventario_consolidado (insumo_catalogo_id);
CREATE INDEX IF NOT EXISTS idx_inventario_consolidado_hospital_insumo ON public.inventario_consolidado (hospital_id, insumo_catalogo_id);

-- Índices para INVENTARIO_LOTES (FIFO queries)
CREATE INDEX IF NOT EXISTS idx_inventario_lotes_consolidado ON public.inventario_lotes (consolidado_id);
CREATE INDEX IF NOT EXISTS idx_inventario_lotes_fifo ON public.inventario_lotes (consolidado_id, fecha_entrada ASC) WHERE cantidad > 0;
CREATE INDEX IF NOT EXISTS idx_inventario_lotes_caducidad ON public.inventario_lotes (fecha_caducidad) WHERE fecha_caducidad IS NOT NULL;

-- Índices para INVENTARIO_HOSPITAL
CREATE INDEX IF NOT EXISTS idx_inventario_hospital_hospital ON public.inventario_hospital (hospital_id);
CREATE INDEX IF NOT EXISTS idx_inventario_hospital_insumo ON public.inventario_hospital (insumo_catalogo_id);
CREATE INDEX IF NOT EXISTS idx_inventario_hospital_almacen ON public.inventario_hospital (almacen_id);

-- Índices para ALERTAS
CREATE INDEX IF NOT EXISTS idx_alertas_hospital_estado ON public.insumos_alertas (hospital_id, estado);
CREATE INDEX IF NOT EXISTS idx_alertas_created ON public.insumos_alertas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_transferencia_hospital ON public.alertas_transferencia (hospital_id, estado);

-- Índices para MEDICOS
CREATE INDEX IF NOT EXISTS idx_medicos_hospital ON public.medicos (hospital_id) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_medicos_especialidad ON public.medicos (especialidad);

-- Índices para INSUMOS_CATALOGO
CREATE INDEX IF NOT EXISTS idx_insumos_catalogo_nombre ON public.insumos_catalogo (nombre) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_insumos_catalogo_clave ON public.insumos_catalogo (clave) WHERE clave IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insumos_catalogo_busqueda ON public.insumos_catalogo USING gin (to_tsvector('spanish', nombre));

-- Índices para PEDIDOS_COMPRA
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON public.pedidos_compra (estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_created ON public.pedidos_compra (created_at DESC);

-- Índices para MOVIMIENTOS
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_hospital ON public.movimientos_inventario (hospital_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_provisional_hospital ON public.movimientos_almacen_provisional (hospital_id, created_at DESC);

-- Índices para USER_ROLES (crítico para RLS)
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles (role);

-- Índices para TARIFAS
CREATE INDEX IF NOT EXISTS idx_tarifas_hospital ON public.tarifas_procedimientos (hospital_id) WHERE activo = true;

-- Índices para REGISTRO_ACTIVIDAD
CREATE INDEX IF NOT EXISTS idx_registro_actividad_hospital ON public.registro_actividad (hospital_id, created_at DESC);

-- =============================================
-- ANALYZE para actualizar estadísticas
-- =============================================
ANALYZE public.folios;
ANALYZE public.folios_insumos;
ANALYZE public.inventario_consolidado;
ANALYZE public.inventario_lotes;
ANALYZE public.insumos_catalogo;
ANALYZE public.medicos;