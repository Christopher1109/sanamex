-- Crear tabla states para los estados/delegaciones del IMSS
CREATE TABLE IF NOT EXISTS states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE states ENABLE ROW LEVEL SECURITY;

-- Política RLS: todos pueden ver los estados
CREATE POLICY "All can view states" ON states FOR SELECT USING (true);