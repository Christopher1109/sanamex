-- Agregar relación entre procedimientos y hospitales
ALTER TABLE procedimientos
ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitales(id) ON DELETE CASCADE;

-- Crear índice para búsquedas por hospital
CREATE INDEX IF NOT EXISTS idx_procedimientos_hospital_id ON procedimientos(hospital_id);