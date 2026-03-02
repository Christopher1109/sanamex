-- Agregar nuevos campos del T33 (Anexo 33) a la tabla folios
ALTER TABLE public.folios
ADD COLUMN IF NOT EXISTS numero_quirofano text,
ADD COLUMN IF NOT EXISTS hora_inicio_procedimiento time,
ADD COLUMN IF NOT EXISTS hora_fin_procedimiento time,
ADD COLUMN IF NOT EXISTS hora_inicio_anestesia time,
ADD COLUMN IF NOT EXISTS hora_fin_anestesia time,
ADD COLUMN IF NOT EXISTS paciente_apellido_paterno text,
ADD COLUMN IF NOT EXISTS paciente_apellido_materno text,
ADD COLUMN IF NOT EXISTS paciente_nss text,
ADD COLUMN IF NOT EXISTS especialidad_quirurgica text,
ADD COLUMN IF NOT EXISTS tipo_cirugia text CHECK (tipo_cirugia IN ('abierta', 'minima_invasion')),
ADD COLUMN IF NOT EXISTS tipo_evento text CHECK (tipo_evento IN ('programado', 'urgencia'));

-- Actualizar campos existentes si hay datos previos (migrar nombre completo a apellidos)
-- Solo para registros que no tengan apellidos separados
UPDATE public.folios
SET 
  paciente_apellido_paterno = COALESCE(paciente_apellido_paterno, split_part(paciente_nombre, ' ', 1)),
  paciente_apellido_materno = COALESCE(paciente_apellido_materno, split_part(paciente_nombre, ' ', 2)),
  paciente_nss = COALESCE(paciente_nss, 'SIN-REGISTRO')
WHERE paciente_apellido_paterno IS NULL;

-- Agregar comentarios para documentación
COMMENT ON COLUMN public.folios.numero_quirofano IS 'Número de quirófano donde se realizó el procedimiento';
COMMENT ON COLUMN public.folios.hora_inicio_procedimiento IS 'Hora de inicio del procedimiento quirúrgico';
COMMENT ON COLUMN public.folios.hora_fin_procedimiento IS 'Hora de finalización del procedimiento quirúrgico';
COMMENT ON COLUMN public.folios.hora_inicio_anestesia IS 'Hora de inicio de la anestesia';
COMMENT ON COLUMN public.folios.hora_fin_anestesia IS 'Hora de finalización de la anestesia';
COMMENT ON COLUMN public.folios.paciente_apellido_paterno IS 'Apellido paterno del paciente';
COMMENT ON COLUMN public.folios.paciente_apellido_materno IS 'Apellido materno del paciente';
COMMENT ON COLUMN public.folios.paciente_nss IS 'Número de Seguridad Social del paciente';
COMMENT ON COLUMN public.folios.especialidad_quirurgica IS 'Especialidad quirúrgica del procedimiento';
COMMENT ON COLUMN public.folios.tipo_cirugia IS 'Tipo de cirugía: abierta o mínima invasión';
COMMENT ON COLUMN public.folios.tipo_evento IS 'Tipo de evento: programado o urgencia';