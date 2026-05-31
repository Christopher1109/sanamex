
CREATE POLICY "Admin/gerente eliminan proveedores"
ON public.proveedores FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));
GRANT DELETE ON public.proveedores TO authenticated;
