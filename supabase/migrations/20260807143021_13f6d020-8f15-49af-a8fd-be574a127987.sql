-- =========================================================
-- Sesión ago-2026 (parte 2): quitar el "stand by" de recepción,
-- agregar marca simple de "ya llegó" (sin captura de datos),
-- bitácora de recepción (automática + manual), y promociones
-- automáticas recurrentes por día de la semana.
-- =========================================================

-- 1) "Ya llegó" — marca ligera e independiente de la recepción formal.
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS llego_fisicamente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS llego_fisicamente_en timestamptz,
  ADD COLUMN IF NOT EXISTS llego_fisicamente_por uuid;

CREATE OR REPLACE FUNCTION public.marcar_llegada_oc(p_orden_id uuid, p_valor boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_oc record; v_autorizado boolean;
BEGIN
  SELECT * INTO v_oc FROM ordenes_compra WHERE id = p_orden_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;

  v_autorizado :=
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role)
    OR (
      (has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role))
      AND v_oc.sucursal_destino_id IS NOT NULL AND es_gerente_de_sucursal(auth.uid(), v_oc.sucursal_destino_id)
    );
  IF NOT v_autorizado THEN RAISE EXCEPTION 'Sin permiso para marcar la llegada de esta orden'; END IF;

  UPDATE ordenes_compra SET
    llego_fisicamente = p_valor,
    llego_fisicamente_en = CASE WHEN p_valor THEN now() ELSE NULL END,
    llego_fisicamente_por = CASE WHEN p_valor THEN auth.uid() ELSE NULL END
  WHERE id = p_orden_id;
END;
$function$;

-- 2) Quitar el "stand by": recibir_oc vuelve a exigir factura.
DROP FUNCTION IF EXISTS public.ligar_factura_recepcion(uuid, uuid);
DROP FUNCTION IF EXISTS public.recibir_oc(uuid, jsonb, uuid, uuid);

CREATE OR REPLACE FUNCTION public.recibir_oc(p_orden_id uuid, p_recepciones jsonb, p_almacen_id uuid, p_factura_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_item jsonb; v_linea record; v_cant int; v_lote_id uuid; v_estado text;
  v_total_sol int; v_total_rec int; v_user uuid := auth.uid();
  v_oc record; v_transito record; v_almacen_destino_id uuid; v_almacen_sucursal_id uuid;
  v_cant_total_transito int; v_cant_para_esta_sucursal int; v_lineas_traspaso jsonb; v_autorizado boolean;
  v_factura record; v_costo numeric;
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

    v_costo := COALESCE(NULLIF(v_item->>'costo_unitario','')::numeric, v_linea.precio_unitario);

    UPDATE orden_compra_lineas SET cantidad_recibida = cantidad_recibida + v_cant WHERE id = v_linea.id;

    INSERT INTO lotes (producto_id, numero_lote, costo_unitario, fecha_recepcion, fecha_caducidad, compra_id)
    VALUES (v_linea.producto_id, NULLIF(v_item->>'numero_lote', ''), v_costo, CURRENT_DATE,
            NULLIF(v_item->>'fecha_caducidad', '')::date, v_oc.compra_real_id)
    RETURNING id INTO v_lote_id;
    IF (v_item->>'numero_lote') IS NULL OR (v_item->>'numero_lote') = '' THEN
      UPDATE lotes SET numero_lote = 'OC-'||SUBSTRING(p_orden_id::text,1,8)||'-'||to_char(now(),'YYYYMMDDHH24MISS') WHERE id = v_lote_id;
    END IF;

    INSERT INTO inventario (almacen_id, lote_id, cantidad) VALUES (p_almacen_id, v_lote_id, v_cant);
    INSERT INTO movimientos_inventario (almacen_id, lote_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id, usuario_id, notas)
    VALUES (p_almacen_id, v_lote_id, 'entrada', v_cant, v_costo, 'orden_compra', p_orden_id, v_user, 'Recepción OC — factura ' || v_factura.folio);

    INSERT INTO ordenes_compra_recepciones (orden_id, factura_id, linea_id, producto_id, cantidad, numero_lote, fecha_caducidad,
                                            recibido_por, almacen_id, costo_unitario, incidencia_tipo, incidencia_notas,
                                            aplicada_inventario, aplicada_en)
    VALUES (p_orden_id, p_factura_id, v_linea.id, v_linea.producto_id, v_cant,
            NULLIF(v_item->>'numero_lote', ''), NULLIF(v_item->>'fecha_caducidad', '')::date, v_user,
            p_almacen_id, v_costo, NULLIF(v_item->>'incidencia_tipo',''), NULLIF(v_item->>'incidencia_notas',''),
            true, now());

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

-- 3) Bitácora de recepción
CREATE TABLE IF NOT EXISTS public.bitacora_recepcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid REFERENCES public.ordenes_compra(id),
  sucursal_id uuid REFERENCES public.sucursales(id),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  proveedor_nombre text,
  factura_folio text,
  factura_monto numeric(14,2),
  orden_folio text,
  orden_total numeric(14,2),
  resumen_recibido jsonb,
  reportado_por uuid,
  automatico boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.bitacora_recepcion TO authenticated;
GRANT ALL ON public.bitacora_recepcion TO service_role;
ALTER TABLE public.bitacora_recepcion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bitacora lectura" ON public.bitacora_recepcion;
CREATE POLICY "Bitacora lectura" ON public.bitacora_recepcion
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'contraloria'::app_role)
    OR has_role(auth.uid(),'auditoria'::app_role) OR has_role(auth.uid(),'direccion'::app_role)
    OR (sucursal_id IS NOT NULL AND es_gerente_de_sucursal(auth.uid(), sucursal_id))
  );

DROP POLICY IF EXISTS "Bitacora escritura manual" ON public.bitacora_recepcion;
CREATE POLICY "Bitacora escritura manual" ON public.bitacora_recepcion
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role)
    OR (sucursal_id IS NOT NULL AND es_gerente_de_sucursal(auth.uid(), sucursal_id))
  );

CREATE OR REPLACE FUNCTION public.reportar_bitacora_recepcion(p_orden_id uuid, p_notas text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_oc record; v_proveedor_nombre text; v_factura record; v_resumen jsonb; v_id uuid; v_autorizado boolean;
BEGIN
  SELECT oc.*, p.nombre AS proveedor_nombre INTO v_oc
  FROM ordenes_compra oc LEFT JOIN proveedores p ON p.id = oc.proveedor_id
  WHERE oc.id = p_orden_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;

  v_autorizado :=
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role)
    OR (v_oc.sucursal_destino_id IS NOT NULL AND es_gerente_de_sucursal(auth.uid(), v_oc.sucursal_destino_id));
  IF NOT v_autorizado THEN RAISE EXCEPTION 'Sin permiso para reportar esta orden en la bitácora'; END IF;

  SELECT * INTO v_factura FROM ordenes_compra_facturas WHERE orden_id = p_orden_id ORDER BY created_at DESC LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object('sku', p.sku, 'nombre', p.nombre, 'cantidad', r.cantidad))
    INTO v_resumen
  FROM ordenes_compra_recepciones r JOIN productos p ON p.id = r.producto_id
  WHERE r.orden_id = p_orden_id;

  INSERT INTO bitacora_recepcion
    (orden_id, sucursal_id, fecha, proveedor_nombre, factura_folio, factura_monto,
     orden_folio, orden_total, resumen_recibido, reportado_por, automatico, notas)
  VALUES
    (p_orden_id, v_oc.sucursal_destino_id, CURRENT_DATE, v_oc.proveedor_nombre,
     v_factura.folio, v_factura.importe, v_oc.folio, v_oc.total, v_resumen, auth.uid(), true, p_notas)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- 4) Promociones automáticas recurrentes
CREATE TABLE IF NOT EXISTS public.promociones_precio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  dia_semana int NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  criterio_tipo text NOT NULL CHECK (criterio_tipo IN ('clasificacion','estatus')),
  criterio_valor text NOT NULL,
  porcentaje_descuento numeric(5,2) NOT NULL CHECK (porcentaje_descuento > 0 AND porcentaje_descuento <= 100),
  activo boolean NOT NULL DEFAULT true,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at_promo()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;
DROP TRIGGER IF EXISTS trg_promo_updated_at ON public.promociones_precio;
CREATE TRIGGER trg_promo_updated_at BEFORE UPDATE ON public.promociones_precio
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_promo();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promociones_precio TO authenticated;
GRANT ALL ON public.promociones_precio TO service_role;
ALTER TABLE public.promociones_precio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Promociones lectura" ON public.promociones_precio;
CREATE POLICY "Promociones lectura" ON public.promociones_precio
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Promociones escritura" ON public.promociones_precio;
CREATE POLICY "Promociones escritura" ON public.promociones_precio
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role));

CREATE OR REPLACE VIEW public.v_promociones_vigentes_hoy AS
SELECT
  pr.id AS promocion_id, pr.nombre, pr.criterio_tipo, pr.criterio_valor, pr.porcentaje_descuento,
  p.id AS producto_id, p.sku, p.nombre AS producto_nombre, p.precio_base AS precio_base,
  ROUND(p.precio_base * (1 - pr.porcentaje_descuento / 100.0), 2) AS precio_con_descuento
FROM promociones_precio pr
JOIN productos p ON (
  (pr.criterio_tipo = 'clasificacion' AND p.clasificacion = pr.criterio_valor)
  OR (pr.criterio_tipo = 'estatus' AND p.estatus = pr.criterio_valor)
)
WHERE pr.activo = true
  AND pr.dia_semana = EXTRACT(DOW FROM CURRENT_DATE)::int;

GRANT SELECT ON public.v_promociones_vigentes_hoy TO authenticated;