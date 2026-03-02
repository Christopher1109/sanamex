-- Agregar campo fecha de nacimiento del paciente a folios
ALTER TABLE public.folios 
ADD COLUMN paciente_fecha_nacimiento date;