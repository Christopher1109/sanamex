
-- Actualizar políticas para almacenes_provisionales
DROP POLICY IF EXISTS "Almacenistas pueden crear almacenes provisionales" ON public.almacenes_provisionales;

CREATE POLICY "Usuarios autorizados pueden crear almacenes provisionales"
ON public.almacenes_provisionales
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'almacenista'::app_role) 
  OR has_role(auth.uid(), 'gerente_operaciones'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
);
