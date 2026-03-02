-- Actualizar política INSERT para almacen_provisional_inventario para incluir más roles
DROP POLICY IF EXISTS "Almacenistas pueden crear inventario provisional" ON public.almacen_provisional_inventario;
CREATE POLICY "Usuarios hospital pueden crear inventario provisional" 
ON public.almacen_provisional_inventario 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'almacenista'::app_role) OR 
  has_role(auth.uid(), 'lider'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'gerente'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role)
);

-- Actualizar política UPDATE para almacen_provisional_inventario
DROP POLICY IF EXISTS "Almacenistas pueden actualizar inventario provisional" ON public.almacen_provisional_inventario;
CREATE POLICY "Usuarios hospital pueden actualizar inventario provisional" 
ON public.almacen_provisional_inventario 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'almacenista'::app_role) OR 
  has_role(auth.uid(), 'lider'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'gerente'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role)
);

-- Actualizar política INSERT para movimientos_almacen_provisional
DROP POLICY IF EXISTS "Almacenistas pueden crear movimientos provisionales" ON public.movimientos_almacen_provisional;
CREATE POLICY "Usuarios hospital pueden crear movimientos provisionales" 
ON public.movimientos_almacen_provisional 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'almacenista'::app_role) OR 
  has_role(auth.uid(), 'lider'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'auxiliar'::app_role) OR
  has_role(auth.uid(), 'gerente'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role)
);

-- Agregar política DELETE para almacen_provisional_inventario (necesaria para limpieza)
DROP POLICY IF EXISTS "Almacenistas pueden eliminar inventario provisional" ON public.almacen_provisional_inventario;
CREATE POLICY "Usuarios hospital pueden eliminar inventario provisional" 
ON public.almacen_provisional_inventario 
FOR DELETE 
USING (
  has_role(auth.uid(), 'almacenista'::app_role) OR 
  has_role(auth.uid(), 'gerente'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role)
);