-- Crear el usuario de gerente de operaciones
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Insertar el usuario en auth.users si no existe
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    role,
    aud,
    confirmation_token,
    recovery_token
  )
  SELECT
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'gerente_operaciones@hospital.com',
    crypt('gerente_ops123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nombre":"Gerente de Operaciones"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated',
    '',
    ''
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'gerente_operaciones@hospital.com'
  )
  RETURNING id INTO new_user_id;

  -- Si el usuario fue creado, obtener su ID
  IF new_user_id IS NULL THEN
    SELECT id INTO new_user_id FROM auth.users WHERE email = 'gerente_operaciones@hospital.com';
  END IF;

  -- Crear el perfil si no existe
  INSERT INTO public.profiles (id, nombre)
  VALUES (new_user_id, 'Gerente de Operaciones')
  ON CONFLICT (id) DO NOTHING;

  -- Asignar el rol de gerente_operaciones
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, 'gerente_operaciones')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;