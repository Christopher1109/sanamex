-- ============================================================
-- SCRIPT PARA EXPORTAR DATOS DESDE LOVABLE CLOUD
-- Ejecuta estas consultas y guarda los resultados como INSERT
-- ============================================================

-- IMPORTANTE: Ejecuta en este ORDEN (tablas padre primero)

-- 1. ESTADOS
-- Copia resultado y genera INSERTs
SELECT 
  'INSERT INTO states (id, name, slug) VALUES (' ||
  quote_literal(id) || ', ' ||
  quote_literal(name) || ', ' ||
  quote_literal(COALESCE(slug, '')) || ');'
FROM states;

-- 2. HOSPITALES
SELECT 
  'INSERT INTO hospitales (id, nombre, codigo, display_name, budget_code, clinic_number, locality, hospital_type, state_id) VALUES (' ||
  quote_literal(id) || ', ' ||
  quote_literal(nombre) || ', ' ||
  quote_literal(COALESCE(codigo, '')) || ', ' ||
  quote_literal(COALESCE(display_name, '')) || ', ' ||
  quote_literal(COALESCE(budget_code, '')) || ', ' ||
  quote_literal(COALESCE(clinic_number, '')) || ', ' ||
  quote_literal(COALESCE(locality, '')) || ', ' ||
  quote_literal(COALESCE(hospital_type, '')) || ', ' ||
  COALESCE(quote_literal(state_id::text), 'NULL') || ');'
FROM hospitales;

-- 3. INSUMOS CATALOGO
SELECT 
  'INSERT INTO insumos_catalogo (id, nombre, clave, descripcion, categoria, unidad, tipo, presentacion, familia_insumo, activo) VALUES (' ||
  quote_literal(id) || ', ' ||
  quote_literal(nombre) || ', ' ||
  quote_literal(COALESCE(clave, '')) || ', ' ||
  quote_literal(COALESCE(descripcion, '')) || ', ' ||
  quote_literal(COALESCE(categoria, '')) || ', ' ||
  quote_literal(COALESCE(unidad, 'pieza')) || ', ' ||
  quote_literal(COALESCE(tipo, 'insumo')) || ', ' ||
  quote_literal(COALESCE(presentacion, '')) || ', ' ||
  quote_literal(COALESCE(familia_insumo, '')) || ', ' ||
  COALESCE(activo::text, 'true') || ');'
FROM insumos_catalogo;

-- 4. CONFIGURACIÓN INSUMOS
SELECT 
  'INSERT INTO insumo_configuracion (id, insumo_catalogo_id, min_global_inventario, max_global_inventario, min_anestesia, max_anestesia, cantidad_default, tipo_anestesia) VALUES (' ||
  quote_literal(id) || ', ' ||
  quote_literal(insumo_catalogo_id) || ', ' ||
  COALESCE(min_global_inventario::text, 'NULL') || ', ' ||
  COALESCE(max_global_inventario::text, 'NULL') || ', ' ||
  COALESCE(min_anestesia::text, 'NULL') || ', ' ||
  COALESCE(max_anestesia::text, 'NULL') || ', ' ||
  COALESCE(cantidad_default::text, 'NULL') || ', ' ||
  quote_literal(COALESCE(tipo_anestesia, '')) || ');'
FROM insumo_configuracion;

-- 5. ANESTESIA INSUMOS
SELECT 
  'INSERT INTO anestesia_insumos (id, tipo_anestesia, insumo_id, id_bcb, categoria, unidad, cantidad_default, cantidad_minima, cantidad_maxima, condicionante, grupo_exclusivo, tipo_limite, nota, orden, activo) VALUES (' ||
  quote_literal(id) || ', ' ||
  quote_literal(tipo_anestesia) || ', ' ||
  COALESCE(quote_literal(insumo_id::text), 'NULL') || ', ' ||
  quote_literal(COALESCE(id_bcb, '')) || ', ' ||
  quote_literal(COALESCE(categoria, '')) || ', ' ||
  quote_literal(COALESCE(unidad, '')) || ', ' ||
  COALESCE(cantidad_default::text, 'NULL') || ', ' ||
  COALESCE(cantidad_minima::text, '0') || ', ' ||
  COALESCE(cantidad_maxima::text, 'NULL') || ', ' ||
  quote_literal(COALESCE(condicionante, '')) || ', ' ||
  quote_literal(COALESCE(grupo_exclusivo, '')) || ', ' ||
  quote_literal(COALESCE(tipo_limite, 'rango')) || ', ' ||
  quote_literal(COALESCE(nota, '')) || ', ' ||
  COALESCE(orden::text, '0') || ', ' ||
  COALESCE(activo::text, 'true') || ');'
FROM anestesia_insumos;

-- 6. ALMACENES
SELECT 
  'INSERT INTO almacenes (id, hospital_id, nombre, descripcion, ubicacion, activo) VALUES (' ||
  quote_literal(id) || ', ' ||
  quote_literal(hospital_id) || ', ' ||
  quote_literal(nombre) || ', ' ||
  quote_literal(COALESCE(descripcion, '')) || ', ' ||
  quote_literal(COALESCE(ubicacion, 'Almacén general')) || ', ' ||
  COALESCE(activo::text, 'true') || ');'
FROM almacenes;

-- 7. USERS (tabla public.users, NO auth.users)
SELECT 
  'INSERT INTO users (id, username, nombre, role, hospital_id, state_id, activo) VALUES (' ||
  quote_literal(id) || ', ' ||
  quote_literal(username) || ', ' ||
  quote_literal(nombre) || ', ' ||
  quote_literal(role::text) || ', ' ||
  COALESCE(quote_literal(hospital_id::text), 'NULL') || ', ' ||
  COALESCE(quote_literal(state_id::text), 'NULL') || ', ' ||
  COALESCE(activo::text, 'true') || ');'
FROM users;

-- NOTA: Para tablas muy grandes (inventario_hospital, inventario_lotes)
-- es mejor usar pg_dump o exportar a CSV desde el dashboard de Supabase
