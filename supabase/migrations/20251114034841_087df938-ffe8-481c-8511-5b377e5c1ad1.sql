-- Crear tabla de usuarios con roles y asignaciones hospitalarias
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,                      -- 'gerente_operaciones', 'almacenista', 'lider', 'auxiliar', 'supervisor'
  state_name TEXT,                         -- para filtrar por estado
  hospital_budget_code TEXT,               -- hospital exacto (para roles de hospital)
  hospital_display_name TEXT,              -- nombre bonito del hospital
  supervisor_group INTEGER,                -- grupo de hospitales asignados a un supervisor (para agrupar de 4 en 4)
  assigned_hospitals TEXT,                 -- lista de hospitales asignados (para supervisores)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Política para que los usuarios puedan ver su propia información
CREATE POLICY "Users can view their own data"
ON users
FOR SELECT
USING (true);

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_hospital_budget_code ON users(hospital_budget_code);
CREATE INDEX IF NOT EXISTS idx_users_state_name ON users(state_name);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_timestamp
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_users_updated_at();