-- Reemplazar la función para incluir search_path de forma segura
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;