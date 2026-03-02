-- Agregar finanzas al enum de roles si no existe
DO $$ 
BEGIN
  -- El rol 'finanzas' ya debe existir en el enum según el código existente
  -- Verificamos que exista
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'finanzas' AND enumtypid = 'app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'finanzas';
  END IF;
END $$;

-- Crear tabla de tarifas por procedimiento y hospital
CREATE TABLE public.tarifas_procedimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitales(id) ON DELETE CASCADE,
  procedimiento_clave text NOT NULL,
  procedimiento_nombre text NOT NULL,
  tarifa_facturacion numeric(12,2) NOT NULL DEFAULT 0,
  moneda text DEFAULT 'MXN',
  activo boolean DEFAULT true,
  notas text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(hospital_id, procedimiento_clave)
);

-- Habilitar RLS
ALTER TABLE public.tarifas_procedimientos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para tarifas_procedimientos
CREATE POLICY "Gerente operaciones y finanzas pueden ver tarifas"
ON public.tarifas_procedimientos
FOR SELECT
USING (
  has_role(auth.uid(), 'gerente_operaciones') OR 
  has_role(auth.uid(), 'finanzas')
);

CREATE POLICY "Gerente operaciones y finanzas pueden crear tarifas"
ON public.tarifas_procedimientos
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'gerente_operaciones') OR 
  has_role(auth.uid(), 'finanzas')
);

CREATE POLICY "Gerente operaciones y finanzas pueden actualizar tarifas"
ON public.tarifas_procedimientos
FOR UPDATE
USING (
  has_role(auth.uid(), 'gerente_operaciones') OR 
  has_role(auth.uid(), 'finanzas')
);

CREATE POLICY "Gerente operaciones y finanzas pueden eliminar tarifas"
ON public.tarifas_procedimientos
FOR DELETE
USING (
  has_role(auth.uid(), 'gerente_operaciones') OR 
  has_role(auth.uid(), 'finanzas')
);

-- Índices para mejor rendimiento
CREATE INDEX idx_tarifas_hospital ON public.tarifas_procedimientos(hospital_id);
CREATE INDEX idx_tarifas_procedimiento ON public.tarifas_procedimientos(procedimiento_clave);