-- =========================================================
-- Sesión 30-jul-2026 (parte 2): flujo completo de envío al proveedor,
-- "en ruta", recepción con lote/caducidad real, y reparto automático a
-- Traspasos para el caso de entrega centralizada (orden madre a CEDIS).
-- =========================================================

-- Nuevos estados en el ciclo de vida de una OC: después de autorizada por
-- admin, ya no vuelve a 'borrador' — pasa a 'pendiente_confirmar' (lista
-- para imprimir/mandar al proveedor, pero sin comprometerse todavía). Solo
-- al confirmar con el proveedor (forma de pago, fecha) pasa a 'en_ruta'.
ALTER TABLE public.ordenes_compra DROP CONSTRAINT ordenes_compra_estado_check;
ALTER TABLE public.ordenes_compra ADD CONSTRAINT ordenes_compra_estado_check
  CHECK (estado = ANY (ARRAY[
    'borrador','pendiente_aprobacion','confirmada_gerente',
    'pendiente_confirmar','en_ruta',
    'enviada','confirmada','parcial','recibida','cancelada'
  ]));

-- Enlace con la compra real (compras/CxP) una vez que se confirma con el
-- proveedor — antes de eso, NULL.
ALTER TABLE public.ordenes_compra ADD COLUMN IF NOT EXISTS compra_real_id uuid REFERENCES public.compras(id);
ALTER TABLE public.ordenes_compra_grupo ADD COLUMN IF NOT EXISTS compra_real_id uuid REFERENCES public.compras(id);

COMMENT ON COLUMN public.ordenes_compra.compra_real_id IS
  'Enlaza con compras(id) — la fuente de verdad real de Cuentas por Pagar — una vez que se confirma el envío al proveedor (ver confirmar_envio_proveedor). Antes de eso es NULL.';

-- autorizar_oc_admin: 'autorizar' ahora deja la orden en 'pendiente_confirmar'
-- en vez de 'borrador'.
CREATE OR REPLACE FUNCTION public.autorizar_oc_admin(p_oc_id uuid, p_accion text, p_razon text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_oc record;
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Solo administración puede dar la autorización final de compra';
  END IF;
  SELECT * INTO v_oc FROM ordenes_compra WHERE id = p_oc_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  IF v_oc.estado <> 'confirmada_gerente' THEN
    RAISE EXCEPTION 'Esta orden no está lista para autorización final (estado actual: %)', v_oc.estado;
  END IF;
  IF p_accion = 'autorizar' THEN
    UPDATE ordenes_compra SET estado = 'pendiente_confirmar', autorizada_por = auth.uid(), fecha_autorizacion = now() WHERE id = p_oc_id;
    RETURN jsonb_build_object('estado', 'pendiente_confirmar');
  ELSIF p_accion = 'rechazar' THEN
    UPDATE ordenes_compra SET estado = 'cancelada', razon_aprobacion = COALESCE(p_razon, 'Rechazada en autorización final') WHERE id = p_oc_id;
    RETURN jsonb_build_object('estado', 'cancelada');
  ELSE
    RAISE EXCEPTION 'Acción inválida: %', p_accion;
  END IF;
END;
$function$;

-- confirmar_envio_proveedor: captura la forma de pago (contado/crédito),
-- crea el registro real en compras/CxP (la fuente de verdad, ver hallazgo
-- de la sesión de contabilidad), y marca la orden (o todo el grupo) como
-- 'en_ruta'. Reemplaza a enviar_grupo_a_proveedor.
CREATE OR REPLACE FUNCTION public.confirmar_envio_proveedor(
  p_grupo_id uuid DEFAULT NULL,
  p_orden_id uuid DEFAULT NULL,
  p_metodo_pago text DEFAULT 'credito',
  p_dias_credito integer DEFAULT NULL,
  p_fecha_pago_limite date DEFAULT NULL,
  p_notas text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_grupo record; v_oc record;
  v_proveedor_id uuid; v_total numeric; v_subtotal numeric; v_iva numeric;
  v_sucursal_id uuid; v_compra_id uuid; v_numero text; v_pendientes int;
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

  v_numero := 'OC-PROV-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,4);

  INSERT INTO compras (numero_compra, proveedor_id, sucursal_id, estado, total, subtotal, impuestos,
                       metodo_pago, dias_credito, fecha_factura, fecha_pago_limite, pagada, creado_por, notas)
  VALUES (v_numero, v_proveedor_id, v_sucursal_id, 'facturada', v_total, v_subtotal, v_iva,
          p_metodo_pago, CASE WHEN p_metodo_pago = 'credito' THEN p_dias_credito ELSE NULL END,
          CURRENT_DATE,
          CASE WHEN p_metodo_pago = 'credito' THEN COALESCE(p_fecha_pago_limite, CURRENT_DATE + COALESCE(p_dias_credito, 30)) ELSE CURRENT_DATE END,
          false, auth.uid(), COALESCE(p_notas, ''))
  RETURNING id INTO v_compra_id;

  IF p_grupo_id IS NOT NULL THEN
    UPDATE ordenes_compra_grupo SET compra_real_id = v_compra_id, estado = 'enviada', fecha_envio = CURRENT_DATE WHERE id = p_grupo_id;
    UPDATE ordenes_compra SET estado = 'en_ruta', compra_real_id = v_compra_id, fecha_envio = CURRENT_DATE
      WHERE grupo_id = p_grupo_id AND estado = 'pendiente_confirmar';
  ELSE
    UPDATE ordenes_compra SET estado = 'en_ruta', compra_real_id = v_compra_id, fecha_envio = CURRENT_DATE WHERE id = p_orden_id;
  END IF;

  RETURN jsonb_build_object('compra_id', v_compra_id, 'numero_compra', v_numero, 'estado', 'en_ruta');
END;
$function$;

COMMENT ON FUNCTION public.enviar_grupo_a_proveedor(uuid) IS
  'OBSOLETA desde 30-jul-2026 — reemplazada por confirmar_envio_proveedor(), que además captura forma de pago y crea el registro real en compras/CxP.';

-- recibir_oc: ahora pide número de lote y fecha de caducidad reales (antes
-- generaba un lote sintético y no pedía caducidad); agrega chequeo de
-- permisos (antes cualquier autenticado podía llamarla); y para el caso de
-- "orden madre" (entrega centralizada, sucursal_destino_id NULL) reparte
-- automáticamente vía traspasos (usando ordenes_compra_transito para saber
-- cuánto le toca a cada sucursal) — el destino solo tiene que confirmar su
-- traspaso en el módulo de Traspasos, como cualquier otro.
CREATE OR REPLACE FUNCTION public.recibir_oc(p_orden_id uuid, p_recepciones jsonb, p_almacen_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_item jsonb; v_linea record; v_cant int; v_lote_id uuid; v_estado text;
  v_total_sol int; v_total_rec int; v_user uuid := auth.uid();
  v_oc record; v_transito record; v_almacen_destino_id uuid; v_almacen_sucursal_id uuid;
  v_cant_total_transito int; v_cant_para_esta_sucursal int; v_lineas_traspaso jsonb; v_autorizado boolean;
BEGIN
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
    VALUES (p_almacen_id, v_lote_id, 'entrada', v_cant, v_linea.precio_unitario, 'orden_compra', p_orden_id, v_user, 'Recepción OC');

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

  RETURN jsonb_build_object('estado', v_estado, 'solicitado', v_total_sol, 'recibido', v_total_rec);
END;
$function$;

-- Los almacenistas (almacen_ventas / almacen) ven las OC de su sucursal, más
-- las "orden madre" si su sucursal es el CEDIS — igual que gerente/subgerente.
DROP POLICY IF EXISTS "OC lectura" ON public.ordenes_compra;
CREATE POLICY "OC lectura" ON public.ordenes_compra
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'contraloria'::app_role)
    OR has_role(auth.uid(),'auditoria'::app_role) OR has_role(auth.uid(),'direccion'::app_role)
    OR (
      (has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role))
      AND (
        sucursal_destino_id IN (SELECT sucursal_id FROM user_sucursal_asignacion WHERE user_id = auth.uid())
        OR (sucursal_destino_id IS NULL AND EXISTS (
          SELECT 1 FROM user_sucursal_asignacion usa JOIN sucursales s ON s.id = usa.sucursal_id
          WHERE usa.user_id = auth.uid() AND s.es_cedis = true))
      )
    )
  );

DROP POLICY IF EXISTS "OC lineas lectura" ON public.orden_compra_lineas;
CREATE POLICY "OC lineas lectura" ON public.orden_compra_lineas
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ordenes_compra oc WHERE oc.id = orden_compra_lineas.orden_id AND (
      has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'contraloria'::app_role)
      OR has_role(auth.uid(),'auditoria'::app_role) OR has_role(auth.uid(),'direccion'::app_role)
      OR (
        (has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'almacen'::app_role))
        AND (
          oc.sucursal_destino_id IN (SELECT sucursal_id FROM user_sucursal_asignacion WHERE user_id = auth.uid())
          OR (oc.sucursal_destino_id IS NULL AND EXISTS (SELECT 1 FROM user_sucursal_asignacion usa JOIN sucursales s ON s.id = usa.sucursal_id WHERE usa.user_id = auth.uid() AND s.es_cedis = true))
        )
      )
    ))
  );

-- Acceso real de "solo consultar" al módulo de compras para las almacenistas ya existentes.
INSERT INTO user_module_access (user_id, modulo, nivel_acceso)
SELECT ur.user_id, 'compras', 'consultar' FROM user_roles ur WHERE ur.role = 'almacen_ventas'
ON CONFLICT (user_id, modulo) DO UPDATE SET nivel_acceso = 'consultar';
