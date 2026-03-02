
-- Primero limpiar asignaciones existentes
DELETE FROM public.supervisor_hospital_assignments;

-- Insertar asignaciones: cada supervisor obtiene todos los hospitales de su mismo estado
INSERT INTO public.supervisor_hospital_assignments (supervisor_user_id, hospital_id)
SELECT DISTINCT
  p.id as supervisor_user_id,
  h.id as hospital_id
FROM profiles p
JOIN users u ON p.username = u.username
JOIN hospitales sup_hosp ON sup_hosp.budget_code = u.hospital_budget_code
JOIN hospitales h ON h.state_id = sup_hosp.state_id
WHERE u.role = 'supervisor'
  AND sup_hosp.state_id IS NOT NULL
  AND h.id IS NOT NULL;
