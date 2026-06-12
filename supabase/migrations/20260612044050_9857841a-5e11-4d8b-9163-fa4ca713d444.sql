
-- ============ TRASPASOS: nuevas columnas ============
ALTER TABLE public.traspasos
  ADD COLUMN IF NOT EXISTS numero_traspaso text UNIQUE,
  ADD COLUMN IF NOT EXISTS sucursal_origen_id uuid REFERENCES public.sucursales(id),
  ADD COLUMN IF NOT EXISTS sucursal_destino_id uuid REFERENCES public.sucursales(id),
  ADD COLUMN IF NOT EXISTS fecha_envio timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_recepcion timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

-- Estado por defecto 'enviado' para nuevos
ALTER TABLE public.traspasos ALTER COLUMN estado SET DEFAULT 'enviado';

-- ============ Folio traspasos ============
CREATE OR REPLACE FUNCTION public.generar_folio_traspaso()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM now());
  v_count int;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.traspasos
  WHERE numero_traspaso LIKE 'TRAS-' || v_year || '-%';
  RETURN 'TRAS-' || v_year || '-' || LPAD(v_count::text, 5, '0');
END $$;

-- ============ ENVIAR TRASPASO ============
CREATE OR REPLACE FUNCTION public.enviar_traspaso(
  p_sucursal_origen_id uuid,
  p_almacen_origen_id uuid,
  p_sucursal_destino_id uuid,
  p_almacen_destino_id uuid,
  p_lineas jsonb,           -- [{lote_id, cantidad}]
  p_notas text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_traspaso_id uuid;
  v_numero text;
  v_user uuid := auth.uid();
  v_linea jsonb;
  v_lote_id uuid;
  v_cantidad int;
  v_stock int;
  v_costo numeric;
BEGIN
  IF jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos una línea';
  END IF;
  IF p_almacen_origen_id = p_almacen_destino_id THEN
    RAISE EXCEPTION 'Origen y destino no pueden ser el mismo almacén';
  END IF;

  v_numero := public.generar_folio_traspaso();

  INSERT INTO public.traspasos (
    numero_traspaso, almacen_origen_id, almacen_destino_id,
    sucursal_origen_id, sucursal_destino_id,
    estado, solicitado_por, fecha_envio, notas
  ) VALUES (
    v_numero, p_almacen_origen_id, p_almacen_destino_id,
    p_sucursal_origen_id, p_sucursal_destino_id,
    'enviado', v_user, now(), p_notas
  ) RETURNING id INTO v_traspaso_id;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_lote_id := (v_linea->>'lote_id')::uuid;
    v_cantidad := (v_linea->>'cantidad')::int;

    IF v_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

    SELECT cantidad INTO v_stock FROM public.inventario
      WHERE almacen_id = p_almacen_origen_id AND lote_id = v_lote_id
      FOR UPDATE;

    IF v_stock IS NULL OR v_stock < v_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en lote %, disponible: %', v_lote_id, COALESCE(v_stock, 0);
    END IF;

    UPDATE public.inventario SET cantidad = cantidad - v_cantidad, updated_at = now()
      WHERE almacen_id = p_almacen_origen_id AND lote_id = v_lote_id;

    INSERT INTO public.traspaso_lineas (traspaso_id, lote_id, cantidad)
      VALUES (v_traspaso_id, v_lote_id, v_cantidad);

    SELECT costo_unitario INTO v_costo FROM public.lotes WHERE id = v_lote_id;

    INSERT INTO public.movimientos_inventario
      (almacen_id, lote_id, tipo, cantidad, costo_unitario,
       referencia_tipo, referencia_id, usuario_id, sucursal_id, notas)
    VALUES
      (p_almacen_origen_id, v_lote_id, 'traspaso_salida', -v_cantidad, v_costo,
       'traspaso', v_traspaso_id, v_user, p_sucursal_origen_id,
       'Traspaso ' || v_numero || ' -> ' || p_almacen_destino_id::text);
  END LOOP;

  RETURN jsonb_build_object('id', v_traspaso_id, 'numero', v_numero);
END $$;

-- ============ RECIBIR TRASPASO ============
CREATE OR REPLACE FUNCTION public.recibir_traspaso(p_traspaso_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_t record;
  v_linea record;
  v_costo numeric;
BEGIN
  SELECT * INTO v_t FROM public.traspasos WHERE id = p_traspaso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no existe'; END IF;
  IF v_t.estado <> 'enviado' THEN RAISE EXCEPTION 'Solo se pueden recibir traspasos enviados (estado actual: %)', v_t.estado; END IF;

  FOR v_linea IN SELECT * FROM public.traspaso_lineas WHERE traspaso_id = p_traspaso_id LOOP
    INSERT INTO public.inventario (almacen_id, lote_id, cantidad)
      VALUES (v_t.almacen_destino_id, v_linea.lote_id, v_linea.cantidad)
    ON CONFLICT (almacen_id, lote_id)
      DO UPDATE SET cantidad = inventario.cantidad + EXCLUDED.cantidad, updated_at = now();

    SELECT costo_unitario INTO v_costo FROM public.lotes WHERE id = v_linea.lote_id;

    INSERT INTO public.movimientos_inventario
      (almacen_id, lote_id, tipo, cantidad, costo_unitario,
       referencia_tipo, referencia_id, usuario_id, sucursal_id, notas)
    VALUES
      (v_t.almacen_destino_id, v_linea.lote_id, 'traspaso_entrada', v_linea.cantidad, v_costo,
       'traspaso', p_traspaso_id, v_user, v_t.sucursal_destino_id,
       'Recepción traspaso ' || v_t.numero_traspaso);
  END LOOP;

  UPDATE public.traspasos
     SET estado='recibido', recibido_por=v_user, fecha_recepcion=now(), updated_at=now()
   WHERE id = p_traspaso_id;

  RETURN jsonb_build_object('id', p_traspaso_id, 'estado', 'recibido');
END $$;

-- ============ CANCELAR TRASPASO ============
CREATE OR REPLACE FUNCTION public.cancelar_traspaso(p_traspaso_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_t record;
  v_linea record;
  v_costo numeric;
BEGIN
  SELECT * INTO v_t FROM public.traspasos WHERE id = p_traspaso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no existe'; END IF;
  IF v_t.estado <> 'enviado' THEN RAISE EXCEPTION 'Solo se pueden cancelar traspasos enviados'; END IF;

  FOR v_linea IN SELECT * FROM public.traspaso_lineas WHERE traspaso_id = p_traspaso_id LOOP
    UPDATE public.inventario SET cantidad = cantidad + v_linea.cantidad, updated_at = now()
      WHERE almacen_id = v_t.almacen_origen_id AND lote_id = v_linea.lote_id;

    SELECT costo_unitario INTO v_costo FROM public.lotes WHERE id = v_linea.lote_id;
    INSERT INTO public.movimientos_inventario
      (almacen_id, lote_id, tipo, cantidad, costo_unitario,
       referencia_tipo, referencia_id, usuario_id, sucursal_id, notas)
    VALUES
      (v_t.almacen_origen_id, v_linea.lote_id, 'traspaso_cancelacion', v_linea.cantidad, v_costo,
       'traspaso', p_traspaso_id, v_user, v_t.sucursal_origen_id,
       'Cancelación: ' || p_motivo);
  END LOOP;

  UPDATE public.traspasos SET estado='cancelado', motivo_cancelacion=p_motivo, updated_at=now()
   WHERE id = p_traspaso_id;

  RETURN jsonb_build_object('id', p_traspaso_id, 'estado', 'cancelado');
END $$;

-- ============ DEVOLUCIONES A PROVEEDOR ============
CREATE TABLE IF NOT EXISTS public.devoluciones_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_devolucion text UNIQUE,
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id),
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  motivo text NOT NULL,
  total numeric(12,2) NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'registrada' CHECK (estado IN ('registrada','cancelada')),
  notas text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.devoluciones_proveedor TO authenticated;
GRANT ALL ON public.devoluciones_proveedor TO service_role;
ALTER TABLE public.devoluciones_proveedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operativos ven devoluciones" ON public.devoluciones_proveedor
  FOR SELECT USING (true);
CREATE POLICY "Operativos crean devoluciones" ON public.devoluciones_proveedor
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
           OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role)
           OR has_role(auth.uid(),'almacen'::app_role));
CREATE POLICY "Operativos actualizan devoluciones" ON public.devoluciones_proveedor
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role)
      OR has_role(auth.uid(),'almacen'::app_role));

CREATE TRIGGER update_devoluciones_proveedor_updated_at
  BEFORE UPDATE ON public.devoluciones_proveedor
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.devolucion_proveedor_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucion_id uuid NOT NULL REFERENCES public.devoluciones_proveedor(id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.lotes(id),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  cantidad integer NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric(12,2) NOT NULL DEFAULT 0,
  importe numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.devolucion_proveedor_lineas TO authenticated;
GRANT ALL ON public.devolucion_proveedor_lineas TO service_role;
ALTER TABLE public.devolucion_proveedor_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven lineas devolucion" ON public.devolucion_proveedor_lineas FOR SELECT USING (true);
CREATE POLICY "Operativos crean lineas devolucion" ON public.devolucion_proveedor_lineas
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dev_lineas_dev ON public.devolucion_proveedor_lineas(devolucion_id);

-- ============ Folio devolución ============
CREATE OR REPLACE FUNCTION public.generar_folio_devolucion()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM now());
  v_count int;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.devoluciones_proveedor
  WHERE numero_devolucion LIKE 'DEV-' || v_year || '-%';
  RETURN 'DEV-' || v_year || '-' || LPAD(v_count::text, 5, '0');
END $$;

-- ============ REGISTRAR DEVOLUCIÓN ============
CREATE OR REPLACE FUNCTION public.registrar_devolucion_proveedor(
  p_proveedor_id uuid,
  p_sucursal_id uuid,
  p_almacen_id uuid,
  p_motivo text,
  p_lineas jsonb,   -- [{lote_id, cantidad}]
  p_notas text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_numero text;
  v_user uuid := auth.uid();
  v_linea jsonb;
  v_lote_id uuid;
  v_cantidad int;
  v_stock int;
  v_costo numeric;
  v_producto_id uuid;
  v_importe numeric;
  v_total numeric := 0;
BEGIN
  IF jsonb_array_length(p_lineas) = 0 THEN RAISE EXCEPTION 'Debe incluir al menos una línea'; END IF;

  v_numero := public.generar_folio_devolucion();

  INSERT INTO public.devoluciones_proveedor
    (numero_devolucion, proveedor_id, sucursal_id, almacen_id, motivo, notas, created_by)
  VALUES (v_numero, p_proveedor_id, p_sucursal_id, p_almacen_id, p_motivo, p_notas, v_user)
  RETURNING id INTO v_id;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_lote_id := (v_linea->>'lote_id')::uuid;
    v_cantidad := (v_linea->>'cantidad')::int;
    IF v_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

    SELECT cantidad INTO v_stock FROM public.inventario
      WHERE almacen_id = p_almacen_id AND lote_id = v_lote_id FOR UPDATE;
    IF v_stock IS NULL OR v_stock < v_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en lote %, disponible: %', v_lote_id, COALESCE(v_stock,0);
    END IF;

    SELECT producto_id, costo_unitario INTO v_producto_id, v_costo FROM public.lotes WHERE id = v_lote_id;
    v_importe := v_cantidad * v_costo;
    v_total := v_total + v_importe;

    UPDATE public.inventario SET cantidad = cantidad - v_cantidad, updated_at = now()
      WHERE almacen_id = p_almacen_id AND lote_id = v_lote_id;

    INSERT INTO public.devolucion_proveedor_lineas
      (devolucion_id, lote_id, producto_id, cantidad, costo_unitario, importe)
    VALUES (v_id, v_lote_id, v_producto_id, v_cantidad, v_costo, v_importe);

    INSERT INTO public.movimientos_inventario
      (almacen_id, lote_id, tipo, cantidad, costo_unitario,
       referencia_tipo, referencia_id, usuario_id, sucursal_id, notas)
    VALUES
      (p_almacen_id, v_lote_id, 'devolucion_proveedor', -v_cantidad, v_costo,
       'devolucion_proveedor', v_id, v_user, p_sucursal_id,
       'Devolución ' || v_numero || ' — ' || p_motivo);
  END LOOP;

  UPDATE public.devoluciones_proveedor SET total = v_total, updated_at = now() WHERE id = v_id;

  RETURN jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total);
END $$;
