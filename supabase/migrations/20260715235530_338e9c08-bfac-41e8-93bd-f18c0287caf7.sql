
-- Cerrar SELECT abierto en productos (era role 'public' con USING true)
DROP POLICY IF EXISTS "Todos ven productos" ON public.productos;
CREATE POLICY "Autenticados ven productos" ON public.productos
FOR SELECT TO authenticated USING (true);

-- Cerrar SELECT abierto en producto_precios_sucursal
DROP POLICY IF EXISTS "Autenticados ven precios sucursal" ON public.producto_precios_sucursal;
CREATE POLICY "Autenticados ven precios sucursal" ON public.producto_precios_sucursal
FOR SELECT TO authenticated USING (true);

-- Cerrar SELECT abierto en productos_precios_lista (por si tuviera role public)
DROP POLICY IF EXISTS "Price lists read" ON public.productos_precios_lista;
CREATE POLICY "Price lists read" ON public.productos_precios_lista
FOR SELECT TO authenticated USING (true);

-- Revocar cualquier grant a anon (por si el catálogo estaba abierto)
REVOKE SELECT ON public.productos FROM anon;
REVOKE SELECT ON public.producto_precios_sucursal FROM anon;
REVOKE SELECT ON public.productos_precios_lista FROM anon;
REVOKE SELECT ON public.producto_precios_escalonados FROM anon;
