-- Eliminar el constraint antiguo y crear uno nuevo con todos los estados del flujo
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_estado_check;

ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_estado_check 
CHECK (estado IN (
  'pendiente',
  'en_proceso', 
  'enviado_proveedor',
  'recibido_parcial',
  'completado',
  'cancelado',
  'enviado_a_finanzas',
  'pagado_espera_confirmacion',
  'pagado_enviado_cadena',
  'recibido'
));

-- Agregar permisos para finanzas en pedidos_compra (SELECT y UPDATE)
CREATE POLICY "Finanzas puede ver pedidos" 
ON public.pedidos_compra 
FOR SELECT 
USING (has_role(auth.uid(), 'finanzas'::app_role));

CREATE POLICY "Finanzas puede actualizar pedidos" 
ON public.pedidos_compra 
FOR UPDATE 
USING (has_role(auth.uid(), 'finanzas'::app_role));

-- Agregar permisos para finanzas en pedido_items (SELECT)
CREATE POLICY "Finanzas puede ver items de pedidos" 
ON public.pedido_items 
FOR SELECT 
USING (has_role(auth.uid(), 'finanzas'::app_role));

-- Permitir que cadena_suministros también vea y actualice pedidos
CREATE POLICY "Cadena suministros puede ver pedidos" 
ON public.pedidos_compra 
FOR SELECT 
USING (has_role(auth.uid(), 'cadena_suministros'::app_role));

CREATE POLICY "Cadena suministros puede actualizar pedidos" 
ON public.pedidos_compra 
FOR UPDATE 
USING (has_role(auth.uid(), 'cadena_suministros'::app_role));