-- Fase 1: schema para carga histórica de ventas

ALTER TABLE public.ventas
  ALTER COLUMN cajero_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS caja text NULL,
  ADD COLUMN IF NOT EXISTS cliente_nombre_libre text NULL,
  ADD COLUMN IF NOT EXISTS usuario_libre text NULL,
  ADD COLUMN IF NOT EXISTS vendedor_libre text NULL;

ALTER TABLE public.venta_lineas
  ALTER COLUMN lote_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS costo_unitario numeric NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ventas_hist_idem
  ON public.ventas (sucursal_id, fecha, numero_venta)
  WHERE origen = 'carga_historica';
