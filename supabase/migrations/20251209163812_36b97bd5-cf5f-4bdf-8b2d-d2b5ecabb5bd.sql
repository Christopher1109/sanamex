-- Habilitar realtime para las tablas de documentos y pedidos
ALTER PUBLICATION supabase_realtime ADD TABLE public.documentos_necesidades_segmentado;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documentos_necesidades_agrupado;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos_compra;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transferencias_central_hospital;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas_transferencia;