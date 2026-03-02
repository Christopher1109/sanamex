
-- ============================================
-- REARQUITECTURA: ERP Distribuidora
-- DROP COMPLETO DE TODAS LAS TABLAS
-- ============================================

-- Tablas faltantes del drop anterior
DROP TABLE IF EXISTS public.orden_compra_impuestos CASCADE;
DROP TABLE IF EXISTS public.pedido_items CASCADE;
DROP TABLE IF EXISTS public.precios_insumos CASCADE;
DROP TABLE IF EXISTS public.presupuestos_hospital CASCADE;
DROP TABLE IF EXISTS public.procedimiento_insumos_catalogo CASCADE;
DROP TABLE IF EXISTS public.rutas_distribucion CASCADE;
DROP TABLE IF EXISTS public.rutas_hospitales CASCADE;
DROP TABLE IF EXISTS public.supervisor_hospital_assignments CASCADE;
DROP TABLE IF EXISTS public.tarifas_procedimientos CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.proveedores CASCADE;
DROP TABLE IF EXISTS public.paquetes_procedimiento CASCADE;

-- Tablas anteriores
DROP TABLE IF EXISTS public.mermas_transferencia CASCADE;
DROP TABLE IF EXISTS public.alertas_transferencia CASCADE;
DROP TABLE IF EXISTS public.transferencias_central_hospital CASCADE;
DROP TABLE IF EXISTS public.almacen_central CASCADE;
DROP TABLE IF EXISTS public.almacen_provisional_inventario CASCADE;
DROP TABLE IF EXISTS public.movimientos_almacen_provisional CASCADE;
DROP TABLE IF EXISTS public.movimientos_inventario CASCADE;
DROP TABLE IF EXISTS public.almacenes_provisionales CASCADE;
DROP TABLE IF EXISTS public.anestesia_insumos CASCADE;
DROP TABLE IF EXISTS public.catalogo_impuestos CASCADE;
DROP TABLE IF EXISTS public.comprobantes_pago CASCADE;
DROP TABLE IF EXISTS public.documento_agrupado_detalle CASCADE;
DROP TABLE IF EXISTS public.documento_segmentado_detalle CASCADE;
DROP TABLE IF EXISTS public.documentos_necesidades_agrupado CASCADE;
DROP TABLE IF EXISTS public.documentos_necesidades_segmentado CASCADE;
DROP TABLE IF EXISTS public.excel_insumo_config CASCADE;
DROP TABLE IF EXISTS public.folios_insumos_costos CASCADE;
DROP TABLE IF EXISTS public.folios_insumos_adicionales CASCADE;
DROP TABLE IF EXISTS public.folios_insumos CASCADE;
DROP TABLE IF EXISTS public.folios CASCADE;
DROP TABLE IF EXISTS public.formatos_generados CASCADE;
DROP TABLE IF EXISTS public.hospital_procedimientos CASCADE;
DROP TABLE IF EXISTS public.insumo_configuracion CASCADE;
DROP TABLE IF EXISTS public.insumos_requerimientos CASCADE;
DROP TABLE IF EXISTS public.insumos_alertas CASCADE;
DROP TABLE IF EXISTS public.inventario_lotes CASCADE;
DROP TABLE IF EXISTS public.inventario_consolidado CASCADE;
DROP TABLE IF EXISTS public.inventario_hospital CASCADE;
DROP TABLE IF EXISTS public.insumos_catalogo CASCADE;
DROP TABLE IF EXISTS public.insumos CASCADE;
DROP TABLE IF EXISTS public.medicos CASCADE;
DROP TABLE IF EXISTS public.pedidos_compra CASCADE;
DROP TABLE IF EXISTS public.almacenes CASCADE;
DROP TABLE IF EXISTS public.hospitales CASCADE;
DROP TABLE IF EXISTS public.states CASCADE;
DROP TABLE IF EXISTS public.registro_actividad CASCADE;
DROP TABLE IF EXISTS public.tickets CASCADE;
DROP TABLE IF EXISTS public.paquete_insumos CASCADE;
DROP TABLE IF EXISTS public.paquetes_anestesia CASCADE;
DROP TABLE IF EXISTS public.procedimientos CASCADE;
DROP TABLE IF EXISTS public.traspaso_insumos CASCADE;
DROP TABLE IF EXISTS public.traspasos CASCADE;
DROP TABLE IF EXISTS public.unidades CASCADE;
DROP TABLE IF EXISTS public.estados CASCADE;
DROP TABLE IF EXISTS public.empresas CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop old functions
DROP FUNCTION IF EXISTS public.has_role CASCADE;
DROP FUNCTION IF EXISTS public.is_gerente_almacen CASCADE;
DROP FUNCTION IF EXISTS public.check_inventario_minimo CASCADE;
DROP FUNCTION IF EXISTS public.consumir_inventario_fifo CASCADE;
DROP FUNCTION IF EXISTS public.recalcular_alerta_consolidado CASCADE;
DROP FUNCTION IF EXISTS public.recalcular_alerta_insumo CASCADE;
DROP FUNCTION IF EXISTS public.trigger_check_configuracion_insert CASCADE;
DROP FUNCTION IF EXISTS public.trigger_check_configuracion_minimo CASCADE;
DROP FUNCTION IF EXISTS public.trigger_check_consolidado CASCADE;
DROP FUNCTION IF EXISTS public.trigger_check_inventario CASCADE;
DROP FUNCTION IF EXISTS public.update_users_updated_at CASCADE;

-- Drop old enums
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.estado_folio CASCADE;
DROP TYPE IF EXISTS public.especialidad_medica CASCADE;

-- ==========================================
-- FASE 2: INFRAESTRUCTURA BASE
-- ==========================================

CREATE TYPE public.app_role AS ENUM ('admin', 'gerente', 'cajero', 'almacen', 'repartidor', 'auditor');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL DEFAULT '',
  username TEXT UNIQUE,
  email TEXT,
  telefono TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos ven perfiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Usuario actualiza perfil" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Usuario inserta perfil" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos ven roles" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Admin inserta roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin actualiza roles" ON public.user_roles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin elimina roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- ==========================================
-- FASE 3: TABLAS DE DOMINIO
-- ==========================================

CREATE TABLE public.sucursales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL, codigo TEXT UNIQUE NOT NULL,
  direccion TEXT, telefono TEXT, activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.almacenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id UUID NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL DEFAULT 'Almacén Principal', activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL, descripcion TEXT,
  codigo_barras TEXT, requiere_lote BOOLEAN DEFAULT true,
  categoria TEXT, unidad TEXT DEFAULT 'pieza',
  precio_base NUMERIC(12,2) NOT NULL DEFAULT 0, iva_incluido BOOLEAN DEFAULT true,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.producto_precios_sucursal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  sucursal_id UUID NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  precio NUMERIC(12,2) NOT NULL, activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(producto_id, sucursal_id)
);

CREATE TABLE public.proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL, rfc TEXT, contacto TEXT, telefono TEXT, email TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL, rfc TEXT, tipo TEXT DEFAULT 'mayoreo',
  telefono TEXT, email TEXT, direccion TEXT, activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.metodos_pago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE, activo BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.motivos_ajuste (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'ajuste', activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  numero_lote TEXT NOT NULL, fecha_caducidad DATE,
  proveedor_id UUID REFERENCES public.proveedores(id),
  costo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(producto_id, numero_lote)
);

CREATE TABLE public.inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id UUID NOT NULL REFERENCES public.almacenes(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES public.lotes(id) ON DELETE CASCADE,
  cantidad INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(almacen_id, lote_id)
);

CREATE TABLE public.movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id UUID NOT NULL REFERENCES public.almacenes(id),
  lote_id UUID NOT NULL REFERENCES public.lotes(id),
  tipo TEXT NOT NULL, cantidad INTEGER NOT NULL,
  costo_unitario NUMERIC(12,2), referencia_tipo TEXT, referencia_id UUID,
  motivo_id UUID REFERENCES public.motivos_ajuste(id),
  usuario_id UUID REFERENCES auth.users(id),
  sucursal_id UUID REFERENCES public.sucursales(id),
  notas TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.cortes_caja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id UUID NOT NULL REFERENCES public.sucursales(id),
  cajero_id UUID NOT NULL REFERENCES auth.users(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  efectivo_esperado NUMERIC(12,2) DEFAULT 0,
  efectivo_recibido NUMERIC(12,2) DEFAULT 0,
  diferencia NUMERIC(12,2) DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'abierto', notas TEXT,
  cerrado_por UUID REFERENCES auth.users(id), cerrado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id UUID NOT NULL REFERENCES public.sucursales(id),
  cajero_id UUID NOT NULL REFERENCES auth.users(id),
  cliente_id UUID REFERENCES public.clientes(id),
  numero_venta TEXT NOT NULL, fecha TIMESTAMPTZ DEFAULT now(),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuestos NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'completada',
  corte_id UUID REFERENCES public.cortes_caja(id),
  notas TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.venta_lineas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id),
  lote_id UUID NOT NULL REFERENCES public.lotes(id),
  cantidad INTEGER NOT NULL, precio_unitario NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.venta_pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  metodo_pago_id UUID NOT NULL REFERENCES public.metodos_pago(id),
  monto NUMERIC(12,2) NOT NULL, referencia TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.traspasos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_origen_id UUID NOT NULL REFERENCES public.almacenes(id),
  almacen_destino_id UUID NOT NULL REFERENCES public.almacenes(id),
  estado TEXT NOT NULL DEFAULT 'pendiente',
  solicitado_por UUID REFERENCES auth.users(id),
  recibido_por UUID REFERENCES auth.users(id), notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.traspaso_lineas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traspaso_id UUID NOT NULL REFERENCES public.traspasos(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES public.lotes(id),
  cantidad INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.rutas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id UUID NOT NULL REFERENCES public.sucursales(id),
  repartidor_id UUID NOT NULL REFERENCES auth.users(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  estado TEXT NOT NULL DEFAULT 'preparando', notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.ruta_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ruta_id UUID NOT NULL REFERENCES public.rutas(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id),
  producto_id UUID NOT NULL REFERENCES public.productos(id),
  lote_id UUID NOT NULL REFERENCES public.lotes(id),
  cantidad_enviada INTEGER NOT NULL, cantidad_entregada INTEGER DEFAULT 0,
  cantidad_devuelta INTEGER DEFAULT 0, cantidad_merma INTEGER DEFAULT 0,
  estado TEXT DEFAULT 'pendiente', notas TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.bolsas_valores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id UUID NOT NULL REFERENCES public.sucursales(id),
  corte_id UUID REFERENCES public.cortes_caja(id),
  numero_bolsa TEXT NOT NULL, monto NUMERIC(12,2) NOT NULL,
  estado TEXT NOT NULL DEFAULT 'creada',
  recolectado_por UUID REFERENCES auth.users(id), recolectado_at TIMESTAMPTZ,
  depositado_at TIMESTAMPTZ, notas TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.conciliacion_bancaria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_estado_cuenta DATE, monto NUMERIC(12,2) NOT NULL, referencia TEXT,
  bolsa_id UUID REFERENCES public.bolsas_valores(id),
  estado TEXT NOT NULL DEFAULT 'pendiente', notas TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id), usuario_nombre TEXT,
  accion TEXT NOT NULL, entidad TEXT NOT NULL, entidad_id UUID,
  datos_antes JSONB, datos_despues JSONB, ip TEXT,
  sucursal_id UUID REFERENCES public.sucursales(id), created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- FASE 4: RLS
-- ==========================================

ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almacenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_precios_sucursal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metodos_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motivos_ajuste ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traspasos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traspaso_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ruta_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cortes_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolsas_valores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conciliacion_bancaria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven sucursales" ON public.sucursales FOR SELECT USING (true);
CREATE POLICY "Admin inserta sucursales" ON public.sucursales FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin actualiza sucursales" ON public.sucursales FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Todos ven almacenes" ON public.almacenes FOR SELECT USING (true);
CREATE POLICY "Admin inserta almacenes" ON public.almacenes FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin actualiza almacenes" ON public.almacenes FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Todos ven productos" ON public.productos FOR SELECT USING (true);
CREATE POLICY "Admin/gerente crean productos" ON public.productos FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Admin/gerente actualizan productos" ON public.productos FOR UPDATE USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Todos ven precios" ON public.producto_precios_sucursal FOR SELECT USING (true);
CREATE POLICY "Admin/gerente crean precios" ON public.producto_precios_sucursal FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Admin/gerente actualizan precios" ON public.producto_precios_sucursal FOR UPDATE USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Todos ven proveedores" ON public.proveedores FOR SELECT USING (true);
CREATE POLICY "Admin/gerente crean proveedores" ON public.proveedores FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Admin/gerente actualizan proveedores" ON public.proveedores FOR UPDATE USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Todos ven clientes" ON public.clientes FOR SELECT USING (true);
CREATE POLICY "Autenticados crean clientes" ON public.clientes FOR INSERT WITH CHECK (true);
CREATE POLICY "Autenticados actualizan clientes" ON public.clientes FOR UPDATE USING (true);

CREATE POLICY "Todos ven metodos pago" ON public.metodos_pago FOR SELECT USING (true);
CREATE POLICY "Admin inserta metodos" ON public.metodos_pago FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin actualiza metodos" ON public.metodos_pago FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Todos ven motivos" ON public.motivos_ajuste FOR SELECT USING (true);
CREATE POLICY "Admin inserta motivos" ON public.motivos_ajuste FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin actualiza motivos" ON public.motivos_ajuste FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Todos ven lotes" ON public.lotes FOR SELECT USING (true);
CREATE POLICY "Almacen crea lotes" ON public.lotes FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'almacen') OR public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Almacen actualiza lotes" ON public.lotes FOR UPDATE USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'almacen') OR public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Todos ven inventario" ON public.inventario FOR SELECT USING (true);
CREATE POLICY "Operativos crean inventario" ON public.inventario FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'almacen') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'cajero'));
CREATE POLICY "Operativos actualizan inventario" ON public.inventario FOR UPDATE USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'almacen') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'cajero'));

CREATE POLICY "Todos ven movimientos" ON public.movimientos_inventario FOR SELECT USING (true);
CREATE POLICY "Autenticados crean movimientos" ON public.movimientos_inventario FOR INSERT WITH CHECK (true);

CREATE POLICY "Todos ven ventas" ON public.ventas FOR SELECT USING (true);
CREATE POLICY "Cajeros crean ventas" ON public.ventas FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'cajero') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Admin actualiza ventas" ON public.ventas FOR UPDATE USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'cajero'));

CREATE POLICY "Todos ven lineas" ON public.venta_lineas FOR SELECT USING (true);
CREATE POLICY "Cajeros crean lineas" ON public.venta_lineas FOR INSERT WITH CHECK (true);

CREATE POLICY "Todos ven pagos" ON public.venta_pagos FOR SELECT USING (true);
CREATE POLICY "Cajeros crean pagos" ON public.venta_pagos FOR INSERT WITH CHECK (true);

CREATE POLICY "Todos ven traspasos" ON public.traspasos FOR SELECT USING (true);
CREATE POLICY "Almacen crea traspasos" ON public.traspasos FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'almacen') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Almacen actualiza traspasos" ON public.traspasos FOR UPDATE USING (public.has_role(auth.uid(), 'almacen') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Todos ven lineas traspaso" ON public.traspaso_lineas FOR SELECT USING (true);
CREATE POLICY "Autenticados crean lineas traspaso" ON public.traspaso_lineas FOR INSERT WITH CHECK (true);

CREATE POLICY "Todos ven rutas" ON public.rutas FOR SELECT USING (true);
CREATE POLICY "Operativos crean rutas" ON public.rutas FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'almacen') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'repartidor'));
CREATE POLICY "Operativos actualizan rutas" ON public.rutas FOR UPDATE USING (true);

CREATE POLICY "Todos ven entregas" ON public.ruta_entregas FOR SELECT USING (true);
CREATE POLICY "Autenticados crean entregas" ON public.ruta_entregas FOR INSERT WITH CHECK (true);
CREATE POLICY "Autenticados actualizan entregas" ON public.ruta_entregas FOR UPDATE USING (true);

CREATE POLICY "Todos ven cortes" ON public.cortes_caja FOR SELECT USING (true);
CREATE POLICY "Cajeros crean cortes" ON public.cortes_caja FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'cajero') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Gerentes actualizan cortes" ON public.cortes_caja FOR UPDATE USING (public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cajero'));

CREATE POLICY "Todos ven bolsas" ON public.bolsas_valores FOR SELECT USING (true);
CREATE POLICY "Autenticados crean bolsas" ON public.bolsas_valores FOR INSERT WITH CHECK (true);
CREATE POLICY "Autenticados actualizan bolsas" ON public.bolsas_valores FOR UPDATE USING (true);

CREATE POLICY "Auditor ve conciliacion" ON public.conciliacion_bancaria FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'auditor') OR public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Auditor crea conciliacion" ON public.conciliacion_bancaria FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'auditor') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Auditor actualiza conciliacion" ON public.conciliacion_bancaria FOR UPDATE USING (public.has_role(auth.uid(), 'auditor') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin ve logs" ON public.audit_log FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'auditor') OR public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Autenticados crean logs" ON public.audit_log FOR INSERT WITH CHECK (true);

-- ==========================================
-- FASE 5: TRIGGERS
-- ==========================================
CREATE TRIGGER update_sucursales_updated_at BEFORE UPDATE ON public.sucursales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_almacenes_updated_at BEFORE UPDATE ON public.almacenes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_productos_updated_at BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventario_updated_at BEFORE UPDATE ON public.inventario FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_traspasos_updated_at BEFORE UPDATE ON public.traspasos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rutas_updated_at BEFORE UPDATE ON public.rutas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_proveedores_updated_at BEFORE UPDATE ON public.proveedores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- FASE 6: SEED DATA
-- ==========================================
INSERT INTO public.metodos_pago (nombre) VALUES ('Efectivo'), ('Tarjeta'), ('Transferencia');

INSERT INTO public.motivos_ajuste (nombre, tipo) VALUES
  ('Merma por caducidad', 'merma'), ('Merma por daño', 'merma'),
  ('Merma por robo', 'merma'), ('Ajuste de inventario físico', 'ajuste'),
  ('Error de captura', 'ajuste'), ('Devolución a proveedor', 'otro');

INSERT INTO public.clientes (nombre, tipo) VALUES ('Público General', 'mayoreo');

INSERT INTO public.sucursales (nombre, codigo) VALUES
  ('Central de Abastos CDMX', 'SUC-001'), ('Central de Abastos Guadalajara', 'SUC-002'),
  ('Central de Abastos Monterrey', 'SUC-003'), ('Central de Abastos Puebla', 'SUC-004'),
  ('Central de Abastos Querétaro', 'SUC-005'), ('Central de Abastos León', 'SUC-006'),
  ('Central de Abastos Mérida', 'SUC-007'), ('Central de Abastos Tijuana', 'SUC-008'),
  ('Central de Abastos Cancún', 'SUC-009'), ('Central de Abastos Toluca', 'SUC-010');

INSERT INTO public.almacenes (sucursal_id, nombre) SELECT id, 'Almacén Principal' FROM public.sucursales;
