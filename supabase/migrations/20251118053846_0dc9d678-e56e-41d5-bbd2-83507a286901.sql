-- Corregir el usuario gerente_operaciones
-- Los campos confirmation_token, recovery_token deben ser NULL, no empty strings

UPDATE auth.users
SET 
  confirmation_token = NULL,
  recovery_token = NULL,
  email_change = NULL,
  email_change_token_new = NULL,
  email_change_token_current = NULL
WHERE email = 'gerente_operaciones@hospital.com';

-- Asegurarnos de que exista un identity para este usuario con provider_id
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  u.id::text,
  u.id,
  format('{"sub":"%s","email":"%s"}', u.id::text, u.email)::jsonb,
  'email',
  now(),
  now(),
  now()
FROM auth.users u
WHERE u.email = 'gerente_operaciones@hospital.com'
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i 
    WHERE i.user_id = u.id AND i.provider = 'email'
  );