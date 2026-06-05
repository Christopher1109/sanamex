DELETE FROM public.productos
WHERE (sku LIKE '%--' OR codigo_barras LIKE '%--')
  AND id NOT IN (SELECT DISTINCT l.producto_id FROM lotes l WHERE l.producto_id IS NOT NULL)
  AND id NOT IN (SELECT DISTINCT vl.producto_id FROM venta_lineas vl WHERE vl.producto_id IS NOT NULL);