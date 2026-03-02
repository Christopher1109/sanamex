-- Agregar campos de hospital a todas las tablas operativas

-- 1. Tabla folios
ALTER TABLE folios
ADD COLUMN IF NOT EXISTS state_name TEXT,
ADD COLUMN IF NOT EXISTS hospital_budget_code TEXT,
ADD COLUMN IF NOT EXISTS hospital_display_name TEXT;

CREATE INDEX IF NOT EXISTS idx_folios_hospital ON folios(hospital_budget_code);
CREATE INDEX IF NOT EXISTS idx_folios_state ON folios(state_name);

-- 2. Tabla insumos
ALTER TABLE insumos
ADD COLUMN IF NOT EXISTS state_name TEXT,
ADD COLUMN IF NOT EXISTS hospital_budget_code TEXT,
ADD COLUMN IF NOT EXISTS hospital_display_name TEXT;

CREATE INDEX IF NOT EXISTS idx_insumos_hospital ON insumos(hospital_budget_code);
CREATE INDEX IF NOT EXISTS idx_insumos_state ON insumos(state_name);

-- 3. Tabla medicos
ALTER TABLE medicos
ADD COLUMN IF NOT EXISTS state_name TEXT,
ADD COLUMN IF NOT EXISTS hospital_budget_code TEXT,
ADD COLUMN IF NOT EXISTS hospital_display_name TEXT;

CREATE INDEX IF NOT EXISTS idx_medicos_hospital ON medicos(hospital_budget_code);
CREATE INDEX IF NOT EXISTS idx_medicos_state ON medicos(state_name);

-- 4. Tabla paquetes_anestesia
ALTER TABLE paquetes_anestesia
ADD COLUMN IF NOT EXISTS state_name TEXT,
ADD COLUMN IF NOT EXISTS hospital_budget_code TEXT,
ADD COLUMN IF NOT EXISTS hospital_display_name TEXT;

CREATE INDEX IF NOT EXISTS idx_paquetes_hospital ON paquetes_anestesia(hospital_budget_code);
CREATE INDEX IF NOT EXISTS idx_paquetes_state ON paquetes_anestesia(state_name);

-- 5. Tabla traspasos
ALTER TABLE traspasos
ADD COLUMN IF NOT EXISTS state_name_origen TEXT,
ADD COLUMN IF NOT EXISTS hospital_budget_code_origen TEXT,
ADD COLUMN IF NOT EXISTS hospital_display_name_origen TEXT,
ADD COLUMN IF NOT EXISTS state_name_destino TEXT,
ADD COLUMN IF NOT EXISTS hospital_budget_code_destino TEXT,
ADD COLUMN IF NOT EXISTS hospital_display_name_destino TEXT;

CREATE INDEX IF NOT EXISTS idx_traspasos_hospital_origen ON traspasos(hospital_budget_code_origen);
CREATE INDEX IF NOT EXISTS idx_traspasos_hospital_destino ON traspasos(hospital_budget_code_destino);

COMMENT ON COLUMN folios.hospital_budget_code IS 'Código presupuestal del hospital';
COMMENT ON COLUMN insumos.hospital_budget_code IS 'Código presupuestal del hospital';
COMMENT ON COLUMN medicos.hospital_budget_code IS 'Código presupuestal del hospital';
COMMENT ON COLUMN paquetes_anestesia.hospital_budget_code IS 'Código presupuestal del hospital';
COMMENT ON COLUMN traspasos.hospital_budget_code_origen IS 'Código presupuestal del hospital de origen';
COMMENT ON COLUMN traspasos.hospital_budget_code_destino IS 'Código presupuestal del hospital de destino';