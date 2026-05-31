
ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS plazo_pago_dias integer,
  ADD COLUMN IF NOT EXISTS condiciones text,
  ADD COLUMN IF NOT EXISTS correo_aux text,
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS cuenta_banco text,
  ADD COLUMN IF NOT EXISTS direccion_fiscal text,
  ADD COLUMN IF NOT EXISTS constancia_situacion_fiscal_url text,
  ADD COLUMN IF NOT EXISTS aviso_funcionamiento_url text,
  ADD COLUMN IF NOT EXISTS comprobante_domicilio_url text,
  ADD COLUMN IF NOT EXISTS identificacion_oficial_url text,
  ADD COLUMN IF NOT EXISTS notas text;
