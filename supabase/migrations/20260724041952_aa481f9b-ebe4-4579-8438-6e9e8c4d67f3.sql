
-- =========================================================
-- FASE 1 + 2: Modelo de datos y motor del Cotizador Sanamex
-- =========================================================

-- 1. Extender proveedores
ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS entrega_por_sucursal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dias_entrega integer,
  ADD COLUMN IF NOT EXISTS frecuencia_listas text,
  ADD COLUMN IF NOT EXISTS tiene_lista_regular boolean NOT NULL DEFAULT true;

-- 2. Producto: marcar los que se compran "sin lista"
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS sin_lista_regular boolean NOT NULL DEFAULT false;

-- 3. Órdenes de compra: referencia a la corrida del cotizador
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS folio_cotizacion_ref text;

-- 4. Mapeo de columnas por proveedor
CREATE TABLE IF NOT EXISTS public.cotizador_mapeo_columnas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  nombre_hoja text,
  fila_encabezado integer NOT NULL DEFAULT 1,
  col_codigo_barras text,
  col_sku text,
  col_descripcion text,
  col_precio text,
  col_precio_con_iva text,
  col_cantidad text,
  iva_incluido_default boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proveedor_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizador_mapeo_columnas TO authenticated;
GRANT ALL ON public.cotizador_mapeo_columnas TO service_role;
ALTER TABLE public.cotizador_mapeo_columnas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Compras leen mapeos" ON public.cotizador_mapeo_columnas
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
  );

CREATE POLICY "Compras editan mapeos" ON public.cotizador_mapeo_columnas
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
  );

-- 5. Tránsito por producto × sucursal
CREATE TABLE IF NOT EXISTS public.ordenes_compra_transito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,
  cantidad integer NOT NULL,
  cerrado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oct_producto_sucursal ON public.ordenes_compra_transito(producto_id, sucursal_id) WHERE cerrado = false;
CREATE INDEX IF NOT EXISTS idx_oct_orden ON public.ordenes_compra_transito(orden_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes_compra_transito TO authenticated;
GRANT ALL ON public.ordenes_compra_transito TO service_role;
ALTER TABLE public.ordenes_compra_transito ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Compras leen tránsito" ON public.ordenes_compra_transito
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
    OR has_role(auth.uid(),'almacen'::app_role)
    OR has_role(auth.uid(),'contabilidad'::app_role)
  );

CREATE POLICY "Compras editan tránsito" ON public.ordenes_compra_transito
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
  );

CREATE OR REPLACE FUNCTION public.oc_cerrar_transito()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado IN ('recibida','cancelada','cerrada') AND
     (OLD.estado IS DISTINCT FROM NEW.estado) THEN
    UPDATE public.ordenes_compra_transito
       SET cerrado = true, updated_at = now()
     WHERE orden_id = NEW.id AND cerrado = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oc_cerrar_transito ON public.ordenes_compra;
CREATE TRIGGER trg_oc_cerrar_transito
  AFTER UPDATE OF estado ON public.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION public.oc_cerrar_transito();

-- 6. Parámetros del cotizador (tabla dedicada key/value)
CREATE TABLE IF NOT EXISTS public.cotizador_params (
  parametro text PRIMARY KEY,
  valor numeric NOT NULL,
  descripcion text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cotizador_params TO authenticated;
GRANT ALL ON public.cotizador_params TO service_role;
ALTER TABLE public.cotizador_params ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos leen params" ON public.cotizador_params
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin edita params" ON public.cotizador_params
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role));

INSERT INTO public.cotizador_params (parametro, valor, descripcion) VALUES
  ('peso_precio', 0.4, 'Peso del precio en el ranking de postor (0-1)'),
  ('peso_entrega', 0.6, 'Peso del tiempo de entrega en el ranking (0-1)'),
  ('factor_abc', 1.3, 'Multiplicador de necesidad para clasificación A/B/C (30-45 d)'),
  ('divisor_otros', 1.25, 'Divisor de necesidad para no-ABC (20-30 d)'),
  ('dias_ventana', 30, 'Ventana en días para ult30')
ON CONFLICT (parametro) DO NOTHING;

-- 7. Vistas de ventas
CREATE OR REPLACE VIEW public.v_ventas_30d AS
SELECT
  vl.producto_id, v.sucursal_id,
  SUM(vl.cantidad)::numeric AS unidades,
  SUM(CASE WHEN v.fecha::date = (CURRENT_DATE - INTERVAL '1 day')::date THEN vl.cantidad ELSE 0 END)::numeric AS unidades_dia_anterior
FROM public.venta_lineas vl
JOIN public.ventas v ON v.id = vl.venta_id
WHERE v.fecha >= (now() - INTERVAL '30 days') AND v.estado = 'completada'
GROUP BY vl.producto_id, v.sucursal_id;

CREATE OR REPLACE VIEW public.v_ventas_historico_mensual AS
SELECT
  vl.producto_id, v.sucursal_id,
  date_trunc('month', v.fecha)::date AS mes,
  SUM(vl.cantidad)::numeric AS unidades
FROM public.venta_lineas vl
JOIN public.ventas v ON v.id = vl.venta_id
WHERE v.fecha >= (now() - INTERVAL '13 months') AND v.estado = 'completada'
GROUP BY vl.producto_id, v.sucursal_id, date_trunc('month', v.fecha);

CREATE OR REPLACE VIEW public.v_existencia_producto_sucursal AS
SELECT l.producto_id, a.sucursal_id, SUM(i.cantidad)::integer AS existencia
FROM public.inventario i
JOIN public.almacenes a ON a.id = i.almacen_id
JOIN public.lotes l ON l.id = i.lote_id
GROUP BY l.producto_id, a.sucursal_id;

CREATE OR REPLACE VIEW public.v_transito_abierto AS
SELECT producto_id, sucursal_id, SUM(cantidad)::integer AS piezas_transito
FROM public.ordenes_compra_transito
WHERE cerrado = false
GROUP BY producto_id, sucursal_id;

-- 8. RPC: cotizador_snapshot
CREATE OR REPLACE FUNCTION public.cotizador_snapshot(
  p_incluir_sin_lista boolean DEFAULT false,
  p_excluir_estatus_e boolean DEFAULT true,
  p_solo_con_faltante boolean DEFAULT false,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_factor_abc numeric := 1.3;
  v_divisor numeric := 1.25;
  v_peso_precio numeric := 0.4;
  v_peso_entrega numeric := 0.6;
  v_result jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'compras'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sin permiso para el cotizador';
  END IF;

  SELECT valor INTO v_factor_abc   FROM cotizador_params WHERE parametro='factor_abc';
  SELECT valor INTO v_divisor      FROM cotizador_params WHERE parametro='divisor_otros';
  SELECT valor INTO v_peso_precio  FROM cotizador_params WHERE parametro='peso_precio';
  SELECT valor INTO v_peso_entrega FROM cotizador_params WHERE parametro='peso_entrega';

  WITH prods AS (
    SELECT p.*
    FROM productos p
    WHERE p.activo = true
      AND (NOT p_excluir_estatus_e OR COALESCE(p.estatus,'') <> 'E')
      AND (p_incluir_sin_lista OR p.sin_lista_regular = false)
      AND (p_search IS NULL OR (
        p.sku ILIKE '%'||p_search||'%'
        OR p.nombre ILIKE '%'||p_search||'%'
        OR COALESCE(p.codigo_barras,'') ILIKE '%'||p_search||'%'
      ))
    ORDER BY p.nombre
    LIMIT p_limit OFFSET p_offset
  ),
  suc AS (SELECT id, codigo, nombre, es_cedis FROM sucursales WHERE activo = true),
  exist AS (
    SELECT e.producto_id, e.sucursal_id, e.existencia FROM v_existencia_producto_sucursal e
    WHERE e.producto_id IN (SELECT id FROM prods)
  ),
  ventas30 AS (
    SELECT v.producto_id, v.sucursal_id, v.unidades, v.unidades_dia_anterior FROM v_ventas_30d v
    WHERE v.producto_id IN (SELECT id FROM prods)
  ),
  transito AS (
    SELECT t.producto_id, t.sucursal_id, t.piezas_transito FROM v_transito_abierto t
    WHERE t.producto_id IN (SELECT id FROM prods)
  ),
  precios AS (
    SELECT
      lpp.producto_id, lpp.proveedor_id,
      COALESCE(lpp.precio_con_iva, lpp.precio) AS precio_cmp,
      lpp.existencia_proveedor,
      pr.nombre AS proveedor_nombre,
      COALESCE(pr.dias_entrega, 99) AS dias_entrega,
      pr.entrega_por_sucursal
    FROM lista_precio_proveedor lpp
    JOIN proveedores pr ON pr.id = lpp.proveedor_id
    WHERE lpp.activo = true
      AND lpp.producto_id IN (SELECT id FROM prods)
      AND lpp.existencia_proveedor > 0
      AND pr.tiene_lista_regular = true
      AND pr.activo = true
      AND (lpp.fecha_vigencia_hasta IS NULL OR lpp.fecha_vigencia_hasta >= CURRENT_DATE)
  ),
  precios_score AS (
    SELECT p.*,
      MIN(precio_cmp) OVER (PARTITION BY producto_id) AS min_precio,
      MAX(precio_cmp) OVER (PARTITION BY producto_id) AS max_precio,
      MIN(dias_entrega) OVER (PARTITION BY producto_id) AS min_dias,
      MAX(dias_entrega) OVER (PARTITION BY producto_id) AS max_dias,
      row_number() OVER (
        PARTITION BY producto_id
        ORDER BY (
          v_peso_precio * (CASE WHEN MAX(precio_cmp) OVER (PARTITION BY producto_id) = MIN(precio_cmp) OVER (PARTITION BY producto_id) THEN 0
            ELSE (precio_cmp - MIN(precio_cmp) OVER (PARTITION BY producto_id))
                 / NULLIF(MAX(precio_cmp) OVER (PARTITION BY producto_id) - MIN(precio_cmp) OVER (PARTITION BY producto_id), 0) END)
          + v_peso_entrega * (CASE WHEN MAX(dias_entrega) OVER (PARTITION BY producto_id) = MIN(dias_entrega) OVER (PARTITION BY producto_id) THEN 0
            ELSE (dias_entrega - MIN(dias_entrega) OVER (PARTITION BY producto_id))::numeric
                 / NULLIF(MAX(dias_entrega) OVER (PARTITION BY producto_id) - MIN(dias_entrega) OVER (PARTITION BY producto_id), 0) END)
        ) ASC, precio_cmp ASC
      ) AS rank
    FROM precios p
  ),
  ultimo_costo AS (
    SELECT DISTINCT ON (l.producto_id) l.producto_id, l.costo_unitario, l.created_at
    FROM lotes l
    WHERE l.producto_id IN (SELECT id FROM prods)
    ORDER BY l.producto_id, l.created_at DESC
  ),
  producto_agg AS (
    SELECT
      p.id AS producto_id,
      p.sku, p.nombre, p.descripcion, p.codigo_barras,
      p.clasificacion, p.estatus, p.iva_tasa, p.ieps, p.iva_incluido,
      p.sin_lista_regular,
      COALESCE((SELECT SUM(existencia) FROM exist e2 WHERE e2.producto_id = p.id), 0)::integer AS exist_sucursales,
      COALESCE((SELECT SUM(i.cantidad) FROM inventario i JOIN lotes l ON l.id=i.lote_id WHERE l.producto_id=p.id), 0)::integer AS exist_total,
      COALESCE((SELECT SUM(unidades) FROM ventas30 v2 WHERE v2.producto_id=p.id), 0)::numeric AS ult30_total,
      COALESCE((SELECT SUM(unidades_dia_anterior) FROM ventas30 v3 WHERE v3.producto_id=p.id), 0)::numeric AS venta_dia_anterior,
      (SELECT costo_unitario FROM ultimo_costo uc WHERE uc.producto_id = p.id) AS ultimo_precio_compra,
      (SELECT jsonb_build_object('proveedor_id', ps.proveedor_id, 'proveedor_nombre', ps.proveedor_nombre,
          'precio', ps.precio_cmp, 'existencia', ps.existencia_proveedor,
          'dias_entrega', ps.dias_entrega, 'entrega_por_sucursal', ps.entrega_por_sucursal)
       FROM precios_score ps WHERE ps.producto_id = p.id AND ps.rank = 1) AS ganador,
      (SELECT jsonb_build_object('proveedor_id', ps.proveedor_id, 'proveedor_nombre', ps.proveedor_nombre,
          'precio', ps.precio_cmp, 'existencia', ps.existencia_proveedor, 'dias_entrega', ps.dias_entrega)
       FROM precios_score ps WHERE ps.producto_id = p.id AND ps.rank = 2) AS postor_2,
      (SELECT jsonb_build_object('proveedor_id', ps.proveedor_id, 'proveedor_nombre', ps.proveedor_nombre,
          'precio', ps.precio_cmp, 'existencia', ps.existencia_proveedor, 'dias_entrega', ps.dias_entrega)
       FROM precios_score ps WHERE ps.producto_id = p.id AND ps.rank = 3) AS postor_3
    FROM prods p
  )
  SELECT jsonb_build_object(
    'sucursales', (SELECT jsonb_agg(jsonb_build_object('id', id, 'codigo', codigo, 'nombre', nombre, 'es_cedis', es_cedis) ORDER BY codigo) FROM suc),
    'productos', (
      SELECT COALESCE(jsonb_agg(fila ORDER BY (fila->>'nombre')), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'producto_id', pa.producto_id,
          'sku', pa.sku, 'nombre', pa.nombre, 'descripcion', pa.descripcion,
          'codigo_barras', pa.codigo_barras, 'clasificacion', pa.clasificacion,
          'estatus', pa.estatus, 'iva_tasa', pa.iva_tasa, 'ieps', pa.ieps,
          'iva_incluido', pa.iva_incluido, 'sin_lista_regular', pa.sin_lista_regular,
          'exist_total', pa.exist_total, 'exist_sucursales', pa.exist_sucursales,
          'transito_global', GREATEST(pa.exist_total - pa.exist_sucursales, 0),
          'ult30_total', pa.ult30_total,
          'ddi', CASE WHEN pa.ult30_total > 0 THEN ROUND(pa.exist_total::numeric / pa.ult30_total * 30, 1) ELSE NULL END,
          'venta_dia_anterior', pa.venta_dia_anterior,
          'ultimo_precio_compra', pa.ultimo_precio_compra,
          'mejor_precio', (pa.ganador->>'precio')::numeric,
          'variacion_precio_abs', COALESCE((pa.ganador->>'precio')::numeric - pa.ultimo_precio_compra, 0),
          'variacion_precio_pct', CASE WHEN pa.ultimo_precio_compra IS NULL OR pa.ultimo_precio_compra = 0 THEN NULL
             ELSE ROUND(((pa.ganador->>'precio')::numeric - pa.ultimo_precio_compra) / pa.ultimo_precio_compra * 100, 2) END,
          'ganador', pa.ganador, 'postor_2', pa.postor_2, 'postor_3', pa.postor_3,
          'piezas_corrugado', (SELECT piezas_por_corrugado FROM producto_corrugado c
             WHERE c.producto_id=pa.producto_id AND c.proveedor_id = (pa.ganador->>'proveedor_id')::uuid LIMIT 1),
          'alerta_oferta', EXISTS (
            SELECT 1 FROM ofertas_proveedor o
            WHERE o.producto_id = pa.producto_id AND o.activo = true
              AND CURRENT_DATE BETWEEN o.fecha_inicio AND COALESCE(o.fecha_fin, CURRENT_DATE)
              AND (pa.ganador->>'precio')::numeric > o.precio_oferta),
          'sucursales', (
            SELECT jsonb_object_agg(s.codigo, jsonb_build_object(
              'sucursal_id', s.id,
              'existencia', COALESCE((SELECT existencia FROM exist e WHERE e.producto_id=pa.producto_id AND e.sucursal_id=s.id), 0),
              'ult30', COALESCE((SELECT unidades FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s.id), 0),
              'transito', COALESCE((SELECT piezas_transito FROM transito t WHERE t.producto_id=pa.producto_id AND t.sucursal_id=s.id), 0),
              'necesidad', ROUND(
                CASE WHEN pa.clasificacion IN ('A','B','C')
                     THEN COALESCE((SELECT unidades FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s.id),0) * v_factor_abc
                     ELSE COALESCE((SELECT unidades FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s.id),0) / v_divisor
                END, 0)))
            FROM suc s WHERE s.es_cedis = false)
        ) AS fila
        FROM producto_agg pa
        WHERE (NOT p_solo_con_faltante) OR EXISTS (
          SELECT 1 FROM suc s2 WHERE s2.es_cedis = false
            AND ((CASE WHEN pa.clasificacion IN ('A','B','C')
                 THEN COALESCE((SELECT unidades FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s2.id),0) * v_factor_abc
                 ELSE COALESCE((SELECT unidades FROM ventas30 v WHERE v.producto_id=pa.producto_id AND v.sucursal_id=s2.id),0) / v_divisor END)
                - COALESCE((SELECT existencia FROM exist e WHERE e.producto_id=pa.producto_id AND e.sucursal_id=s2.id),0)) > 0)
      ) sub
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.cotizador_snapshot(boolean,boolean,boolean,text,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.cotizador_snapshot(boolean,boolean,boolean,text,integer,integer) TO authenticated;

-- 9. Historial mensual por producto (bajo demanda)
CREATE OR REPLACE FUNCTION public.cotizador_historial_mensual(p_producto_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('mes', to_char(mes,'YYYY-MM'),
    'sucursal_id', sucursal_id, 'unidades', unidades) ORDER BY mes), '[]'::jsonb)
  FROM v_ventas_historico_mensual WHERE producto_id = p_producto_id;
$$;

REVOKE ALL ON FUNCTION public.cotizador_historial_mensual(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.cotizador_historial_mensual(uuid) TO authenticated;

-- 10. Generar OC desde cotizador
CREATE OR REPLACE FUNCTION public.cotizador_generar_oc(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prov proveedores%ROWTYPE;
  v_folio_ref text := payload->>'folio_cotizacion';
  v_ordenes jsonb := '[]'::jsonb;
  v_by_sucursal boolean;
  v_orden_id uuid;
  v_subtotal numeric; v_iva numeric; v_total numeric;
  r record;
BEGIN
  IF NOT (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
       OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'compras'::app_role)) THEN
    RAISE EXCEPTION 'Sin permiso para generar OC';
  END IF;

  SELECT * INTO v_prov FROM proveedores WHERE id = (payload->>'proveedor_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor no encontrado'; END IF;
  v_by_sucursal := COALESCE(v_prov.entrega_por_sucursal, false);

  IF v_by_sucursal THEN
    FOR r IN
      SELECT (l->>'sucursal_id')::uuid AS sucursal_id, jsonb_agg(l) AS lineas
      FROM jsonb_array_elements(payload->'lineas') l
      WHERE (l->>'cantidad')::int > 0
      GROUP BY (l->>'sucursal_id')::uuid
    LOOP
      INSERT INTO ordenes_compra (proveedor_id, sucursal_destino_id, estado, folio_cotizacion_ref, creada_por)
      VALUES (v_prov.id, r.sucursal_id, 'borrador', v_folio_ref, auth.uid())
      RETURNING id INTO v_orden_id;

      INSERT INTO orden_compra_lineas (orden_id, producto_id, cantidad_solicitada, precio_unitario, precio_con_iva, subtotal)
      SELECT v_orden_id, (l->>'producto_id')::uuid, (l->>'cantidad')::int,
             (l->>'precio_unitario')::numeric, (l->>'precio_con_iva')::numeric,
             (l->>'cantidad')::int * (l->>'precio_unitario')::numeric
      FROM jsonb_array_elements(r.lineas) l;

      SELECT COALESCE(SUM(subtotal),0), COALESCE(SUM((precio_con_iva - precio_unitario) * cantidad_solicitada),0)
        INTO v_subtotal, v_iva
      FROM orden_compra_lineas WHERE orden_id = v_orden_id;
      v_total := v_subtotal + v_iva;
      UPDATE ordenes_compra SET subtotal = v_subtotal, iva = v_iva, total = v_total WHERE id = v_orden_id;

      INSERT INTO ordenes_compra_transito (orden_id, producto_id, sucursal_id, proveedor_id, cantidad)
      SELECT v_orden_id, (l->>'producto_id')::uuid, r.sucursal_id, v_prov.id, (l->>'cantidad')::int
      FROM jsonb_array_elements(r.lineas) l;

      v_ordenes := v_ordenes || jsonb_build_array(jsonb_build_object('orden_id', v_orden_id, 'sucursal_id', r.sucursal_id));
    END LOOP;
  ELSE
    INSERT INTO ordenes_compra (proveedor_id, estado, folio_cotizacion_ref, creada_por)
    VALUES (v_prov.id, 'borrador', v_folio_ref, auth.uid())
    RETURNING id INTO v_orden_id;

    INSERT INTO orden_compra_lineas (orden_id, producto_id, cantidad_solicitada, precio_unitario, precio_con_iva, subtotal)
    SELECT v_orden_id, (l->>'producto_id')::uuid,
      SUM((l->>'cantidad')::int)::int,
      MAX((l->>'precio_unitario')::numeric), MAX((l->>'precio_con_iva')::numeric),
      SUM((l->>'cantidad')::int) * MAX((l->>'precio_unitario')::numeric)
    FROM jsonb_array_elements(payload->'lineas') l
    WHERE (l->>'cantidad')::int > 0
    GROUP BY (l->>'producto_id')::uuid;

    SELECT COALESCE(SUM(subtotal),0), COALESCE(SUM((precio_con_iva - precio_unitario) * cantidad_solicitada),0)
      INTO v_subtotal, v_iva
    FROM orden_compra_lineas WHERE orden_id = v_orden_id;
    v_total := v_subtotal + v_iva;
    UPDATE ordenes_compra SET subtotal = v_subtotal, iva = v_iva, total = v_total WHERE id = v_orden_id;

    INSERT INTO ordenes_compra_transito (orden_id, producto_id, sucursal_id, proveedor_id, cantidad)
    SELECT v_orden_id, (l->>'producto_id')::uuid, (l->>'sucursal_id')::uuid, v_prov.id, (l->>'cantidad')::int
    FROM jsonb_array_elements(payload->'lineas') l
    WHERE (l->>'cantidad')::int > 0 AND (l->>'sucursal_id') IS NOT NULL;

    v_ordenes := jsonb_build_array(jsonb_build_object('orden_id', v_orden_id));
  END IF;
  RETURN jsonb_build_object('ordenes', v_ordenes);
END;
$$;

REVOKE ALL ON FUNCTION public.cotizador_generar_oc(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.cotizador_generar_oc(jsonb) TO authenticated;

-- 11. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_venta_lineas_producto_venta ON public.venta_lineas(producto_id, venta_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_estado_ok ON public.ventas(fecha) WHERE estado = 'completada';
CREATE INDEX IF NOT EXISTS idx_lpp_producto_activo ON public.lista_precio_proveedor(producto_id) WHERE activo = true;
