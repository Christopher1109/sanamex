-- Agregar el rol 'finanzas' al enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finanzas';