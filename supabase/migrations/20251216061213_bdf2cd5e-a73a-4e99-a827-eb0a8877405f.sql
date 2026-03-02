-- Agregar política para que cadena_suministros y gerente_almacen puedan crear órdenes de compra
CREATE POLICY "Cadena suministros y gerente almacen pueden crear ordenes"
ON public.pedidos_compra
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'cadena_suministros'::app_role) OR 
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'gerente_operaciones'::app_role)
);

-- También necesitan poder actualizar las órdenes
CREATE POLICY "Cadena suministros y gerente almacen pueden actualizar ordenes"
ON public.pedidos_compra
FOR UPDATE
USING (
  has_role(auth.uid(), 'cadena_suministros'::app_role) OR 
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR
  has_role(auth.uid(), 'finanzas'::app_role)
);

-- Y ver las órdenes
CREATE POLICY "Usuarios autorizados pueden ver ordenes"
ON public.pedidos_compra
FOR SELECT
USING (
  has_role(auth.uid(), 'cadena_suministros'::app_role) OR 
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR
  has_role(auth.uid(), 'finanzas'::app_role)
);

-- También para pedido_items
CREATE POLICY "Usuarios autorizados pueden crear items de pedido"
ON public.pedido_items
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'cadena_suministros'::app_role) OR 
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'gerente_operaciones'::app_role)
);

CREATE POLICY "Usuarios autorizados pueden ver items de pedido"
ON public.pedido_items
FOR SELECT
USING (
  has_role(auth.uid(), 'cadena_suministros'::app_role) OR 
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR
  has_role(auth.uid(), 'finanzas'::app_role)
);

CREATE POLICY "Usuarios autorizados pueden actualizar items de pedido"
ON public.pedido_items
FOR UPDATE
USING (
  has_role(auth.uid(), 'cadena_suministros'::app_role) OR 
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR
  has_role(auth.uid(), 'finanzas'::app_role)
);