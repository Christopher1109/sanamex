-- Drop existing policy and create new one that includes gerente_almacen
DROP POLICY IF EXISTS "Gerente operaciones puede ver todo el registro" ON public.registro_actividad;

CREATE POLICY "Gerentes globales pueden ver todo el registro" 
ON public.registro_actividad 
FOR SELECT 
USING (
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
  has_role(auth.uid(), 'gerente_almacen'::app_role)
);