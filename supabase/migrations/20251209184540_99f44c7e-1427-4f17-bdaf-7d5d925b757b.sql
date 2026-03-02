
-- Crear tabla para asignar supervisores a múltiples hospitales
CREATE TABLE IF NOT EXISTS public.supervisor_hospital_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supervisor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitales(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(supervisor_user_id, hospital_id)
);

-- Habilitar RLS
ALTER TABLE public.supervisor_hospital_assignments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Todos pueden ver asignaciones de supervisores"
ON public.supervisor_hospital_assignments
FOR SELECT
USING (true);

CREATE POLICY "Solo admins pueden modificar asignaciones"
ON public.supervisor_hospital_assignments
FOR ALL
USING (has_role(auth.uid(), 'gerente_operaciones'::app_role));

-- Insertar asignaciones de supervisores agrupados por estado
-- Primero, obtener todos los supervisores y asignarles hospitales de su mismo estado

-- Para cada supervisor existente, asignarle hasta 4 hospitales del mismo estado
INSERT INTO public.supervisor_hospital_assignments (supervisor_user_id, hospital_id)
SELECT 
  p.id as supervisor_user_id,
  h.id as hospital_id
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
JOIN hospitales assigned_h ON p.hospital_id = assigned_h.id
JOIN hospitales h ON h.state_id = assigned_h.state_id
WHERE ur.role = 'supervisor'
ON CONFLICT (supervisor_user_id, hospital_id) DO NOTHING;
