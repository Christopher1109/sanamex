-- Enable REPLICA IDENTITY FULL for inventario_hospital to ensure complete row data in realtime updates
ALTER TABLE public.inventario_hospital REPLICA IDENTITY FULL;

-- Also enable for almacen_provisional_inventario for consistency
ALTER TABLE public.almacen_provisional_inventario REPLICA IDENTITY FULL;