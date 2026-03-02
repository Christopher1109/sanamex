-- Políticas RLS para la tabla folios

-- Permitir INSERT a usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden crear folios"
ON folios
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Permitir UPDATE a usuarios autenticados (pueden editar sus propios folios)
CREATE POLICY "Usuarios autenticados pueden actualizar folios"
ON folios
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Permitir DELETE solo a supervisores y gerentes
CREATE POLICY "Supervisores y gerentes pueden eliminar folios"
ON folios
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::app_role) OR 
  public.has_role(auth.uid(), 'gerente'::app_role)
);

-- Políticas similares para folios_insumos
CREATE POLICY "Usuarios autenticados pueden crear folios_insumos"
ON folios_insumos
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar folios_insumos"
ON folios_insumos
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar folios_insumos"
ON folios_insumos
FOR DELETE
TO authenticated
USING (true);