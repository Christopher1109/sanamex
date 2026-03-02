-- Fix security issue: Restrict hospitales table access to authenticated users with proper scope
-- Remove public read access and enforce organizational boundaries

-- Drop the existing public access policy
DROP POLICY IF EXISTS "Todos pueden ver hospitales" ON public.hospitales;

-- Create scope-based access policy for authenticated users only
CREATE POLICY "Usuarios pueden ver hospitales según su alcance organizacional"
ON public.hospitales
FOR SELECT
TO authenticated
USING (
  -- Users can see hospitals based on their organizational scope
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (
      -- Hospital scope: only their assigned hospital
      (ur.alcance = 'hospital' AND ur.hospital_id = hospitales.id)
      -- State scope: all hospitals in their state
      OR (ur.alcance = 'estado' AND ur.estado_id = hospitales.estado_id)
      -- Company scope: all hospitals in their company
      OR (ur.alcance = 'empresa' AND ur.empresa_id = (
        SELECT empresa_id FROM public.estados WHERE id = hospitales.estado_id
      ))
    )
  )
);

-- Same restriction for estados table
DROP POLICY IF EXISTS "Todos pueden ver estados" ON public.estados;

CREATE POLICY "Usuarios pueden ver estados según su alcance organizacional"
ON public.estados
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (
      -- State scope: their assigned state
      (ur.alcance = 'estado' AND ur.estado_id = estados.id)
      -- Company scope: all states in their company
      OR (ur.alcance = 'empresa' AND ur.empresa_id = estados.empresa_id)
      -- Hospital scope: state of their hospital
      OR (ur.alcance = 'hospital' AND ur.estado_id = (
        SELECT estado_id FROM public.hospitales WHERE id = ur.hospital_id
      ))
    )
  )
);

-- Same restriction for empresas table
DROP POLICY IF EXISTS "Todos pueden ver empresas" ON public.empresas;

CREATE POLICY "Usuarios pueden ver empresas según su alcance organizacional"
ON public.empresas
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (
      -- Company scope: their assigned company
      (ur.alcance = 'empresa' AND ur.empresa_id = empresas.id)
      -- State scope: company of their state
      OR (ur.alcance = 'estado' AND ur.empresa_id = (
        SELECT empresa_id FROM public.estados WHERE id = ur.estado_id
      ))
      -- Hospital scope: company via hospital -> state -> company
      OR (ur.alcance = 'hospital' AND ur.empresa_id = (
        SELECT e.empresa_id 
        FROM public.hospitales h
        JOIN public.estados e ON h.estado_id = e.id
        WHERE h.id = ur.hospital_id
      ))
    )
  )
);

-- Also restrict unidades table to authenticated users with scope
DROP POLICY IF EXISTS "Todos pueden ver unidades" ON public.unidades;

CREATE POLICY "Usuarios pueden ver unidades según su alcance organizacional"
ON public.unidades
FOR SELECT
TO authenticated
USING (
  user_has_hospital_access(auth.uid(), unidades.hospital_id)
);