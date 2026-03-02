-- Fix security issue: Restrict folios access based on user's organizational scope
-- Remove blanket access for supervisors/gerentes and enforce proper scope checking

-- First, fix the user_has_hospital_access function to properly check scope
-- Remove the problematic OR clause that gives unlimited access
CREATE OR REPLACE FUNCTION public.user_has_hospital_access(_user_id uuid, _hospital_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
    AND (
      -- Hospital scope: must match exactly
      (ur.alcance = 'hospital' AND ur.hospital_id = _hospital_id)
      -- State scope: check if hospital belongs to user's state
      OR (ur.alcance = 'estado' AND ur.estado_id = (
        SELECT estado_id FROM public.hospitales WHERE id = _hospital_id
      ))
      -- Company scope: check if hospital belongs to user's company
      OR (ur.alcance = 'empresa' AND ur.empresa_id = (
        SELECT h.estado_id FROM public.hospitales h 
        JOIN public.estados e ON h.estado_id = e.id
        WHERE h.id = _hospital_id
      ))
    )
  );
$$;

-- Update the SELECT policy on folios to remove blanket supervisor/gerente access
DROP POLICY IF EXISTS "Usuarios pueden ver folios de su hospital" ON public.folios;

CREATE POLICY "Usuarios pueden ver folios según su alcance organizacional"
ON public.folios
FOR SELECT
TO authenticated
USING (
  -- Users can see folios from hospitals they have access to based on their scope
  user_has_hospital_access(auth.uid(), hospital_id)
);

-- Also update UPDATE policy to respect scope
DROP POLICY IF EXISTS "Líderes, supervisores y gerentes pueden actualizar folios" ON public.folios;

CREATE POLICY "Usuarios autorizados pueden actualizar folios en su alcance"
ON public.folios
FOR UPDATE
TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['lider'::app_role, 'supervisor'::app_role, 'gerente'::app_role])
  AND user_has_hospital_access(auth.uid(), hospital_id)
);