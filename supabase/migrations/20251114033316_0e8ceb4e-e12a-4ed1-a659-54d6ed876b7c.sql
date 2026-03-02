-- Agregar nuevos campos a la tabla hospitales para IMSS
ALTER TABLE hospitales
ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES states(id),
ADD COLUMN IF NOT EXISTS budget_code TEXT,
ADD COLUMN IF NOT EXISTS hospital_type TEXT,
ADD COLUMN IF NOT EXISTS clinic_number TEXT,
ADD COLUMN IF NOT EXISTS locality TEXT,
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Crear índice para búsquedas por estado
CREATE INDEX IF NOT EXISTS idx_hospitales_state_id ON hospitales(state_id);

-- Crear índice para búsquedas por código presupuestal
CREATE INDEX IF NOT EXISTS idx_hospitales_budget_code ON hospitales(budget_code);