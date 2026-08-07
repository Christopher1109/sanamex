-- =========================================================
-- Sesión ago-2026: factura obligatoria en recepción, múltiples
-- facturas por OC con desglose de cantidades, expediente PDF/XML,
-- nota de crédito ligada a una factura específica, fecha estimada
-- de entrega al marcar en ruta, y notificación automática a la
-- sucursal cuando el pedido queda en camino.
-- =========================================================

-- 1) Fecha estimada de entrega — se captura al marcar "en ruta" y se usa
--    para ordenar cronológicamente en "Mi sucursal" (gerente/almacenista).
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS fecha_estimada_entrega date;

COMMENT ON COLUMN public.ordenes_compra.fecha_estimada_entrega IS
  'Fecha aproximada de entrega capturada al marcar en ruta (confirmar_envio_proveedor). Nula si no se indicó.';

-- 2) Facturas de una orden de compra. Una OC puede tener varias (ej. el
--    proveedor separa por tipo de empaque o por IVA) — cada una con su
--    propio folio, fecha, importe, y expediente PDF/XML.
CREATE TABLE IF NOT EXISTS public.ordenes_compra_facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  folio text NOT NULL,
  fecha_factura date,
  importe numeric(14,2),
  pdf_path text,
  xml_path text,
  capturada_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (orden_id, folio)
);

CREATE OR REPLACE FUNCTION public.set_updated_at_ocf()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;
DROP TRIGGER IF EXISTS trg_ocf_updated_at ON public.ordenes_compra_facturas;
CREATE TRIGGER trg_ocf_updated_at BEFORE UPDATE ON public.ordenes_compra_facturas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ocf();

GRANT SELECT, INSERT, UPDATE ON public.ordenes_compra_facturas TO authenticated;
GRANT ALL ON public.ordenes_compra_facturas TO service_role;
ALTER TABLE public.ordenes_compra_facturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "OC facturas lectura" ON public.ordenes_compra_facturas;
CREATE POLICY "OC facturas lectura" ON public.ordenes_compra_facturas
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ordenes_compra oc WHERE oc.id = ordenes_compra_facturas.orden_id AND (
      has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'contraloria'::app_role)
      OR has_role(auth.uid(),'auditoria'::app_role) OR has_role(auth.uid(),'direccion'::app_role)
      OR (
        (has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role))
        AND oc.sucursal_destino_id IS NOT NULL AND es_gerente_de_sucursal(auth.uid(), oc.sucursal_destino_id)
      )
    ))
  );

-- Insert/update de facturas se hace vía la función agregar_factura_oc()
-- (valida permisos con el mismo criterio que recibir_oc), pero se deja
-- también una policy de UPDATE directa para poder guardar pdf_path/xml_path
-- después de subir el archivo al bucket, sin pasar por otra función.
DROP POLICY IF EXISTS "OC facturas update expediente" ON public.ordenes_compra_facturas;
CREATE POLICY "OC facturas update expediente" ON public.ordenes_compra_facturas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ordenes_compra oc WHERE oc.id = ordenes_compra_facturas.orden_id AND (
      has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role)
      OR (
        (has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role))
        AND oc.sucursal_destino_id IS NOT NULL AND es_gerente_de_sucursal(auth.uid(), oc.sucursal_destino_id)
      )
    ))
  );

-- 3) Desglose de qué se recibió bajo cada factura (por línea) — para poder
--    responder "de la factura X se recibieron tantas, de la Y tantas".
CREATE TABLE IF NOT EXISTS public.ordenes_compra_recepciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  factura_id uuid NOT NULL REFERENCES public.ordenes_compra_facturas(id) ON DELETE CASCADE,
  linea_id uuid NOT NULL REFERENCES public.orden_compra_lineas(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES public.productos(id),
  cantidad integer NOT NULL CHECK (cantidad > 0),
  numero_lote text,
  fecha_caducidad date,
  recibido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ordenes_compra_recepciones TO authenticated;
GRANT ALL ON public.ordenes_compra_recepciones TO service_role;
ALTER TABLE public.ordenes_compra_recepciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "OC recepciones lectura" ON public.ordenes_compra_recepciones;
CREATE POLICY "OC recepciones lectura" ON public.ordenes_compra_recepciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ordenes_compra oc WHERE oc.id = ordenes_compra_recepciones.orden_id AND (
      has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'contraloria'::app_role)
      OR has_role(auth.uid(),'auditoria'::app_role) OR has_role(auth.uid(),'direccion'::app_role)
      OR (
        (has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role))
        AND oc.sucursal_destino_id IS NOT NULL AND es_gerente_de_sucursal(auth.uid(), oc.sucursal_destino_id)
      )
    ))
  );
-- Solo se inserta vía recibir_oc() (SECURITY DEFINER); no se abre INSERT directo por policy.

-- 4) Nota de crédito ligada a una factura específica (opcional — no todas
--    las notas nacen de una factura ya cargada).
ALTER TABLE public.notas_credito_proveedor
  ADD COLUMN IF NOT EXISTS factura_id uuid REFERENCES public.ordenes_compra_facturas(id);

-- 5) Bucket de storage para el expediente PDF/XML de cada factura.
INSERT INTO storage.buckets (id, name, public)
VALUES ('facturas-compra', 'facturas-compra', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "facturas-compra lectura" ON storage.objects;
CREATE POLICY "facturas-compra lectura" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'facturas-compra'
    AND (
      has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role)
      OR has_role(auth.uid(),'contraloria'::app_role) OR has_role(auth.uid(),'auditoria'::app_role) OR has_role(auth.uid(),'direccion'::app_role)
      OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role)
      OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role)
    )
  );
DROP POLICY IF EXISTS "facturas-compra escritura" ON storage.objects;
CREATE POLICY "facturas-compra escritura" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'facturas-compra'
    AND (
      has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role)
      OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role)
      OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role)
    )
  );

-- 6) agregar_factura_oc: liga (o actualiza) un folio de factura a una OC.
--    Debe llamarse ANTES de recibir_oc — es el requisito de "no se puede
--    recibir sin folio de factura".
CREATE OR REPLACE FUNCTION public.agregar_factura_oc(
  p_orden_id uuid, p_folio text, p_fecha_factura date DEFAULT NULL, p_importe numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_oc record; v_autorizado boolean; v_factura_id uuid;
BEGIN
  SELECT * INTO v_oc FROM ordenes_compra WHERE id = p_orden_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  IF p_folio IS NULL OR btrim(p_folio) = '' THEN RAISE EXCEPTION 'El folio de factura es obligatorio'; END IF;

  v_autorizado :=
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role)
    OR (
      (has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role))
      AND v_oc.sucursal_destino_id IS NOT NULL AND es_gerente_de_sucursal(auth.uid(), v_oc.sucursal_destino_id)
    );
  IF NOT v_autorizado THEN RAISE EXCEPTION 'Sin permiso para ligar facturas a esta orden de compra'; END IF;

  INSERT INTO ordenes_compra_facturas (orden_id, folio, fecha_factura, importe, capturada_por)
  VALUES (p_orden_id, btrim(p_folio), p_fecha_factura, p_importe, auth.uid())
  ON CONFLICT (orden_id, folio) DO UPDATE SET
    fecha_factura = COALESCE(EXCLUDED.fecha_factura, ordenes_compra_facturas.fecha_factura),
    importe = COALESCE(EXCLUDED.importe, ordenes_compra_facturas.importe)
  RETURNING id INTO v_factura_id;

  RETURN v_factura_id;
END;
$function$;

-- 7) recibir_oc: ahora EXIGE p_factura_id (ya no tiene default) — sin
--    factura ligada, la recepción se rechaza. Además registra el desglose
--    por factura en ordenes_compra_recepciones.
CREATE OR REPLACE FUNCTION public.recibir_oc(p_orden_id uuid, p_recepciones jsonb, p_almacen_id uuid, p_factura_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_item jsonb; v_linea record; v_cant int; v_lote_id uuid; v_estado text;
  v_total_sol int; v_total_rec int; v_user uuid := auth.uid();
  v_oc record; v_transito record; v_almacen_destino_id uuid; v_almacen_sucursal_id uuid;
  v_cant_total_transito int; v_cant_para_esta_sucursal int; v_lineas_traspaso jsonb; v_autorizado boolean;
  v_factura record;
BEGIN
  IF p_factura_id IS NULL THEN
    RAISE EXCEPTION 'Debes ligar el folio de factura antes de recibir mercancía';
  END IF;
  SELECT * INTO v_factura FROM ordenes_compra_facturas WHERE id = p_factura_id AND orden_id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La factura indicada no corresponde a esta orden de compra';
  END IF;

  SELECT * INTO v_oc FROM ordenes_compra WHERE id = p_orden_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;

  SELECT sucursal_id INTO v_almacen_sucursal_id FROM almacenes WHERE id = p_almacen_id;

  v_autorizado :=
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
    OR (
      (has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role))
      AND (
        es_gerente_de_sucursal(auth.uid(), v_almacen_sucursal_id)
        OR (v_oc.sucursal_destino_id IS NOT NULL AND es_gerente_de_sucursal(auth.uid(), v_oc.sucursal_destino_id))
      )
    );
  IF NOT v_autorizado THEN RAISE EXCEPTION 'Sin permiso para recibir mercancía en este almacén'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_recepciones) LOOP
    v_cant := (v_item->>'cantidad')::int;
    IF v_cant <= 0 THEN CONTINUE; END IF;
    SELECT ocl.* INTO v_linea FROM orden_compra_lineas ocl WHERE ocl.id = (v_item->>'linea_id')::uuid AND ocl.orden_id = p_orden_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE orden_compra_lineas SET cantidad_recibida = cantidad_recibida + v_cant WHERE id = v_linea.id;

    INSERT INTO lotes (producto_id, numero_lote, costo_unitario, fecha_recepcion, fecha_caducidad, compra_id)
    VALUES (v_linea.producto_id, NULLIF(v_item->>'numero_lote', ''), v_linea.precio_unitario, CURRENT_DATE,
            NULLIF(v_item->>'fecha_caducidad', '')::date, v_oc.compra_real_id)
    RETURNING id INTO v_lote_id;
    IF (v_item->>'numero_lote') IS NULL OR (v_item->>'numero_lote') = '' THEN
      UPDATE lotes SET numero_lote = 'OC-'||SUBSTRING(p_orden_id::text,1,8)||'-'||to_char(now(),'YYYYMMDDHH24MISS') WHERE id = v_lote_id;
    END IF;

    INSERT INTO inventario (almacen_id, lote_id, cantidad) VALUES (p_almacen_id, v_lote_id, v_cant);
    INSERT INTO movimientos_inventario (almacen_id, lote_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id, usuario_id, notas)
    VALUES (p_almacen_id, v_lote_id, 'entrada', v_cant, v_linea.precio_unitario, 'orden_compra', p_orden_id, v_user, 'Recepción OC — factura ' || v_factura.folio);

    -- Desglose por factura: qué cantidad de esta línea llegó bajo este folio.
    INSERT INTO ordenes_compra_recepciones (orden_id, factura_id, linea_id, producto_id, cantidad, numero_lote, fecha_caducidad, recibido_por)
    VALUES (p_orden_id, p_factura_id, v_linea.id, v_linea.producto_id, v_cant,
            NULLIF(v_item->>'numero_lote', ''), NULLIF(v_item->>'fecha_caducidad', '')::date, v_user);

    IF v_oc.sucursal_destino_id IS NULL THEN
      SELECT COALESCE(SUM(cantidad), 0) INTO v_cant_total_transito
        FROM ordenes_compra_transito WHERE orden_id = p_orden_id AND producto_id = v_linea.producto_id;
      IF v_cant_total_transito > 0 THEN
        FOR v_transito IN
          SELECT sucursal_id, cantidad FROM ordenes_compra_transito WHERE orden_id = p_orden_id AND producto_id = v_linea.producto_id AND cantidad > 0
        LOOP
          v_cant_para_esta_sucursal := FLOOR(v_cant * v_transito.cantidad::numeric / v_cant_total_transito);
          IF v_cant_para_esta_sucursal > 0 THEN
            SELECT id INTO v_almacen_destino_id FROM almacenes WHERE sucursal_id = v_transito.sucursal_id AND activo = true LIMIT 1;
            IF v_almacen_destino_id IS NOT NULL AND v_almacen_destino_id <> p_almacen_id THEN
              v_lineas_traspaso := jsonb_build_array(jsonb_build_object('lote_id', v_lote_id, 'cantidad', v_cant_para_esta_sucursal));
              PERFORM enviar_traspaso(v_almacen_sucursal_id, p_almacen_id, v_transito.sucursal_id, v_almacen_destino_id,
                v_lineas_traspaso, 'Reparto automático de ' || v_oc.folio || ' (entrega centralizada)');
            END IF;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(cantidad_solicitada),0), COALESCE(SUM(cantidad_recibida),0) INTO v_total_sol, v_total_rec
    FROM orden_compra_lineas WHERE orden_id = p_orden_id;
  v_estado := CASE WHEN v_total_rec = 0 THEN v_oc.estado WHEN v_total_rec >= v_total_sol THEN 'recibida' ELSE 'parcial' END;

  UPDATE ordenes_compra SET estado = v_estado,
    fecha_recepcion_real = CASE WHEN v_estado='recibida' THEN CURRENT_DATE ELSE fecha_recepcion_real END,
    recibida_por = v_user
  WHERE id = p_orden_id;

  RETURN jsonb_build_object('estado', v_estado, 'solicitado', v_total_sol, 'recibido', v_total_rec, 'factura_id', p_factura_id);
END;
$function$;

-- 8) confirmar_envio_proveedor: agrega fecha estimada de entrega y notifica
--    automáticamente a la(s) sucursal(es) al quedar "en ruta".
CREATE OR REPLACE FUNCTION public.confirmar_envio_proveedor(
  p_grupo_id uuid DEFAULT NULL,
  p_orden_id uuid DEFAULT NULL,
  p_metodo_pago text DEFAULT 'credito',
  p_dias_credito integer DEFAULT NULL,
  p_fecha_pago_limite date DEFAULT NULL,
  p_fecha_estimada_entrega date DEFAULT NULL,
  p_notas text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_grupo record; v_oc record;
  v_proveedor_id uuid; v_proveedor_nombre text; v_total numeric; v_subtotal numeric; v_iva numeric;
  v_sucursal_id uuid; v_compra_id uuid; v_numero text; v_pendientes int;
  v_mensaje text;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'compras'::app_role)) THEN
    RAISE EXCEPTION 'Sin permiso para confirmar el envío al proveedor';
  END IF;
  IF (p_grupo_id IS NULL) = (p_orden_id IS NULL) THEN
    RAISE EXCEPTION 'Debe indicar exactamente uno: grupo o una orden individual';
  END IF;
  IF p_metodo_pago NOT IN ('credito','contado') THEN
    RAISE EXCEPTION 'metodo_pago inválido: %', p_metodo_pago;
  END IF;

  IF p_grupo_id IS NOT NULL THEN
    SELECT * INTO v_grupo FROM ordenes_compra_grupo WHERE id = p_grupo_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Grupo no encontrado'; END IF;
    IF v_grupo.compra_real_id IS NOT NULL THEN RAISE EXCEPTION 'Este grupo ya fue confirmado con el proveedor'; END IF;
    SELECT count(*) INTO v_pendientes FROM ordenes_compra WHERE grupo_id = p_grupo_id AND estado NOT IN ('pendiente_confirmar','cancelada');
    IF v_pendientes > 0 THEN RAISE EXCEPTION 'Todavía hay % sucursal(es) sin llegar a pendiente_confirmar', v_pendientes; END IF;
    v_proveedor_id := v_grupo.proveedor_id;
    SELECT COALESCE(SUM(total),0), COALESCE(SUM(subtotal),0), COALESCE(SUM(iva),0) INTO v_total, v_subtotal, v_iva
      FROM ordenes_compra WHERE grupo_id = p_grupo_id AND estado <> 'cancelada';
    SELECT sucursal_destino_id INTO v_sucursal_id FROM ordenes_compra WHERE grupo_id = p_grupo_id AND estado <> 'cancelada' ORDER BY created_at LIMIT 1;
  ELSE
    SELECT * INTO v_oc FROM ordenes_compra WHERE id = p_orden_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
    IF v_oc.estado <> 'pendiente_confirmar' THEN RAISE EXCEPTION 'Esta orden no está pendiente de confirmar (estado actual: %)', v_oc.estado; END IF;
    IF v_oc.compra_real_id IS NOT NULL THEN RAISE EXCEPTION 'Esta orden ya fue confirmada con el proveedor'; END IF;
    v_proveedor_id := v_oc.proveedor_id; v_total := v_oc.total; v_subtotal := v_oc.subtotal; v_iva := v_oc.iva;
    v_sucursal_id := v_oc.sucursal_destino_id;
  END IF;

  IF v_sucursal_id IS NULL THEN
    SELECT id INTO v_sucursal_id FROM sucursales WHERE es_cedis = true AND activo = true ORDER BY codigo LIMIT 1;
  END IF;

  SELECT nombre INTO v_proveedor_nombre FROM proveedores WHERE id = v_proveedor_id;
  v_numero := 'OC-PROV-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,4);

  INSERT INTO compras (numero_compra, proveedor_id, sucursal_id, estado, total, subtotal, impuestos,
                       metodo_pago, dias_credito, fecha_factura, fecha_pago_limite, pagada, creado_por, notas)
  VALUES (v_numero, v_proveedor_id, v_sucursal_id, 'facturada', v_total, v_subtotal, v_iva,
          p_metodo_pago, CASE WHEN p_metodo_pago = 'credito' THEN p_dias_credito ELSE NULL END,
          CURRENT_DATE,
          CASE WHEN p_metodo_pago = 'credito' THEN COALESCE(p_fecha_pago_limite, CURRENT_DATE + COALESCE(p_dias_credito, 30)) ELSE CURRENT_DATE END,
          false, auth.uid(), COALESCE(p_notas, ''))
  RETURNING id INTO v_compra_id;

  v_mensaje := 'El proveedor ' || COALESCE(v_proveedor_nombre, '') || ' confirmó tu pedido y ya va en camino.'
    || CASE WHEN p_fecha_estimada_entrega IS NOT NULL THEN ' Llega aproximadamente el ' || to_char(p_fecha_estimada_entrega, 'DD/MM/YYYY') || '.' ELSE '' END;

  IF p_grupo_id IS NOT NULL THEN
    UPDATE ordenes_compra_grupo SET compra_real_id = v_compra_id, estado = 'enviada', fecha_envio = CURRENT_DATE WHERE id = p_grupo_id;
    UPDATE ordenes_compra SET estado = 'en_ruta', compra_real_id = v_compra_id, fecha_envio = CURRENT_DATE,
      fecha_estimada_entrega = p_fecha_estimada_entrega
      WHERE grupo_id = p_grupo_id AND estado = 'pendiente_confirmar';

    INSERT INTO notificaciones (tipo, titulo, mensaje, severidad, sucursal_id, referencia_id, referencia_tipo)
    SELECT 'oc_en_ruta', 'Pedido en camino — ' || oc.folio, v_mensaje, 'info', oc.sucursal_destino_id, oc.id, 'orden_compra'
    FROM ordenes_compra oc
    WHERE oc.grupo_id = p_grupo_id AND oc.estado = 'en_ruta' AND oc.sucursal_destino_id IS NOT NULL;
  ELSE
    UPDATE ordenes_compra SET estado = 'en_ruta', compra_real_id = v_compra_id, fecha_envio = CURRENT_DATE,
      fecha_estimada_entrega = p_fecha_estimada_entrega
      WHERE id = p_orden_id;

    IF v_sucursal_id IS NOT NULL THEN
      INSERT INTO notificaciones (tipo, titulo, mensaje, severidad, sucursal_id, referencia_id, referencia_tipo)
      SELECT 'oc_en_ruta', 'Pedido en camino — ' || oc.folio, v_mensaje, 'info', v_sucursal_id, p_orden_id, 'orden_compra'
      FROM ordenes_compra oc WHERE oc.id = p_orden_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('compra_id', v_compra_id, 'numero_compra', v_numero, 'estado', 'en_ruta');
END;
$function$;

-- 9) crear_nota_credito_proveedor: agrega parámetro opcional para ligar la
--    nota a una factura específica.
CREATE OR REPLACE FUNCTION public.crear_nota_credito_proveedor(
  p_proveedor_id uuid,
  p_tipo text,
  p_monto numeric,
  p_motivo text DEFAULT NULL,
  p_compra_id uuid DEFAULT NULL,
  p_producto_id uuid DEFAULT NULL,
  p_cantidad_incidencia integer DEFAULT NULL,
  p_lote_id uuid DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_es_retroactiva boolean DEFAULT false,
  p_periodo_inicio date DEFAULT NULL,
  p_periodo_fin date DEFAULT NULL,
  p_factura_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_nc_id uuid;
  v_folio text;
  v_ajuste_unitario numeric;
  v_costo_actual numeric;
  v_compra record;
  v_pagado_previo numeric;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
       OR has_role(auth.uid(),'contabilidad'::app_role) OR has_role(auth.uid(),'contraloria'::app_role)
       OR has_role(auth.uid(),'compras'::app_role)) THEN
    RAISE EXCEPTION 'Sin permiso para crear notas de crédito de proveedor';
  END IF;
  IF p_tipo NOT IN ('incidencia','negociada','objetivo_trimestral') THEN
    RAISE EXCEPTION 'Tipo de nota de crédito inválido: %', p_tipo;
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto de la nota de crédito debe ser mayor a cero';
  END IF;
  IF p_factura_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM ordenes_compra_facturas WHERE id = p_factura_id) THEN
      RAISE EXCEPTION 'La factura indicada no existe';
    END IF;
  END IF;

  v_folio := 'NC-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,4);

  INSERT INTO notas_credito_proveedor
    (folio, proveedor_id, tipo, monto, motivo, compra_id, producto_id,
     cantidad_incidencia, lote_id, es_retroactiva, periodo_inicio, periodo_fin, creada_por, factura_id)
  VALUES
    (v_folio, p_proveedor_id, p_tipo, p_monto, p_motivo, p_compra_id, p_producto_id,
     p_cantidad_incidencia, p_lote_id, p_es_retroactiva, p_periodo_inicio, p_periodo_fin, auth.uid(), p_factura_id)
  RETURNING id INTO v_nc_id;

  -- Aplica contra la COMPRA real (compras + pagos_cxp).
  IF p_compra_id IS NOT NULL THEN
    SELECT * INTO v_compra FROM compras WHERE id = p_compra_id;
    IF FOUND THEN
      SELECT COALESCE(SUM(monto),0) INTO v_pagado_previo FROM pagos_cxp WHERE compra_id = p_compra_id;

      INSERT INTO pagos_cxp (compra_id, fecha, monto, forma_pago, referencia, notas, creado_por)
      VALUES (p_compra_id, CURRENT_DATE, p_monto, 'nota_credito', v_folio, COALESCE(p_motivo,'Nota de crédito ' || p_tipo), auth.uid());

      IF (v_pagado_previo + p_monto) >= (v_compra.total - 0.5) THEN
        UPDATE compras SET pagada = true, estado = 'pagada', fecha_pago_real = CURRENT_DATE WHERE id = p_compra_id;
      END IF;
    END IF;
  END IF;

  IF p_tipo = 'incidencia' AND p_producto_id IS NOT NULL AND p_cantidad_incidencia IS NOT NULL AND p_almacen_id IS NOT NULL THEN
    IF p_lote_id IS NULL THEN
      SELECT id INTO p_lote_id FROM lotes
      WHERE producto_id = p_producto_id AND (p_compra_id IS NULL OR compra_id = p_compra_id)
      ORDER BY created_at DESC LIMIT 1;
    END IF;
    IF p_lote_id IS NOT NULL THEN
      UPDATE inventario SET cantidad = GREATEST(cantidad - p_cantidad_incidencia, 0), updated_at = now()
      WHERE almacen_id = p_almacen_id AND lote_id = p_lote_id;

      SELECT costo_unitario INTO v_costo_actual FROM lotes WHERE id = p_lote_id;
      INSERT INTO movimientos_inventario (almacen_id, lote_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id, usuario_id, notas)
      VALUES (p_almacen_id, p_lote_id, 'salida', p_cantidad_incidencia, v_costo_actual, 'nota_credito_proveedor', v_nc_id, auth.uid(),
              'Ajuste por incidencia de proveedor (faltante de piezas) — ' || v_folio);
    END IF;
  END IF;

  IF p_tipo = 'negociada' AND p_lote_id IS NOT NULL AND p_cantidad_incidencia IS NOT NULL AND p_cantidad_incidencia > 0 THEN
    v_ajuste_unitario := p_monto / p_cantidad_incidencia;
    UPDATE lotes SET costo_unitario = GREATEST(costo_unitario - v_ajuste_unitario, 0) WHERE id = p_lote_id;
  END IF;

  UPDATE notas_credito_proveedor SET aplicada = true, aplicada_por = auth.uid(), aplicada_en = now() WHERE id = v_nc_id;

  RETURN jsonb_build_object('id', v_nc_id, 'folio', v_folio);
END;
$function$;
