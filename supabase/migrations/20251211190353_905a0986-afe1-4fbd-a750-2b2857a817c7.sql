
-- Enable RLS on excel_insumo_config table
ALTER TABLE public.excel_insumo_config ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (it's a config table)
CREATE POLICY "Todos pueden ver configuración excel" 
ON public.excel_insumo_config 
FOR SELECT 
USING (true);
