
-- Add 'compras' role to enum (safe if already exists)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'compras';

-- Verify which product keys exist in catalog
CREATE OR REPLACE FUNCTION public.verificar_productos_lista(p_claves text[])
RETURNS TABLE (
  clave text,
  existe boolean,
  producto_id uuid,
  descripcion_actual text,
  estatus_actual text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c::text AS clave,
    (p.id IS NOT NULL) AS existe,
    p.id AS producto_id,
    COALESCE(p.descripcion, p.nombre)::text AS descripcion_actual,
    p.estatus::text AS estatus_actual
  FROM unnest(p_claves) AS c
  LEFT JOIN public.productos p
    ON (p.codigo_barras = c OR p.sku = c)
   AND p.activo = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verificar_productos_lista(text[]) TO authenticated, service_role;

-- Revert a price list upload (admin/super_admin only)
CREATE OR REPLACE FUNCTION public.revertir_carga_lista_precios(p_carga_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proveedor uuid;
  v_prev_carga uuid;
  v_deactivated int := 0;
  v_reactivated int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado para revertir cargas';
  END IF;

  SELECT proveedor_id INTO v_proveedor
  FROM public.lista_precio_cargas WHERE id = p_carga_id;
  IF v_proveedor IS NULL THEN
    RAISE EXCEPTION 'Carga no encontrada';
  END IF;

  -- Deactivate current carga lines
  UPDATE public.lista_precio_proveedor
     SET activo = false,
         fecha_vigencia_hasta = COALESCE(fecha_vigencia_hasta, CURRENT_DATE)
   WHERE carga_id = p_carga_id AND activo = true;
  GET DIAGNOSTICS v_deactivated = ROW_COUNT;

  -- Find previous carga for same proveedor
  SELECT id INTO v_prev_carga
  FROM public.lista_precio_cargas
  WHERE proveedor_id = v_proveedor AND id <> p_carga_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_prev_carga IS NOT NULL THEN
    UPDATE public.lista_precio_proveedor
       SET activo = true,
           fecha_vigencia_hasta = NULL
     WHERE carga_id = v_prev_carga;
    GET DIAGNOSTICS v_reactivated = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'desactivados', v_deactivated,
    'reactivados', v_reactivated,
    'carga_anterior', v_prev_carga
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.revertir_carga_lista_precios(uuid) TO authenticated, service_role;
