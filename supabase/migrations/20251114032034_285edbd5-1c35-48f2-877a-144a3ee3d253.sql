-- Crear tabla de unidades
CREATE TABLE unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  hospital_id UUID REFERENCES hospitales(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;

-- Política RLS básica
CREATE POLICY "All can view unidades" ON unidades FOR SELECT USING (true);