-- =========================================================
-- Flujo de Órdenes de Compra: "orden madre" (grupo) + trazabilidad
-- =========================================================
-- Esta migración tiene dos partes:
--
-- 1) Documenta en el repo objetos que ya existían en la base de datos en vivo
--    (creados directamente ahí, sin migración) para que dejen de depender solo
--    de la nube: ordenes_compra_grupo, v_ordenes_compra_grupo_resumen,
--    enviar_grupo_a_proveedor, sync_estado_grupo_oc, es_gerente_de_sucursal,
--    recibir_oc. Usa IF NOT EXISTS / CREATE OR REPLACE, así que no rompe nada
--    si ya existen (solo importa para reconstruir el proyecto desde cero).
--
-- 2) Aplica las correcciones de la revisión del 29-jul-2026:
--    - cotizador_generar_oc ahora sí crea el grupo cuando el proveedor
--      entrega_por_sucursal = true (antes: 0 filas en ordenes_compra_grupo,
--      la pestaña "Por proveedor" nunca mostraba nada).
--    - Las OC generadas desde el cotizador arrancan en 'pendiente_aprobacion'
--      en vez de 'borrador' (antes se quedaban huérfanas, sin pasar nunca por
--      revisión de gerente).
--    - revisar_oc_gerente ya no intenta escribir a mano la columna generada
--      'subtotal' (antes: cualquier edición de cantidad tronaba con
--      "column subtotal can only be updated to DEFAULT").
--    - El IVA recalculado tras una edición usa la tasa real por producto
--      (productos.iva_tasa: 0/8/16) en vez de 16% fijo para todo.
--    - Nueva trazabilidad: quién revisó, si hubo cambios de cantidad, quién
--      autorizó y cuándo — para el rol `compras` y para admin.
--    - generar_ordenes_compra_desde_cotizador queda documentada como obsoleta
--      (no la usa el frontend; duplicaba el trabajo de cotizador_generar_oc
--      y no respetaba entrega_por_sucursal).

-- ---------------------------------------------------------
-- PARTE 1: objetos existentes en producción, ahora versionados
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ordenes_compra_grupo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL,
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id),
  estado text NOT NULL DEFAULT 'en_revision',
  notas text,
  creada_por uuid,
  fecha_creacion date NOT NULL DEFAULT CURRENT_DATE,
  fecha_envio date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes_compra_grupo TO authenticated;
GRANT ALL ON public.ordenes_compra_grupo TO service_role;
ALTER TABLE public.ordenes_compra_grupo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Grupo OC lectura" ON public.ordenes_compra_grupo;
CREATE POLICY "Grupo OC lectura" ON public.ordenes_compra_grupo
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Grupo OC escritura admin" ON public.ordenes_compra_grupo;
CREATE POLICY "Grupo OC escritura admin" ON public.ordenes_compra_grupo
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

-- ordenes_compra.grupo_id (columna de enlace hija -> orden madre)
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.ordenes_compra_grupo(id);

CREATE INDEX IF NOT EXISTS idx_ordenes_compra_grupo_id ON public.ordenes_compra(grupo_id);

-- Vista resumen "Por proveedor" que ya usa el frontend (OrdenesCompraPage.tsx)
CREATE OR REPLACE VIEW public.v_ordenes_compra_grupo_resumen AS
SELECT
  g.id, g.folio, g.estado, g.fecha_creacion, g.fecha_envio, g.notas,
  p.nombre AS proveedor_nombre, p.codigo AS proveedor_codigo,
  count(oc.id) AS total_sucursales,
  count(oc.id) FILTER (WHERE oc.estado = 'pendiente_aprobacion') AS pendientes_gerente,
  count(oc.id) FILTER (WHERE oc.estado = 'confirmada_gerente') AS pendientes_admin,
  count(oc.id) FILTER (WHERE oc.estado = ANY (ARRAY['borrador','enviada','confirmada','parcial','recibida'])) AS autorizadas,
  count(oc.id) FILTER (WHERE oc.estado = 'cancelada') AS canceladas,
  COALESCE(sum(oc.total), 0) AS total_consolidado
FROM ordenes_compra_grupo g
JOIN proveedores p ON p.id = g.proveedor_id
LEFT JOIN ordenes_compra oc ON oc.grupo_id = g.id
GROUP BY g.id, g.folio, g.estado, g.fecha_creacion, g.fecha_envio, g.notas, p.nombre, p.codigo;

GRANT SELECT ON public.v_ordenes_compra_grupo_resumen TO authenticated;

-- Trigger: cuando ya no queda ninguna OC hija pendiente de gerente/admin, el grupo pasa a "lista_para_enviar"
CREATE OR REPLACE FUNCTION public.sync_estado_grupo_oc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pendientes integer;
BEGIN
  IF NEW.grupo_id IS NOT NULL AND (OLD.estado IS DISTINCT FROM NEW.estado) THEN
    SELECT COUNT(*) INTO v_pendientes FROM ordenes_compra
    WHERE grupo_id = NEW.grupo_id AND estado IN ('pendiente_aprobacion','confirmada_gerente');
    IF v_pendientes = 0 THEN
      UPDATE ordenes_compra_grupo SET estado = 'lista_para_enviar', updated_at = now()
      WHERE id = NEW.grupo_id AND estado = 'en_revision';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_estado_grupo_oc ON public.ordenes_compra;
CREATE TRIGGER trg_sync_estado_grupo_oc
  AFTER UPDATE OF estado ON public.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION public.sync_estado_grupo_oc();

-- Envío al proveedor de todo el grupo (botón "Enviar al proveedor" en la pestaña Por proveedor)
CREATE OR REPLACE FUNCTION public.enviar_grupo_a_proveedor(p_grupo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_grupo record;
  v_pendientes integer;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Solo administración puede enviar la orden al proveedor';
  END IF;
  SELECT * INTO v_grupo FROM ordenes_compra_grupo WHERE id = p_grupo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Grupo de OC no encontrado'; END IF;

  SELECT COUNT(*) INTO v_pendientes FROM ordenes_compra
  WHERE grupo_id = p_grupo_id AND estado NOT IN ('borrador','enviada','confirmada','parcial','recibida');
  IF v_pendientes > 0 THEN
    RAISE EXCEPTION 'Aún hay % sucursal(es) sin autorizar en este grupo', v_pendientes;
  END IF;

  UPDATE ordenes_compra_grupo SET estado = 'enviada', fecha_envio = CURRENT_DATE, updated_at = now() WHERE id = p_grupo_id;
  UPDATE ordenes_compra SET estado = 'enviada', fecha_envio = CURRENT_DATE, enviada_por = auth.uid()
  WHERE grupo_id = p_grupo_id AND estado = 'borrador';

  RETURN jsonb_build_object('estado', 'enviada');
END;
$$;

-- Helper de permisos: ¿este usuario es gerente/subgerente de esta sucursal?
CREATE OR REPLACE FUNCTION public.es_gerente_de_sucursal(p_user_id uuid, p_sucursal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_sucursal_asignacion
    WHERE user_id = p_user_id AND sucursal_id = p_sucursal_id
  );
$$;

-- Recepción de mercancía (botón "Recibir mercancía")
CREATE OR REPLACE FUNCTION public.recibir_oc(p_orden_id uuid, p_recepciones jsonb, p_almacen_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item jsonb; v_linea record; v_cant int; v_lote_id uuid; v_estado text;
  v_total_sol int; v_total_rec int; v_user uuid := auth.uid();
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_recepciones) LOOP
    v_cant := (v_item->>'cantidad')::int;
    IF v_cant <= 0 THEN CONTINUE; END IF;
    SELECT ocl.* INTO v_linea FROM orden_compra_lineas ocl
     WHERE ocl.id = (v_item->>'linea_id')::uuid AND ocl.orden_id = p_orden_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE orden_compra_lineas SET cantidad_recibida = cantidad_recibida + v_cant WHERE id = v_linea.id;

    INSERT INTO lotes (producto_id, numero_lote, costo_unitario, fecha_recepcion)
    VALUES (v_linea.producto_id,
            'OC-'||SUBSTRING(p_orden_id::text,1,8)||'-'||to_char(now(),'YYYYMMDDHH24MISS'),
            v_linea.precio_unitario, CURRENT_DATE)
    RETURNING id INTO v_lote_id;

    INSERT INTO inventario (almacen_id, lote_id, cantidad) VALUES (p_almacen_id, v_lote_id, v_cant);

    INSERT INTO movimientos_inventario (almacen_id, lote_id, tipo, cantidad, costo_unitario,
      referencia_tipo, referencia_id, usuario_id, notas)
    VALUES (p_almacen_id, v_lote_id, 'entrada', v_cant, v_linea.precio_unitario,
            'orden_compra', p_orden_id, v_user, 'Recepción OC');
  END LOOP;

  SELECT COALESCE(SUM(cantidad_solicitada),0), COALESCE(SUM(cantidad_recibida),0)
    INTO v_total_sol, v_total_rec
  FROM orden_compra_lineas WHERE orden_id = p_orden_id;

  v_estado := CASE
    WHEN v_total_rec = 0 THEN 'enviada'
    WHEN v_total_rec >= v_total_sol THEN 'recibida'
    ELSE 'parcial' END;

  UPDATE ordenes_compra
     SET estado = v_estado,
         fecha_recepcion_real = CASE WHEN v_estado='recibida' THEN CURRENT_DATE ELSE fecha_recepcion_real END,
         recibida_por = v_user
   WHERE id = p_orden_id;

  RETURN jsonb_build_object('estado', v_estado, 'solicitado', v_total_sol, 'recibido', v_total_rec);
END;
$$;

-- ---------------------------------------------------------
-- PARTE 2: correcciones y trazabilidad nuevas (29-jul-2026)
-- ---------------------------------------------------------

ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS autorizada_por uuid,
  ADD COLUMN IF NOT EXISTS fecha_autorizacion timestamptz,
  ADD COLUMN IF NOT EXISTS cantidades_modificadas_gerente boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.orden_compra_lineas_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  linea_id uuid NOT NULL REFERENCES public.orden_compra_lineas(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  cantidad_anterior integer NOT NULL,
  cantidad_nueva integer NOT NULL,
  ajustado_por uuid,
  ajustado_en timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.orden_compra_lineas_ajustes TO authenticated;
GRANT ALL ON public.orden_compra_lineas_ajustes TO service_role;
ALTER TABLE public.orden_compra_lineas_ajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ajustes OC lectura" ON public.orden_compra_lineas_ajustes;
CREATE POLICY "Ajustes OC lectura" ON public.orden_compra_lineas_ajustes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Ajustes OC escritura" ON public.orden_compra_lineas_ajustes;
CREATE POLICY "Ajustes OC escritura" ON public.orden_compra_lineas_ajustes
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role)
  );

DROP VIEW IF EXISTS public.v_ordenes_compra_trazabilidad;
CREATE VIEW public.v_ordenes_compra_trazabilidad
WITH (security_invoker = true) AS
SELECT
  oc.id, oc.folio, oc.grupo_id, oc.estado,
  oc.proveedor_id, pr.nombre AS proveedor_nombre,
  oc.sucursal_destino_id, s.nombre AS sucursal_nombre, s.codigo AS sucursal_codigo,
  oc.creada_por, COALESCE(pc.nombre, pc.username) AS creada_por_nombre, oc.fecha_creacion,
  oc.aprobada_por AS revisada_por_gerente, COALESCE(pg.nombre, pg.username) AS revisada_por_gerente_nombre,
  oc.fecha_aprobacion AS fecha_revision_gerente,
  oc.cantidades_modificadas_gerente,
  oc.razon_aprobacion,
  oc.autorizada_por, COALESCE(pa.nombre, pa.username) AS autorizada_por_nombre, oc.fecha_autorizacion,
  oc.enviada_por, oc.fecha_envio,
  oc.recibida_por, oc.fecha_recepcion_real,
  oc.total,
  (SELECT count(*) FROM orden_compra_lineas_ajustes a WHERE a.orden_id = oc.id) AS num_ajustes
FROM ordenes_compra oc
LEFT JOIN proveedores pr ON pr.id = oc.proveedor_id
LEFT JOIN sucursales s ON s.id = oc.sucursal_destino_id
LEFT JOIN profiles pc ON pc.id = oc.creada_por
LEFT JOIN profiles pg ON pg.id = oc.aprobada_por
LEFT JOIN profiles pa ON pa.id = oc.autorizada_por;

GRANT SELECT ON public.v_ordenes_compra_trazabilidad TO authenticated;

-- cotizador_generar_oc: ahora sí crea el grupo (entrega_por_sucursal=true) y arranca en
-- 'pendiente_aprobacion' en vez de 'borrador' en ambos casos.
CREATE OR REPLACE FUNCTION public.cotizador_generar_oc(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prov proveedores%ROWTYPE;
  v_folio_ref text := payload->>'folio_cotizacion';
  v_ordenes jsonb := '[]'::jsonb;
  v_by_sucursal boolean;
  v_orden_id uuid;
  v_orden_madre_id uuid;
  v_grupo_id uuid;
  v_folio_grupo text;
  v_subtotal numeric; v_iva numeric; v_total numeric; v_ahorro numeric;
  r record; r2 record;
  v_suc_nombre text; v_suc_codigo text;
  v_piezas integer; v_lineas_count integer;
  v_titulo text; v_mensaje text;
BEGIN
  IF NOT (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
       OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'compras'::app_role)) THEN
    RAISE EXCEPTION 'Sin permiso para generar OC';
  END IF;

  SELECT * INTO v_prov FROM proveedores WHERE id = (payload->>'proveedor_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor no encontrado'; END IF;
  v_by_sucursal := COALESCE(v_prov.entrega_por_sucursal, false);

  IF v_by_sucursal THEN
    v_folio_grupo := 'OCG-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,4);
    INSERT INTO ordenes_compra_grupo (folio, proveedor_id, estado, creada_por)
    VALUES (v_folio_grupo, v_prov.id, 'en_revision', auth.uid())
    RETURNING id INTO v_grupo_id;

    FOR r IN
      SELECT (l->>'sucursal_id')::uuid AS sucursal_id, jsonb_agg(l) AS lineas
      FROM jsonb_array_elements(payload->'lineas') l
      WHERE (l->>'cantidad')::int > 0
      GROUP BY (l->>'sucursal_id')::uuid
    LOOP
      INSERT INTO ordenes_compra (proveedor_id, sucursal_destino_id, estado, folio_cotizacion_ref, creada_por, grupo_id)
      VALUES (v_prov.id, r.sucursal_id, 'pendiente_aprobacion', v_folio_ref, auth.uid(), v_grupo_id)
      RETURNING id INTO v_orden_id;

      INSERT INTO orden_compra_lineas (orden_id, producto_id, cantidad_solicitada, precio_unitario, precio_con_iva)
      SELECT v_orden_id, (l->>'producto_id')::uuid, (l->>'cantidad')::int,
             (l->>'precio_unitario')::numeric, (l->>'precio_con_iva')::numeric
      FROM jsonb_array_elements(r.lineas) l;

      SELECT COALESCE(SUM(subtotal),0), COALESCE(SUM((precio_con_iva - precio_unitario) * cantidad_solicitada),0)
        INTO v_subtotal, v_iva
      FROM orden_compra_lineas WHERE orden_id = v_orden_id;
      v_total := v_subtotal + v_iva;

      SELECT COALESCE(SUM((uc.costo_unitario - ocl.precio_unitario) * ocl.cantidad_solicitada), 0)
        INTO v_ahorro
      FROM orden_compra_lineas ocl
      LEFT JOIN LATERAL (
        SELECT costo_unitario FROM lotes WHERE producto_id = ocl.producto_id ORDER BY created_at DESC LIMIT 1
      ) uc ON true
      WHERE ocl.orden_id = v_orden_id;

      UPDATE ordenes_compra SET subtotal = v_subtotal, iva = v_iva, total = v_total, ahorro_estimado = v_ahorro WHERE id = v_orden_id;

      INSERT INTO ordenes_compra_transito (orden_id, producto_id, sucursal_id, proveedor_id, cantidad)
      SELECT v_orden_id, (l->>'producto_id')::uuid, r.sucursal_id, v_prov.id, (l->>'cantidad')::int
      FROM jsonb_array_elements(r.lineas) l;

      SELECT nombre, codigo INTO v_suc_nombre, v_suc_codigo FROM sucursales WHERE id = r.sucursal_id;
      SELECT count(*), COALESCE(SUM(cantidad_solicitada),0) INTO v_lineas_count, v_piezas
        FROM orden_compra_lineas WHERE orden_id = v_orden_id;

      v_titulo := 'Orden de compra: ' || v_prov.nombre || ' → ' || COALESCE(v_suc_nombre, 'sucursal');
      v_mensaje := v_lineas_count || ' producto(s) · ' || v_piezas || ' pieza(s) · Total $' || to_char(v_total, 'FM999,999,990.00')
                   || ' — Folio ' || v_folio_ref || '. Para revisar y confirmar.';
      INSERT INTO notificaciones (sucursal_id, tipo, severidad, titulo, mensaje, referencia_tipo, referencia_id)
      VALUES (r.sucursal_id, 'oc_generada', 'info', v_titulo, v_mensaje, 'orden_compra', v_orden_id);

      v_ordenes := v_ordenes || jsonb_build_array(jsonb_build_object('orden_id', v_orden_id, 'sucursal_id', r.sucursal_id));
    END LOOP;

  ELSE
    INSERT INTO ordenes_compra (proveedor_id, estado, folio_cotizacion_ref, creada_por)
    VALUES (v_prov.id, 'pendiente_aprobacion', v_folio_ref, auth.uid())
    RETURNING id INTO v_orden_id;
    v_orden_madre_id := v_orden_id;

    INSERT INTO orden_compra_lineas (orden_id, producto_id, cantidad_solicitada, precio_unitario, precio_con_iva)
    SELECT v_orden_id, (l->>'producto_id')::uuid,
      SUM((l->>'cantidad')::int)::int,
      MAX((l->>'precio_unitario')::numeric), MAX((l->>'precio_con_iva')::numeric)
    FROM jsonb_array_elements(payload->'lineas') l
    WHERE (l->>'cantidad')::int > 0
    GROUP BY (l->>'producto_id')::uuid;

    SELECT COALESCE(SUM(subtotal),0), COALESCE(SUM((precio_con_iva - precio_unitario) * cantidad_solicitada),0)
      INTO v_subtotal, v_iva
    FROM orden_compra_lineas WHERE orden_id = v_orden_id;
    v_total := v_subtotal + v_iva;

    SELECT COALESCE(SUM((uc.costo_unitario - ocl.precio_unitario) * ocl.cantidad_solicitada), 0)
      INTO v_ahorro
    FROM orden_compra_lineas ocl
    LEFT JOIN LATERAL (
      SELECT costo_unitario FROM lotes WHERE producto_id = ocl.producto_id ORDER BY created_at DESC LIMIT 1
    ) uc ON true
    WHERE ocl.orden_id = v_orden_id;

    UPDATE ordenes_compra SET subtotal = v_subtotal, iva = v_iva, total = v_total, ahorro_estimado = v_ahorro WHERE id = v_orden_id;

    INSERT INTO ordenes_compra_transito (orden_id, producto_id, sucursal_id, proveedor_id, cantidad)
    SELECT v_orden_id, (l->>'producto_id')::uuid, (l->>'sucursal_id')::uuid, v_prov.id, (l->>'cantidad')::int
    FROM jsonb_array_elements(payload->'lineas') l
    WHERE (l->>'cantidad')::int > 0 AND (l->>'sucursal_id') IS NOT NULL;

    FOR r2 IN
      SELECT (l->>'sucursal_id')::uuid AS sucursal_id,
             count(*) AS n_lineas,
             SUM((l->>'cantidad')::int) AS piezas,
             SUM((l->>'cantidad')::int * (l->>'precio_con_iva')::numeric) AS monto
      FROM jsonb_array_elements(payload->'lineas') l
      WHERE (l->>'cantidad')::int > 0 AND (l->>'sucursal_id') IS NOT NULL
      GROUP BY (l->>'sucursal_id')::uuid
    LOOP
      SELECT nombre, codigo INTO v_suc_nombre, v_suc_codigo FROM sucursales WHERE id = r2.sucursal_id;
      v_titulo := 'Reparto de compra: ' || v_prov.nombre || ' → ' || COALESCE(v_suc_nombre, 'sucursal');
      v_mensaje := 'Te corresponden ' || r2.n_lineas || ' producto(s) · ' || r2.piezas || ' pieza(s) · $'
                   || to_char(r2.monto, 'FM999,999,990.00') || ' de la orden madre ' || v_folio_ref
                   || ' (entrega centralizada, redistribución interna). Solo informativo.';
      INSERT INTO notificaciones (sucursal_id, tipo, severidad, titulo, mensaje, referencia_tipo, referencia_id)
      VALUES (r2.sucursal_id, 'oc_reparto_informativo', 'info', v_titulo, v_mensaje, 'orden_compra', v_orden_madre_id);
    END LOOP;

    v_titulo := 'Orden madre generada: ' || v_prov.nombre;
    v_mensaje := 'Folio ' || v_folio_ref || ' · Total $' || to_char(v_total, 'FM999,999,990.00')
                 || ' · Ahorro estimado $' || to_char(v_ahorro, 'FM999,999,990.00') || '.';
    INSERT INTO notificaciones (sucursal_id, tipo, severidad, titulo, mensaje, referencia_tipo, referencia_id)
    VALUES (NULL, 'oc_generada', 'info', v_titulo, v_mensaje, 'orden_compra', v_orden_id);

    v_ordenes := jsonb_build_array(jsonb_build_object('orden_id', v_orden_id));
  END IF;

  RETURN jsonb_build_object('ordenes', v_ordenes, 'grupo_id', v_grupo_id);
END;
$$;

-- revisar_oc_gerente: ya no toca la columna generada 'subtotal' (antes tronaba al editar
-- cantidades), registra cada ajuste en orden_compra_lineas_ajustes, marca
-- cantidades_modificadas_gerente, y usa el IVA real por producto.
CREATE OR REPLACE FUNCTION public.revisar_oc_gerente(p_oc_id uuid, p_accion text, p_lineas jsonb DEFAULT NULL::jsonb, p_razon text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_oc record;
  v_item jsonb;
  v_es_autorizado boolean;
  v_cant_anterior integer;
  v_cant_nueva integer;
  v_linea_id uuid;
  v_producto_id uuid;
  v_hubo_cambios boolean := false;
  v_subtotal numeric;
  v_iva numeric;
BEGIN
  SELECT * INTO v_oc FROM ordenes_compra WHERE id = p_oc_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  IF v_oc.estado <> 'pendiente_aprobacion' THEN
    RAISE EXCEPTION 'Esta orden ya no está pendiente de revisión (estado actual: %)', v_oc.estado;
  END IF;

  v_es_autorizado :=
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    (
      (has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'subgerente'::app_role))
      AND es_gerente_de_sucursal(auth.uid(), v_oc.sucursal_destino_id)
    );

  IF NOT v_es_autorizado THEN
    RAISE EXCEPTION 'Solo el gerente de la sucursal destino (o administración) puede revisar esta orden';
  END IF;

  IF p_accion = 'rechazar' THEN
    UPDATE ordenes_compra SET
      estado = 'cancelada',
      aprobada_por = auth.uid(),
      fecha_aprobacion = now(),
      razon_aprobacion = COALESCE(p_razon, 'Rechazada por gerente de sucursal')
    WHERE id = p_oc_id;
    RETURN jsonb_build_object('estado', 'cancelada');

  ELSIF p_accion = 'confirmar' THEN
    IF p_lineas IS NOT NULL THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
        v_linea_id := (v_item->>'linea_id')::uuid;
        v_cant_nueva := (v_item->>'cantidad_solicitada')::integer;

        SELECT cantidad_solicitada, producto_id INTO v_cant_anterior, v_producto_id
        FROM orden_compra_lineas WHERE id = v_linea_id AND orden_id = p_oc_id;

        IF FOUND AND v_cant_anterior IS DISTINCT FROM v_cant_nueva THEN
          -- 'subtotal' es GENERATED ALWAYS (cantidad_solicitada * precio_unitario): nunca se
          -- escribe a mano, Postgres la recalcula sola al actualizar cantidad_solicitada.
          UPDATE orden_compra_lineas
          SET cantidad_solicitada = v_cant_nueva
          WHERE id = v_linea_id AND orden_id = p_oc_id;

          INSERT INTO orden_compra_lineas_ajustes (orden_id, linea_id, producto_id, cantidad_anterior, cantidad_nueva, ajustado_por)
          VALUES (p_oc_id, v_linea_id, v_producto_id, v_cant_anterior, v_cant_nueva, auth.uid());

          v_hubo_cambios := true;
        END IF;
      END LOOP;

      IF v_hubo_cambios THEN
        SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
        FROM orden_compra_lineas WHERE orden_id = p_oc_id;

        SELECT COALESCE(SUM(ocl.subtotal * (COALESCE(p.iva_tasa, 16) / 100.0)), 0) INTO v_iva
        FROM orden_compra_lineas ocl
        JOIN productos p ON p.id = ocl.producto_id
        WHERE ocl.orden_id = p_oc_id;

        UPDATE ordenes_compra SET
          subtotal = v_subtotal,
          iva = v_iva,
          total = v_subtotal + v_iva,
          cantidades_modificadas_gerente = true
        WHERE id = p_oc_id;
      END IF;
    END IF;

    UPDATE ordenes_compra SET
      estado = 'confirmada_gerente',
      aprobada_por = auth.uid(),
      fecha_aprobacion = now(),
      razon_aprobacion = COALESCE(p_razon, 'Confirmada por gerente de sucursal')
    WHERE id = p_oc_id;
    RETURN jsonb_build_object('estado', 'confirmada_gerente');
  ELSE
    RAISE EXCEPTION 'Acción inválida: %', p_accion;
  END IF;
END;
$$;

-- autorizar_oc_admin: ahora sí registra quién autorizó y cuándo (antes solo se sabía si RECHAZABA)
CREATE OR REPLACE FUNCTION public.autorizar_oc_admin(p_oc_id uuid, p_accion text, p_razon text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    UPDATE ordenes_compra SET
      estado = 'borrador',
      autorizada_por = auth.uid(),
      fecha_autorizacion = now()
    WHERE id = p_oc_id;
    RETURN jsonb_build_object('estado', 'borrador');
  ELSIF p_accion = 'rechazar' THEN
    UPDATE ordenes_compra SET
      estado = 'cancelada',
      razon_aprobacion = COALESCE(p_razon, 'Rechazada en autorización final')
    WHERE id = p_oc_id;
    RETURN jsonb_build_object('estado', 'cancelada');
  ELSE
    RAISE EXCEPTION 'Acción inválida: %', p_accion;
  END IF;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generar_ordenes_compra_desde_cotizador') THEN
    COMMENT ON FUNCTION public.generar_ordenes_compra_desde_cotizador(jsonb) IS
      'OBSOLETA — no usada por el frontend (revisado 2026-07-29). El flujo real vive en cotizador_generar_oc, que ya crea el grupo y respeta entrega_por_sucursal. Se deja sin borrar por si algo externo la referencia; no usar para nuevo desarrollo.';
  END IF;
END $$;
