-- Eliminar política recursiva de hospitales
DROP POLICY IF EXISTS "Usuarios pueden ver hospitales según su alcance organizacional" ON public.hospitales;

-- Crear nueva política sin recursión para hospitales
-- Gerentes pueden ver todos los hospitales
CREATE POLICY "Gerentes pueden ver todos los hospitales"
ON public.hospitales
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'gerente'
  )
);

-- Usuarios con alcance de hospital pueden ver su hospital
CREATE POLICY "Usuarios pueden ver su hospital asignado"
ON public.hospitales
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.hospital_id = hospitales.id
  )
);

-- Usuarios con alcance de estado pueden ver hospitales de su estado
CREATE POLICY "Usuarios pueden ver hospitales de su estado"
ON public.hospitales
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.estado_id = hospitales.estado_id
  )
);

-- Usuarios con alcance de empresa pueden ver hospitales de su empresa
CREATE POLICY "Usuarios pueden ver hospitales de su empresa"
ON public.hospitales
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.estados e ON ur.empresa_id = e.empresa_id
    WHERE ur.user_id = auth.uid()
    AND e.id = hospitales.estado_id
  )
);