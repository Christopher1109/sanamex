CREATE OR REPLACE FUNCTION public.cotizador_extras(p_producto_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'gerente'::app_role)
    OR has_role(auth.uid(),'subgerente'::app_role) OR has_role(auth.uid(),'almacen'::app_role)
    OR has_role(auth.uid(),'almacen_ventas'::app_role) OR has_role(auth.uid(),'supervisor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sin permiso para consultar el cotizador';
  END IF;

  SELECT jsonb_build_object(
    'en_ruta', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id', x.producto_id, 'sucursal_id', x.sucursal_id,
        'cantidad', x.cantidad, 'proveedor_nombre', x.proveedor_nombre, 'folio', x.folio))
      FROM (
        SELECT t.producto_id, t.sucursal_id, prv.nombre AS proveedor_nombre,
               oc.folio, SUM(t.cantidad)::int AS cantidad
        FROM ordenes_compra_transito t
        JOIN proveedores prv ON prv.id = t.proveedor_id
        LEFT JOIN ordenes_compra oc ON oc.id = t.orden_id
        WHERE t.cerrado = false AND t.producto_id = ANY(p_producto_ids)
        GROUP BY t.producto_id, t.sucursal_id, prv.nombre, oc.folio
      ) x), '[]'::jsonb),
    'sug_gerente', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id', s.producto_id, 'sucursal_id', s.sucursal_id, 'cantidad', s.cantidad,
        'nota', s.nota, 'usuario', s.usuario_nombre, 'fecha', s.updated_at))
      FROM sugeridos_sucursal s WHERE s.producto_id = ANY(p_producto_ids)), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cotizador_extras(uuid[]) FROM anon;
