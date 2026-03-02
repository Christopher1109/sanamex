-- Permitir que Gerente de Operaciones también pueda eliminar folios (incluye borradores)
DROP POLICY IF EXISTS "Supervisores y gerentes pueden eliminar folios" ON public.folios;

CREATE POLICY "Supervisores y gerentes pueden eliminar folios"
ON public.folios
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'gerente_operaciones'::app_role)
);