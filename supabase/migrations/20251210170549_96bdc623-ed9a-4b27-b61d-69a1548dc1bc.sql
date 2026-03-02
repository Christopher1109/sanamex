-- Habilitar REPLICA IDENTITY FULL para capturar datos completos en updates
ALTER TABLE public.inventario_hospital REPLICA IDENTITY FULL;

-- Agregar tabla a la publicación de realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventario_hospital;