-- Agregar columna condicionante a anestesia_insumos
ALTER TABLE anestesia_insumos 
ADD COLUMN IF NOT EXISTS condicionante text;