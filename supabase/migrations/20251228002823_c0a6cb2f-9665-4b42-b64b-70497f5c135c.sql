-- ========================================
-- 1. TABLA DE PROVEEDORES
-- ========================================
CREATE TABLE public.proveedores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  rfc TEXT,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  banco TEXT,
  cuenta_bancaria TEXT,
  clabe TEXT,
  categoria_productos TEXT,
  dias_credito INTEGER DEFAULT 0,
  condiciones_pago TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Todos pueden ver proveedores" 
ON public.proveedores FOR SELECT 
USING (true);

CREATE POLICY "Finanzas y gerentes pueden gestionar proveedores" 
ON public.proveedores FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'finanzas'::app_role) OR has_role(auth.uid(), 'gerente_almacen'::app_role) OR has_role(auth.uid(), 'gerente_operaciones'::app_role));

CREATE POLICY "Finanzas y gerentes pueden actualizar proveedores" 
ON public.proveedores FOR UPDATE 
USING (has_role(auth.uid(), 'finanzas'::app_role) OR has_role(auth.uid(), 'gerente_almacen'::app_role) OR has_role(auth.uid(), 'gerente_operaciones'::app_role));

-- Trigger para updated_at
CREATE TRIGGER update_proveedores_updated_at
BEFORE UPDATE ON public.proveedores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insertar datos ficticios de proveedores
INSERT INTO public.proveedores (nombre, rfc, direccion, telefono, email, banco, cuenta_bancaria, clabe, categoria_productos, dias_credito, condiciones_pago) VALUES
('Distribuidora Médica del Norte S.A. de C.V.', 'DMN850101ABC', 'Av. Industrias 1234, Col. Centro, Monterrey, N.L.', '8181234567', 'ventas@distrimedica.mx', 'BBVA', '0123456789', '012345678901234567', 'Insumos médicos generales', 30, 'Pago a 30 días'),
('Farmacéuticos Especializados S.A.', 'FES900215XYZ', 'Calle Salud 567, Col. Doctores, CDMX', '5551234567', 'contacto@farmesp.com', 'Banorte', '9876543210', '987654321098765432', 'Medicamentos y anestésicos', 45, 'Pago a 45 días'),
('Insumos Hospitalarios del Bajío', 'IHB880320QRS', 'Blvd. López Mateos 890, León, Gto.', '4771234567', 'ventas@insumosbajio.mx', 'Santander', '1357924680', '135792468013579246', 'Material quirúrgico', 15, 'Pago a 15 días'),
('Suministros Clínicos Occidentales', 'SCO950430TUV', 'Av. Vallarta 2345, Guadalajara, Jal.', '3331234567', 'pedidos@sumclinicos.com', 'HSBC', '2468013579', '246801357924680135', 'Jeringas y material desechable', 30, 'Pago a 30 días'),
('Medical Supplies International', 'MSI870615WXY', 'Calle Industrial 678, Tijuana, B.C.', '6641234567', 'orders@medsupplies.mx', 'Citibanamex', '3692581470', '369258147036925814', 'Equipos y consumibles importados', 60, 'Pago a 60 días');

-- ========================================
-- 2. CATÁLOGO DE IMPUESTOS
-- ========================================
CREATE TABLE public.catalogo_impuestos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  tasa NUMERIC(5,4) NOT NULL, -- Ej: 0.16 para 16%
  tipo TEXT NOT NULL DEFAULT 'cargo', -- 'cargo' suma, 'retencion' resta
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.catalogo_impuestos ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Todos pueden ver catálogo de impuestos" 
ON public.catalogo_impuestos FOR SELECT 
USING (true);

CREATE POLICY "Finanzas puede gestionar impuestos" 
ON public.catalogo_impuestos FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'finanzas'::app_role));

CREATE POLICY "Finanzas puede actualizar impuestos" 
ON public.catalogo_impuestos FOR UPDATE 
USING (has_role(auth.uid(), 'finanzas'::app_role));

CREATE POLICY "Finanzas puede eliminar impuestos" 
ON public.catalogo_impuestos FOR DELETE 
USING (has_role(auth.uid(), 'finanzas'::app_role));

-- Trigger para updated_at
CREATE TRIGGER update_catalogo_impuestos_updated_at
BEFORE UPDATE ON public.catalogo_impuestos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insertar impuestos comunes
INSERT INTO public.catalogo_impuestos (nombre, descripcion, tasa, tipo) VALUES
('IVA 16%', 'Impuesto al Valor Agregado', 0.16, 'cargo'),
('Retención ISR 10%', 'Retención de Impuesto Sobre la Renta', 0.10, 'retencion'),
('Retención IVA 10.67%', 'Retención de IVA para servicios', 0.1067, 'retencion'),
('IVA 8%', 'IVA tasa fronteriza', 0.08, 'cargo');

-- ========================================
-- 3. IMPUESTOS APLICADOS A ÓRDENES DE COMPRA
-- ========================================
CREATE TABLE public.orden_compra_impuestos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_compra_id UUID NOT NULL REFERENCES public.pedidos_compra(id) ON DELETE CASCADE,
  impuesto_id UUID NOT NULL REFERENCES public.catalogo_impuestos(id),
  tasa_aplicada NUMERIC(5,4) NOT NULL,
  monto NUMERIC(12,2) NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'cargo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orden_compra_impuestos ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Usuarios pueden ver impuestos de órdenes" 
ON public.orden_compra_impuestos FOR SELECT 
USING (has_role(auth.uid(), 'finanzas'::app_role) OR has_role(auth.uid(), 'gerente_almacen'::app_role) OR has_role(auth.uid(), 'gerente_operaciones'::app_role) OR has_role(auth.uid(), 'cadena_suministros'::app_role));

CREATE POLICY "Gerente almacén puede crear impuestos de órdenes" 
ON public.orden_compra_impuestos FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'gerente_almacen'::app_role) OR has_role(auth.uid(), 'finanzas'::app_role));

CREATE POLICY "Gerente almacén puede actualizar impuestos de órdenes" 
ON public.orden_compra_impuestos FOR UPDATE 
USING (has_role(auth.uid(), 'gerente_almacen'::app_role) OR has_role(auth.uid(), 'finanzas'::app_role));

CREATE POLICY "Pueden eliminar impuestos de órdenes" 
ON public.orden_compra_impuestos FOR DELETE 
USING (has_role(auth.uid(), 'gerente_almacen'::app_role) OR has_role(auth.uid(), 'finanzas'::app_role));

-- ========================================
-- 4. COMPROBANTES DE PAGO
-- ========================================
CREATE TABLE public.comprobantes_pago (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_compra_id UUID NOT NULL REFERENCES public.pedidos_compra(id) ON DELETE CASCADE,
  tipo_comprobante TEXT NOT NULL, -- 'transferencia', 'cheque', 'efectivo', 'otro'
  numero_referencia TEXT,
  archivo_url TEXT,
  archivo_nombre TEXT,
  monto_pagado NUMERIC(12,2) NOT NULL,
  fecha_pago TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notas TEXT,
  registrado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.comprobantes_pago ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Finanzas puede ver comprobantes" 
ON public.comprobantes_pago FOR SELECT 
USING (has_role(auth.uid(), 'finanzas'::app_role) OR has_role(auth.uid(), 'gerente_almacen'::app_role) OR has_role(auth.uid(), 'gerente_operaciones'::app_role));

CREATE POLICY "Finanzas puede crear comprobantes" 
ON public.comprobantes_pago FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'finanzas'::app_role));

-- ========================================
-- 5. AÑADIR CAMPOS A PEDIDOS_COMPRA
-- ========================================
ALTER TABLE public.pedidos_compra 
ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES public.proveedores(id),
ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_impuestos NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_retenciones NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS pagado_at TIMESTAMP WITH TIME ZONE;

-- ========================================
-- 6. MODIFICAR PRESUPUESTOS_HOSPITAL PARA LÍMITE ANUAL
-- ========================================
ALTER TABLE public.presupuestos_hospital 
ADD COLUMN IF NOT EXISTS limite_anual NUMERIC(14,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS es_extension BOOLEAN DEFAULT false;

-- Crear storage bucket para comprobantes
INSERT INTO storage.buckets (id, name, public) 
VALUES ('comprobantes-pago', 'comprobantes-pago', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para comprobantes
CREATE POLICY "Finanzas puede subir comprobantes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'comprobantes-pago' AND has_role(auth.uid(), 'finanzas'::app_role));

CREATE POLICY "Usuarios autorizados pueden ver comprobantes"
ON storage.objects FOR SELECT
USING (bucket_id = 'comprobantes-pago' AND (has_role(auth.uid(), 'finanzas'::app_role) OR has_role(auth.uid(), 'gerente_almacen'::app_role) OR has_role(auth.uid(), 'gerente_operaciones'::app_role)));