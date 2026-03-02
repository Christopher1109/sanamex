-- Primero eliminar la foreign key antigua
ALTER TABLE folios_insumos 
DROP CONSTRAINT IF EXISTS folio_insumos_insumo_id_fkey;

-- Eliminar registros antiguos que apuntan a insumos que no están en el catálogo
DELETE FROM folios_insumos 
WHERE insumo_id NOT IN (SELECT id FROM insumos_catalogo);

-- Ahora crear la nueva foreign key que apunta a insumos_catalogo
ALTER TABLE folios_insumos 
ADD CONSTRAINT folios_insumos_insumo_id_fkey 
FOREIGN KEY (insumo_id) 
REFERENCES insumos_catalogo(id) 
ON DELETE CASCADE;