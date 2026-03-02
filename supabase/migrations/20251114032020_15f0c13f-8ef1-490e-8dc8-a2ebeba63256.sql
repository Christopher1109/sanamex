-- Crear tipos enum adicionales
CREATE TYPE genero AS ENUM ('masculino', 'femenino');
CREATE TYPE tipo_anestesia AS ENUM ('general', 'regional', 'local', 'sedacion');
CREATE TYPE especialidad_medica AS ENUM ('anestesiologia', 'cirugia_general', 'traumatologia', 'ginecologia', 'urologia', 'otra');
CREATE TYPE estado_folio AS ENUM ('activo', 'cancelado', 'completado');
CREATE TYPE estado_traspaso AS ENUM ('pendiente', 'aprobado', 'rechazado', 'completado');

-- Agregar columnas faltantes a hospitales
ALTER TABLE hospitales ADD COLUMN codigo TEXT;
ALTER TABLE hospitales ADD COLUMN estado_id UUID;
ALTER TABLE hospitales ADD COLUMN empresa_id UUID;

-- Tabla de médicos
CREATE TABLE medicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  especialidad especialidad_medica NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de procedimientos
CREATE TABLE procedimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de folios
CREATE TABLE folios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_folio TEXT NOT NULL UNIQUE,
  hospital_id UUID REFERENCES hospitales(id),
  medico_id UUID REFERENCES medicos(id),
  tipo_anestesia tipo_anestesia,
  estado estado_folio DEFAULT 'activo',
  fecha DATE DEFAULT CURRENT_DATE,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de insumos de folio
CREATE TABLE folio_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id UUID REFERENCES folios(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES insumos(id),
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de paquetes de anestesia
CREATE TABLE paquetes_anestesia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo tipo_anestesia NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de insumos en paquetes
CREATE TABLE paquete_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paquete_id UUID REFERENCES paquetes_anestesia(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES insumos(id),
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de traspasos
CREATE TABLE traspasos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_traspaso TEXT NOT NULL UNIQUE,
  unidad_origen TEXT,
  unidad_destino TEXT,
  estado estado_traspaso DEFAULT 'pendiente',
  fecha DATE DEFAULT CURRENT_DATE,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de insumos en traspasos
CREATE TABLE traspaso_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traspaso_id UUID REFERENCES traspasos(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES insumos(id),
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en nuevas tablas
ALTER TABLE medicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE folios ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE paquetes_anestesia ENABLE ROW LEVEL SECURITY;
ALTER TABLE paquete_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE traspasos ENABLE ROW LEVEL SECURITY;
ALTER TABLE traspaso_insumos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS básicas para las nuevas tablas
CREATE POLICY "All can view medicos" ON medicos FOR SELECT USING (true);
CREATE POLICY "All can view procedimientos" ON procedimientos FOR SELECT USING (true);
CREATE POLICY "All can view folios" ON folios FOR SELECT USING (true);
CREATE POLICY "All can view folio_insumos" ON folio_insumos FOR SELECT USING (true);
CREATE POLICY "All can view paquetes_anestesia" ON paquetes_anestesia FOR SELECT USING (true);
CREATE POLICY "All can view paquete_insumos" ON paquete_insumos FOR SELECT USING (true);
CREATE POLICY "All can view traspasos" ON traspasos FOR SELECT USING (true);
CREATE POLICY "All can view traspaso_insumos" ON traspaso_insumos FOR SELECT USING (true);