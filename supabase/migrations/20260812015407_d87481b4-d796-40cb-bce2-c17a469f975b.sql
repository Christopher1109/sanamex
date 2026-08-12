-- ============ 1. Sugerido propuesto por gerente/almacenista de sucursal ============
CREATE TABLE IF NOT EXISTS public.sugeridos_sucursal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  cantidad integer NOT NULL CHECK (cantidad >= 0),
  nota text,
  usuario_id uuid,
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, sucursal_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sugeridos_sucursal TO authenticated;
GRANT ALL ON public.sugeridos_sucursal TO service_role;

ALTER TABLE public.sugeridos_sucursal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sug_suc_select" ON public.sugeridos_sucursal;
CREATE POLICY "sug_suc_select" ON public.sugeridos_sucursal
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
  OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'gerente'::app_role)
  OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen'::app_role)
  OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'supervisor'::app_role)
);

DROP POLICY IF EXISTS "sug_suc_write" ON public.sugeridos_sucursal;
CREATE POLICY "sug_suc_write" ON public.sugeridos_sucursal
FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
  OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'gerente'::app_role)
  OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen'::app_role)
  OR has_role(auth.uid(),'almacen_ventas'::app_role)
)
WITH CHECK (
  has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
  OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'gerente'::app_role)
  OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen'::app_role)
  OR has_role(auth.uid(),'almacen_ventas'::app_role)
);

DROP TRIGGER IF EXISTS trg_sugeridos_sucursal_updated ON public.sugeridos_sucursal;
CREATE TRIGGER trg_sugeridos_sucursal_updated
BEFORE UPDATE ON public.sugeridos_sucursal
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 2. Parámetro de flujo: revisión del gerente (apagado por default) ============
INSERT INTO public.cotizador_params (parametro, valor, descripcion)
VALUES ('requiere_revision_gerente', 0,
  'Si es 1, las OC generadas desde el cotizador entran en pendiente_aprobacion (revisión gerente + admin). Si es 0 (default), quedan listas para Confirmar con proveedor.')
ON CONFLICT (parametro) DO NOTHING;

-- ============ 3. RPCs de sugerido por sucursal ============
CREATE OR REPLACE FUNCTION public.sugerido_sucursal_upsert(
  p_producto_id uuid, p_sucursal_id uuid, p_cantidad integer, p_nota text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_nombre text;
BEGIN
  IF NOT (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen'::app_role)
    OR has_role(auth.uid(),'almacen_ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sin permiso para proponer sugeridos de sucursal';
  END IF;

  IF p_cantidad IS NULL THEN
    DELETE FROM sugeridos_sucursal WHERE producto_id = p_producto_id AND sucursal_id = p_sucursal_id;
    RETURN;
  END IF;

  SELECT COALESCE(nombre, username, email) INTO v_nombre FROM profiles WHERE id = auth.uid();

  INSERT INTO sugeridos_sucursal (producto_id, sucursal_id, cantidad, nota, usuario_id, usuario_nombre)
  VALUES (p_producto_id, p_sucursal_id, p_cantidad, p_nota, auth.uid(), v_nombre)
  ON CONFLICT (producto_id, sucursal_id) DO UPDATE
    SET cantidad = EXCLUDED.cantidad, nota = EXCLUDED.nota,
        usuario_id = EXCLUDED.usuario_id, usuario_nombre = EXCLUDED.usuario_nombre,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.sugeridos_sucursal_list(p_sucursal_id uuid DEFAULT NULL)
RETURNS TABLE (producto_id uuid, sucursal_id uuid, cantidad integer, nota text, usuario_nombre text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.producto_id, s.sucursal_id, s.cantidad, s.nota, s.usuario_nombre, s.updated_at
  FROM sugeridos_sucursal s
  WHERE (p_sucursal_id IS NULL OR s.sucursal_id = p_sucursal_id)
    AND (
      has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'gerente'::app_role)
      OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen'::app_role)
      OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'supervisor'::app_role)
    );
$$;

-- ============ 4. Vista simplificada para gerentes / almacenistas ============
CREATE OR REPLACE FUNCTION public.reposicion_sucursal_vista(
  p_sucursal_id uuid, p_search text DEFAULT NULL, p_solo_faltantes boolean DEFAULT false,
  p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_factor_abc numeric := 1.3;
  v_divisor numeric := 1.25;
  v_result jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen'::app_role)
    OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'supervisor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sin permiso para la vista de reposición';
  END IF;

  SELECT valor INTO v_factor_abc FROM cotizador_params WHERE parametro='factor_abc';
  SELECT valor INTO v_divisor    FROM cotizador_params WHERE parametro='divisor_otros';

  WITH prods AS (
    SELECT p.id, p.sku, p.nombre, p.descripcion, p.codigo_barras, p.clasificacion, p.estatus
    FROM productos p
    WHERE p.activo = true
      AND (p_search IS NULL OR (
        p.sku ILIKE '%'||p_search||'%' OR p.nombre ILIKE '%'||p_search||'%'
        OR COALESCE(p.codigo_barras,'') ILIKE '%'||p_search||'%'))
    ORDER BY p.nombre
    LIMIT p_limit OFFSET p_offset
  ),
  base AS (
    SELECT
      pr.id AS producto_id, pr.sku, pr.nombre, pr.descripcion, pr.clasificacion, pr.estatus,
      COALESCE((SELECT e.existencia FROM v_existencia_producto_sucursal e
                 WHERE e.producto_id = pr.id AND e.sucursal_id = p_sucursal_id), 0)::int AS existencia,
      COALESCE((SELECT v.unidades FROM v_ventas_30d v
                 WHERE v.producto_id = pr.id AND v.sucursal_id = p_sucursal_id), 0)::numeric AS ult30,
      COALESCE((SELECT SUM(t.cantidad) FROM ordenes_compra_transito t
                 WHERE t.producto_id = pr.id AND t.sucursal_id = p_sucursal_id AND t.cerrado = false), 0)::int AS en_ruta,
      (SELECT jsonb_agg(x) FROM (
          SELECT prv.nombre AS proveedor_nombre, SUM(t.cantidad)::int AS cantidad
          FROM ordenes_compra_transito t
          JOIN proveedores prv ON prv.id = t.proveedor_id
          WHERE t.producto_id = pr.id AND t.sucursal_id = p_sucursal_id AND t.cerrado = false
          GROUP BY prv.nombre) x) AS en_ruta_detalle,
      (SELECT jsonb_build_object('cantidad', s.cantidad, 'nota', s.nota, 'usuario', s.usuario_nombre, 'fecha', s.updated_at)
         FROM sugeridos_sucursal s WHERE s.producto_id = pr.id AND s.sucursal_id = p_sucursal_id) AS sug_gerente
    FROM prods pr
  ),
  calc AS (
    SELECT b.*,
      ROUND(CASE WHEN b.clasificacion IN ('A','B','C') THEN b.ult30 * v_factor_abc ELSE b.ult30 / v_divisor END, 0) AS necesidad
    FROM base b
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'producto_id', c.producto_id, 'sku', c.sku, 'nombre', c.nombre, 'descripcion', c.descripcion,
    'clasificacion', c.clasificacion, 'estatus', c.estatus,
    'existencia', c.existencia, 'ult30', c.ult30, 'necesidad', c.necesidad,
    'sugerido_sistema', GREATEST(0, CEIL(c.necesidad - c.existencia - c.en_ruta))::int,
    'en_ruta', c.en_ruta, 'en_ruta_detalle', COALESCE(c.en_ruta_detalle, '[]'::jsonb),
    'sug_gerente', c.sug_gerente
  ) ORDER BY c.nombre), '[]'::jsonb)
  INTO v_result
  FROM calc c
  WHERE (NOT p_solo_faltantes) OR (c.necesidad - c.existencia - c.en_ruta) > 0;

  RETURN v_result;
END;
$$;
