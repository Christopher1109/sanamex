-- ============================================================
-- DATOS DE CONFIGURACIÓN - CB Médica Anestesia
-- Ejecutar DESPUÉS del schema
-- ============================================================

-- ESTADOS
INSERT INTO public.states (id, name, slug) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Nuevo León', 'nuevo-leon'),
('550e8400-e29b-41d4-a716-446655440002', 'Ciudad de México', 'cdmx'),
('550e8400-e29b-41d4-a716-446655440003', 'Jalisco', 'jalisco'),
('550e8400-e29b-41d4-a716-446655440004', 'Chihuahua', 'chihuahua'),
('550e8400-e29b-41d4-a716-446655440005', 'Baja California', 'baja-california'),
('550e8400-e29b-41d4-a716-446655440006', 'Sonora', 'sonora'),
('550e8400-e29b-41d4-a716-446655440007', 'Coahuila', 'coahuila'),
('550e8400-e29b-41d4-a716-446655440008', 'Sinaloa', 'sinaloa'),
('550e8400-e29b-41d4-a716-446655440009', 'Veracruz', 'veracruz'),
('550e8400-e29b-41d4-a716-446655440010', 'Puebla', 'puebla')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- CATÁLOGO DE PROCEDIMIENTOS DE ANESTESIA
-- ============================================================

-- Los procedimientos disponibles son:
-- 19.01.001 - Anestesia General Balanceada Adulto
-- 19.01.002 - Anestesia General de Alta Especialidad  
-- 19.01.003 - Anestesia General Endovenosa
-- 19.01.004 - Anestesia General Balanceada Pediátrica
-- 19.01.005 - Anestesia Loco Regional
-- 19.01.006 - Sedación
-- 19.01.007 - Anestesia de Alta Especialidad en Neurocirugía
-- 19.01.008 - Anestesia de Alta Especialidad en Trasplante Hepático
-- 19.01.009 - Anestesia de Alta Especialidad en Trasplante Renal
-- 19.01.010 - Cuidados Anestésicos Monitoreados

-- ============================================================
-- NOTA IMPORTANTE:
-- ============================================================
-- Los datos completos de hospitales, insumos_catalogo, 
-- inventario_hospital, anestesia_insumos, etc. deben exportarse
-- directamente desde la base de datos de producción usando:
--
-- 1. Supabase Dashboard > Table Editor > Export CSV
-- 2. O via pg_dump
--
-- Tablas a exportar:
-- - hospitales
-- - insumos_catalogo  
-- - insumo_configuracion
-- - anestesia_insumos
-- - inventario_hospital
-- - almacenes
-- - states
-- - users
-- ============================================================

-- Para exportar datos completos, ejecuta en tu Supabase actual:
/*
COPY (SELECT * FROM hospitales) TO '/tmp/hospitales.csv' WITH CSV HEADER;
COPY (SELECT * FROM insumos_catalogo) TO '/tmp/insumos_catalogo.csv' WITH CSV HEADER;
COPY (SELECT * FROM insumo_configuracion) TO '/tmp/insumo_configuracion.csv' WITH CSV HEADER;
COPY (SELECT * FROM anestesia_insumos) TO '/tmp/anestesia_insumos.csv' WITH CSV HEADER;
COPY (SELECT * FROM inventario_hospital) TO '/tmp/inventario_hospital.csv' WITH CSV HEADER;
COPY (SELECT * FROM almacenes) TO '/tmp/almacenes.csv' WITH CSV HEADER;
COPY (SELECT * FROM states) TO '/tmp/states.csv' WITH CSV HEADER;
*/
