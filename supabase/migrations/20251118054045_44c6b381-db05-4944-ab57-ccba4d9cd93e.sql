-- Eliminar el usuario existente completamente y recrearlo de forma limpia
-- Primero eliminar identities
DELETE FROM auth.identities 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'gerente_operaciones@hospital.com'
);

-- Eliminar user_roles
DELETE FROM public.user_roles 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'gerente_operaciones@hospital.com'
);

-- Eliminar profiles
DELETE FROM public.profiles 
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'gerente_operaciones@hospital.com'
);

-- Eliminar el usuario
DELETE FROM auth.users WHERE email = 'gerente_operaciones@hospital.com';