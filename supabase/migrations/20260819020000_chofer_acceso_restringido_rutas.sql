-- Junta SANAMEX 15-ago-2026, punto 3 (Corte de caja y ventas a domicilio) y
-- punto de acción explícito de Christopher Moreno: "Restringe el acceso de
-- cada chofer a sus propias órdenes y entregas asignadas".
--
-- Hallazgo: las políticas RLS actuales de `rutas` y `ruta_entregas` son
-- "Autenticados ven rutas/entregas ... USING (true)" — es decir, CUALQUIER
-- usuario autenticado (incluido un repartidor) puede ver TODAS las rutas y
-- entregas de TODAS las sucursales, no solo las suyas. Esta migración
-- restringe la lectura para el rol `repartidor` a sus propias rutas
-- (repartidor_id = auth.uid()) y a las entregas de esas rutas, sin tocar la
-- visibilidad de gerencia/almacén/administración, que sigue viendo todo.
--
-- No se tocan las políticas de INSERT/UPDATE (crear/actualizar rutas y
-- marcar entregas) porque los permisos de quién puede modificar qué
-- quedaron pendientes de una llamada aparte con Alejandro — ver
-- docs/SANAMEX_15ago2026_seguimiento.md, tabla de bloqueos.

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
    OR has_role(auth.uid(), 'gerente_operaciones'::app_role)
    OR has_role(auth.uid(), 'almacen'::app_role)
    OR has_role(auth.uid(), 'almacen_ventas'::app_role)
    OR has_role(auth.uid(), 'cadena_suministros'::app_role)
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
          OR has_role(auth.uid(), 'gerente_operaciones'::app_role)
          OR has_role(auth.uid(), 'almacen'::app_role)
          OR has_role(auth.uid(), 'almacen_ventas'::app_role)
          OR has_role(auth.uid(), 'cadena_suministros'::app_role)
          OR has_role(auth.uid(), 'auditoria'::app_role)
        )
    )
  );
