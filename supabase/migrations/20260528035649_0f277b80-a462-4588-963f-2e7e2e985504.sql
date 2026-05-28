
-- ============ BLOQUE 5: NOTIFICACIONES ============
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id uuid,
  tipo text NOT NULL, -- 'stock_bajo' | 'caducidad' | 'sistema'
  severidad text NOT NULL DEFAULT 'info', -- 'info' | 'warning' | 'critical'
  titulo text NOT NULL,
  mensaje text NOT NULL,
  referencia_tipo text,
  referencia_id uuid,
  leida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  leida_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.notificaciones TO authenticated;
GRANT ALL ON public.notificaciones TO service_role;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados ven notificaciones" ON public.notificaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados marcan leidas" ON public.notificaciones FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Sistema crea notificaciones" ON public.notificaciones FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_notif_sucursal_leida ON public.notificaciones(sucursal_id, leida, created_at DESC);

-- Trigger: alerta stock bajo cuando inventario.cantidad <= 30
CREATE OR REPLACE FUNCTION public.notify_stock_bajo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sucursal uuid;
  v_producto record;
  v_total integer;
BEGIN
  IF NEW.cantidad > 30 OR (TG_OP = 'UPDATE' AND OLD.cantidad <= 30) THEN
    RETURN NEW;
  END IF;
  SELECT a.sucursal_id INTO v_sucursal FROM almacenes a WHERE a.id = NEW.almacen_id;
  SELECT p.id, p.nombre, p.sku INTO v_producto
    FROM lotes l JOIN productos p ON p.id = l.producto_id WHERE l.id = NEW.lote_id;
  -- Total stock del producto en esa sucursal
  SELECT COALESCE(SUM(i.cantidad),0) INTO v_total
    FROM inventario i JOIN lotes l2 ON l2.id = i.lote_id JOIN almacenes a2 ON a2.id = i.almacen_id
    WHERE a2.sucursal_id = v_sucursal AND l2.producto_id = v_producto.id;
  IF v_total <= 30 AND v_producto.id IS NOT NULL THEN
    INSERT INTO notificaciones (sucursal_id, tipo, severidad, titulo, mensaje, referencia_tipo, referencia_id)
    VALUES (v_sucursal, 'stock_bajo',
      CASE WHEN v_total = 0 THEN 'critical' WHEN v_total <= 10 THEN 'warning' ELSE 'info' END,
      'Stock bajo: ' || v_producto.nombre,
      format('Quedan %s unidades de "%s" (SKU %s). Reponer pronto.', v_total, v_producto.nombre, v_producto.sku),
      'producto', v_producto.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_stock_bajo ON public.inventario;
CREATE TRIGGER trg_notify_stock_bajo AFTER INSERT OR UPDATE ON public.inventario
FOR EACH ROW EXECUTE FUNCTION public.notify_stock_bajo();

-- ============ BLOQUE 6: COSTO PROMEDIO PONDERADO ============
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS costo_promedio numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recalc_costo_promedio(_producto_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cpp numeric;
BEGIN
  SELECT COALESCE(SUM(l.costo_unitario * i.cantidad) / NULLIF(SUM(i.cantidad),0), 0)
    INTO v_cpp
    FROM inventario i JOIN lotes l ON l.id = i.lote_id
    WHERE l.producto_id = _producto_id AND i.cantidad > 0;
  UPDATE productos SET costo_promedio = COALESCE(v_cpp, 0) WHERE id = _producto_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_recalc_cpp_from_movimiento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prod uuid;
BEGIN
  IF NEW.tipo = 'entrada' THEN
    SELECT producto_id INTO v_prod FROM lotes WHERE id = NEW.lote_id;
    IF v_prod IS NOT NULL THEN PERFORM recalc_costo_promedio(v_prod); END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recalc_cpp ON public.movimientos_inventario;
CREATE TRIGGER trg_recalc_cpp AFTER INSERT ON public.movimientos_inventario
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_cpp_from_movimiento();

-- ============ BLOQUE 7: FISCAL ============
CREATE TABLE IF NOT EXISTS public.configuracion_fiscal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id uuid NOT NULL UNIQUE,
  rfc text NOT NULL,
  razon_social text NOT NULL,
  regimen_fiscal text,
  cp_emisor text,
  pac_proveedor text,
  pac_usuario text,
  serie_default text DEFAULT 'A',
  folio_actual integer DEFAULT 1,
  certificado_csd_url text,
  llave_csd_url text,
  csd_password_hint text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.configuracion_fiscal TO authenticated;
GRANT ALL ON public.configuracion_fiscal TO service_role;
ALTER TABLE public.configuracion_fiscal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados ven config fiscal" ON public.configuracion_fiscal FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gestiona config fiscal" ON public.configuracion_fiscal FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

CREATE TABLE IF NOT EXISTS public.cfdi_emitidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id uuid NOT NULL,
  venta_id uuid,
  uuid_sat text,
  serie text,
  folio integer,
  rfc_receptor text,
  total numeric NOT NULL DEFAULT 0,
  xml_url text,
  pdf_url text,
  estado text NOT NULL DEFAULT 'pendiente', -- pendiente | timbrado | cancelado | error
  pac_response jsonb,
  timbrado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.cfdi_emitidos TO authenticated;
GRANT ALL ON public.cfdi_emitidos TO service_role;
ALTER TABLE public.cfdi_emitidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados ven cfdi" ON public.cfdi_emitidos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operativos crean cfdi" ON public.cfdi_emitidos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin actualiza cfdi" ON public.cfdi_emitidos FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

-- ============ BLOQUE 8: RECOMENDACIONES IA ============
CREATE TABLE IF NOT EXISTS public.recomendaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'compra', -- 'compra' | 'reposicion' | 'oferta'
  payload jsonb NOT NULL, -- estructura libre con recomendaciones
  resumen_ia text,
  modelo text,
  generada_at timestamptz NOT NULL DEFAULT now(),
  expira_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  generada_por uuid
);
GRANT SELECT, INSERT, DELETE ON public.recomendaciones TO authenticated;
GRANT ALL ON public.recomendaciones TO service_role;
ALTER TABLE public.recomendaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados ven recomendaciones" ON public.recomendaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados crean recomendaciones" ON public.recomendaciones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Gerentes borran recomendaciones" ON public.recomendaciones FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

-- ============ BLOQUE 9: CARGAS MASIVAS ============
CREATE TABLE IF NOT EXISTS public.cargas_masivas_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL, -- 'productos' | 'proveedores' | 'clientes' | 'historico_ventas' | 'historico_compras'
  nombre_archivo text,
  total_filas integer NOT NULL DEFAULT 0,
  filas_ok integer NOT NULL DEFAULT 0,
  filas_error integer NOT NULL DEFAULT 0,
  errores jsonb,
  resumen jsonb,
  cargado_por uuid,
  sucursal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.cargas_masivas_historico TO authenticated;
GRANT ALL ON public.cargas_masivas_historico TO service_role;
ALTER TABLE public.cargas_masivas_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gerentes ven cargas" ON public.cargas_masivas_historico FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'subgerente'::app_role));
CREATE POLICY "Gerentes crean cargas" ON public.cargas_masivas_historico FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'subgerente'::app_role));

CREATE TABLE IF NOT EXISTS public.ventas_historicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id uuid,
  producto_sku text,
  producto_nombre text,
  cantidad integer NOT NULL DEFAULT 0,
  precio_unitario numeric NOT NULL DEFAULT 0,
  fecha date NOT NULL,
  proveedor_sugerido text,
  carga_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ventas_historicas TO authenticated;
GRANT ALL ON public.ventas_historicas TO service_role;
ALTER TABLE public.ventas_historicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados ven historico ventas" ON public.ventas_historicas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gerentes crean historico ventas" ON public.ventas_historicas FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'subgerente'::app_role));

CREATE INDEX IF NOT EXISTS idx_vh_sku_fecha ON public.ventas_historicas(producto_sku, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_vh_sucursal_fecha ON public.ventas_historicas(sucursal_id, fecha DESC);
