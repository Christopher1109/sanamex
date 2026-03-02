-- Permitir que el rol Finanzas visualice el registro de actividad
-- (Actualmente solo lo pueden ver gerente_operaciones/gerente_almacen/cadena_suministros y supervisor)

CREATE POLICY "Finanzas puede ver registro de actividad"
ON public.registro_actividad
FOR SELECT
USING (has_role(auth.uid(), 'finanzas'::app_role));