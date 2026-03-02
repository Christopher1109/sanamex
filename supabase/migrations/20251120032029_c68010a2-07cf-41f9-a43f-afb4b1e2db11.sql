-- Agregar campo familia_insumo a insumos_catalogo
ALTER TABLE insumos_catalogo 
ADD COLUMN IF NOT EXISTS familia_insumo TEXT,
ADD COLUMN IF NOT EXISTS presentacion TEXT,
ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'insumo';

-- Crear índice para mejorar performance en agrupaciones
CREATE INDEX IF NOT EXISTS idx_insumos_catalogo_familia ON insumos_catalogo(familia_insumo);

-- Poblar familia_insumo basado en el nombre actual
-- Extraer la parte común del nombre (antes de números, medidas, etc.)
UPDATE insumos_catalogo
SET familia_insumo = CASE
  -- Agujas
  WHEN nombre ILIKE '%aguja%' THEN 'Aguja Hipodérmica'
  -- Jeringas
  WHEN nombre ILIKE '%jeringa%' THEN 'Jeringa Desechable'
  -- Catéteres
  WHEN nombre ILIKE '%cateter%' OR nombre ILIKE '%catéter%' THEN 'Catéter'
  -- Soluciones
  WHEN nombre ILIKE '%solucion%' OR nombre ILIKE '%solución%' THEN 'Solución'
  -- Guantes
  WHEN nombre ILIKE '%guante%' THEN 'Guantes'
  -- Gasas
  WHEN nombre ILIKE '%gasa%' THEN 'Gasas'
  -- Vendas
  WHEN nombre ILIKE '%venda%' THEN 'Vendas'
  -- Tubos
  WHEN nombre ILIKE '%tubo%' THEN 'Tubo'
  -- Medicamentos anestésicos
  WHEN nombre ILIKE '%propofol%' THEN 'Propofol'
  WHEN nombre ILIKE '%fentanilo%' OR nombre ILIKE '%fentanil%' THEN 'Fentanilo'
  WHEN nombre ILIKE '%midazolam%' THEN 'Midazolam'
  WHEN nombre ILIKE '%rocuronio%' THEN 'Rocuronio'
  WHEN nombre ILIKE '%sevoflurano%' OR nombre ILIKE '%sevoflurane%' THEN 'Sevoflurano'
  WHEN nombre ILIKE '%lidocaina%' OR nombre ILIKE '%lidocaína%' THEN 'Lidocaína'
  WHEN nombre ILIKE '%bupivacaina%' OR nombre ILIKE '%bupivacaína%' THEN 'Bupivacaína'
  WHEN nombre ILIKE '%atropina%' THEN 'Atropina'
  WHEN nombre ILIKE '%epinefrina%' THEN 'Epinefrina'
  WHEN nombre ILIKE '%morfina%' THEN 'Morfina'
  WHEN nombre ILIKE '%ketamina%' THEN 'Ketamina'
  WHEN nombre ILIKE '%succinilcolina%' THEN 'Succinilcolina'
  -- Default: usar el nombre completo
  ELSE REGEXP_REPLACE(nombre, '\s+\d+.*$', '')
END
WHERE familia_insumo IS NULL;

-- Extraer presentación del nombre (números, medidas, concentraciones)
UPDATE insumos_catalogo
SET presentacion = REGEXP_REPLACE(
  REGEXP_REPLACE(nombre, '^.*?(\d+.*?)$', '\1'),
  '^[^0-9]*',
  ''
)
WHERE presentacion IS NULL AND nombre ~ '\d';

-- Para medicamentos, marcar tipo basado en categoría o nombre
UPDATE insumos_catalogo
SET tipo = 'medicamento'
WHERE categoria IN ('anestesico', 'analgesico', 'relajante_muscular', 'antiemetico')
   OR nombre ILIKE ANY(ARRAY['%propofol%', '%fentanil%', '%midazolam%', '%morfina%', '%ketamina%']);