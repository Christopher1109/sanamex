DROP POLICY IF EXISTS "Autenticados ven rutas" ON public.rutas;
CREATE POLICY "Ver rutas segun rol" ON public.rutas
  FOR SELECT TO authenticated
  USING (
    -- Un repartidor solo ve sus propias rutas.
    repartidor_id = auth.uid()
    -- Perfiles operativos/administrativos siguen viendo todas las rutas.
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'gerente'::app_role)
    OR has_role(auth.uid(), 'subgerente'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'almacen'::app_role)
    OR has_role(auth.uid(), 'almacen_ventas'::app_role)
    OR has_role(auth.uid(), 'auditoria'::app_role)
  );

DROP POLICY IF EXISTS "Autenticados ven entregas" ON public.ruta_entregas;
CREATE POLICY "Ver entregas segun rol" ON public.ruta_entregas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rutas r
      WHERE r.id = ruta_entregas.ruta_id
        AND (
          r.repartidor_id = auth.uid()
          OR has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'gerente'::app_role)
          OR has_role(auth.uid(), 'subgerente'::app_role)
          OR has_role(auth.uid(), 'supervisor'::app_role)
          OR has_role(auth.uid(), 'almacen'::app_role)
          OR has_role(auth.uid(), 'almacen_ventas'::app_role)
          OR has_role(auth.uid(), 'auditoria'::app_role)
        )
    )
  );