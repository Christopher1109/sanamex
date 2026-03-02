
-- Add RLS policy for cadena_suministros to view pedido_items
CREATE POLICY "Cadena suministros puede ver items de pedidos"
ON public.pedido_items
FOR SELECT
USING (has_role(auth.uid(), 'cadena_suministros'::app_role));
