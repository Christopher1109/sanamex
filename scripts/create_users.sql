-- ============================================================
-- SCRIPT PARA CREAR USUARIOS
-- Sistema CB Médica - Gestión de Anestesia
-- ============================================================
-- 
-- NOTA: Este script debe ejecutarse DESPUÉS de configurar
-- las tablas y ANTES de que los usuarios accedan al sistema.
--
-- Las contraseñas siguen el patrón: {username}2024!
-- Ejemplo: auxiliar01 -> auxiliar012024!
-- ============================================================

-- Este script crea la estructura de usuarios.
-- Los usuarios de auth.users se crean via Edge Function o Dashboard.

-- Usuarios base del sistema (referencia)
INSERT INTO public.users (username, role, hospital_budget_code, hospital_display_name, state_name) VALUES
-- Roles globales
('gerente_operaciones', 'gerente_operaciones', NULL, NULL, NULL),
('gerente_almacen', 'gerente_almacen', NULL, NULL, NULL),
('cadena_suministros', 'cadena_suministros', NULL, NULL, NULL),
('finanzas', 'finanzas', NULL, NULL, NULL),

-- Auxiliares (1 por hospital)
('auxiliar01', 'auxiliar', '20A2011C2153', 'HCARD 34 Monterrey', 'UMAE HC 34 CMN Monterrey'),
('auxiliar02', 'auxiliar', '37B5071B2153', 'HCARD S/N Cuauhtémoc', 'UMAE HC CMN Siglo XXI'),
-- ... (continuar con todos los hospitales)

-- Almacenistas (1 por hospital)
('almacenista01', 'almacenista', '20A2011C2153', 'HCARD 34 Monterrey', 'UMAE HC 34 CMN Monterrey'),
('almacenista02', 'almacenista', '37B5071B2153', 'HCARD S/N Cuauhtémoc', 'UMAE HC CMN Siglo XXI'),
-- ... (continuar con todos los hospitales)

-- Líderes (1 por hospital)
('lider01', 'lider', '20A2011C2153', 'HCARD 34 Monterrey', 'UMAE HC 34 CMN Monterrey'),
('lider02', 'lider', '37B5071B2153', 'HCARD S/N Cuauhtémoc', 'UMAE HC CMN Siglo XXI'),
-- ... (continuar con todos los hospitales)

-- Supervisores (1 por cada 4 hospitales del mismo estado)
('supervisor01', 'supervisor', NULL, NULL, 'UMAE HC 34 CMN Monterrey'),
('supervisor02', 'supervisor', NULL, NULL, 'UMAE HC CMN Siglo XXI')
-- ... (continuar según estructura organizacional)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Para crear usuarios en auth.users, usa la Edge Function:
-- POST /functions/v1/setup-all-users
-- 
-- O crea manualmente en Supabase Dashboard > Authentication > Users
-- ============================================================
