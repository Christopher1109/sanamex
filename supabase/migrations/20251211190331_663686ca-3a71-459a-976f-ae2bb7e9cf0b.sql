
-- First, consolidate inventory by summing quantities for conflicting records
-- Then update references and delete duplicates

-- Create mapping table first
CREATE TEMP TABLE dup_map AS
WITH ranked AS (
  SELECT id, nombre,
         ROW_NUMBER() OVER (PARTITION BY nombre ORDER BY created_at ASC) as rn
  FROM insumos_catalogo
)
SELECT 
  r1.id as dup_id, 
  r2.id as keep_id
FROM ranked r1
JOIN ranked r2 ON r1.nombre = r2.nombre AND r2.rn = 1
WHERE r1.rn > 1;

-- Step 1: For inventario_hospital - update quantities for existing conflicts first
UPDATE inventario_hospital ih_keep
SET cantidad_actual = ih_keep.cantidad_actual + ih_dup.cantidad_actual,
    cantidad_inicial = ih_keep.cantidad_inicial + COALESCE(ih_dup.cantidad_inicial, 0)
FROM inventario_hospital ih_dup
JOIN dup_map dm ON ih_dup.insumo_catalogo_id = dm.dup_id
WHERE ih_keep.insumo_catalogo_id = dm.keep_id
  AND ih_keep.almacen_id = ih_dup.almacen_id
  AND ih_keep.lote = ih_dup.lote;

-- Delete the duplicate inventory records that were consolidated
DELETE FROM inventario_hospital ih
USING dup_map dm, inventario_hospital ih_keep
WHERE ih.insumo_catalogo_id = dm.dup_id
  AND ih_keep.insumo_catalogo_id = dm.keep_id
  AND ih_keep.almacen_id = ih.almacen_id
  AND ih_keep.lote = ih.lote;

-- Step 2: Now update remaining non-conflicting inventory
UPDATE inventario_hospital ih
SET insumo_catalogo_id = dm.keep_id
FROM dup_map dm
WHERE ih.insumo_catalogo_id = dm.dup_id;

-- Step 3: Update all other tables
UPDATE insumos_alertas SET insumo_catalogo_id = dm.keep_id FROM dup_map dm WHERE insumo_catalogo_id = dm.dup_id;

-- Almacen central - sum and delete duplicates
UPDATE almacen_central ac_keep
SET cantidad_disponible = ac_keep.cantidad_disponible + ac_dup.cantidad_disponible
FROM almacen_central ac_dup
JOIN dup_map dm ON ac_dup.insumo_catalogo_id = dm.dup_id
WHERE ac_keep.insumo_catalogo_id = dm.keep_id;

DELETE FROM almacen_central ac USING dup_map dm WHERE ac.insumo_catalogo_id = dm.dup_id;

-- Other tables
UPDATE almacen_provisional_inventario SET insumo_catalogo_id = dm.keep_id FROM dup_map dm WHERE insumo_catalogo_id = dm.dup_id;
UPDATE insumo_configuracion SET insumo_catalogo_id = dm.keep_id FROM dup_map dm WHERE insumo_catalogo_id = dm.dup_id;
UPDATE folios_insumos SET insumo_id = dm.keep_id FROM dup_map dm WHERE insumo_id = dm.dup_id;
UPDATE folios_insumos_adicionales SET insumo_id = dm.keep_id FROM dup_map dm WHERE insumo_id = dm.dup_id;
UPDATE movimientos_almacen_provisional SET insumo_catalogo_id = dm.keep_id FROM dup_map dm WHERE insumo_catalogo_id = dm.dup_id;
UPDATE documento_agrupado_detalle SET insumo_catalogo_id = dm.keep_id FROM dup_map dm WHERE insumo_catalogo_id = dm.dup_id;
UPDATE documento_segmentado_detalle SET insumo_catalogo_id = dm.keep_id FROM dup_map dm WHERE insumo_catalogo_id = dm.dup_id;
UPDATE transferencias_central_hospital SET insumo_catalogo_id = dm.keep_id FROM dup_map dm WHERE insumo_catalogo_id = dm.dup_id;
UPDATE alertas_transferencia SET insumo_catalogo_id = dm.keep_id FROM dup_map dm WHERE insumo_catalogo_id = dm.dup_id;
UPDATE mermas_transferencia SET insumo_catalogo_id = dm.keep_id FROM dup_map dm WHERE insumo_catalogo_id = dm.dup_id;
UPDATE pedido_items SET insumo_catalogo_id = dm.keep_id FROM dup_map dm WHERE insumo_catalogo_id = dm.dup_id;
UPDATE insumos_requerimientos SET insumo_catalogo_id = dm.keep_id FROM dup_map dm WHERE insumo_catalogo_id = dm.dup_id;

-- Delete duplicate insumo_configuracion (keep oldest)
DELETE FROM insumo_configuracion ic1
WHERE EXISTS (
  SELECT 1 FROM insumo_configuracion ic2 
  WHERE ic2.insumo_catalogo_id = ic1.insumo_catalogo_id 
  AND ic2.created_at < ic1.created_at
);

-- Step 4: Delete duplicate insumos_catalogo
DELETE FROM insumos_catalogo WHERE id IN (SELECT dup_id FROM dup_map);

-- Step 5: Add UNIQUE constraint to prevent future duplicates
ALTER TABLE insumos_catalogo ADD CONSTRAINT insumos_catalogo_nombre_unique UNIQUE (nombre);

DROP TABLE dup_map;
