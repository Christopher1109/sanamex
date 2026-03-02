-- Agregar todos los campos faltantes a la tabla folios para el formato T33

-- Campos de procedimiento
ALTER TABLE folios ADD COLUMN IF NOT EXISTS unidad TEXT;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS numero_quirofano TEXT;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS hora_inicio_procedimiento TIME;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS hora_fin_procedimiento TIME;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS hora_inicio_anestesia TIME;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS hora_fin_anestesia TIME;

-- Datos del paciente
ALTER TABLE folios ADD COLUMN IF NOT EXISTS paciente_apellido_paterno TEXT;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS paciente_apellido_materno TEXT;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS paciente_nombre TEXT;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS paciente_nss TEXT;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS paciente_edad INTEGER;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS paciente_genero TEXT;

-- Información del procedimiento
ALTER TABLE folios ADD COLUMN IF NOT EXISTS cirugia TEXT;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS especialidad_quirurgica TEXT;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS tipo_cirugia TEXT;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS tipo_evento TEXT;

-- Información de médicos (nombres para el PDF)
ALTER TABLE folios ADD COLUMN IF NOT EXISTS cirujano_id UUID REFERENCES medicos(id);
ALTER TABLE folios ADD COLUMN IF NOT EXISTS anestesiologo_id UUID REFERENCES medicos(id);
ALTER TABLE folios ADD COLUMN IF NOT EXISTS cirujano_nombre TEXT;
ALTER TABLE folios ADD COLUMN IF NOT EXISTS anestesiologo_nombre TEXT;

-- Campo para rastrear quién canceló el folio
ALTER TABLE folios ADD COLUMN IF NOT EXISTS cancelado_por UUID;