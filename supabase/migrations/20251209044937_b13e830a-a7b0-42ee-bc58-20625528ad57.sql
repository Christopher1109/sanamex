-- Agregar nuevo rol 'cadena_suministros' al enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cadena_suministros';

-- Agregar columna username a profiles para login por usuario
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Crear índice para búsqueda rápida por username
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Actualizar política de profiles para permitir buscar por username (para login)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Política para buscar profile por username (necesario para login)
CREATE POLICY "Anyone can lookup username for login" 
ON public.profiles 
FOR SELECT 
USING (true);