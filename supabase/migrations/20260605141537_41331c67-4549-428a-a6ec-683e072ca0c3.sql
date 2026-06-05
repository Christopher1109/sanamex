
-- 1) Función de mapeo de sucursales legacy
CREATE OR REPLACE FUNCTION public.mapear_sucursal_legacy(p_codigo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE UPPER(TRIM(COALESCE(p_codigo,'')))
    WHEN 'F37' THEN 'F36'
    WHEN 'F35' THEN NULL
    WHEN '' THEN NULL
    ELSE UPPER(TRIM(p_codigo))
  END;
$$;

-- 2) IVA permite NULL (sin definir vs 0% exento)
ALTER TABLE public.productos ALTER COLUMN iva_tasa DROP DEFAULT;
ALTER TABLE public.productos ALTER COLUMN iva_tasa DROP NOT NULL;

-- 3) Limpieza de datos seed/prueba (mantiene productos, sucursales, almacenes, clientes, proveedores)
TRUNCATE TABLE
  public.venta_pagos,
  public.venta_lineas,
  public.ventas,
  public.compra_lineas,
  public.compras,
  public.traspaso_lineas,
  public.traspasos,
  public.movimientos_inventario,
  public.inventario,
  public.lotes,
  public.pedido_lineas,
  public.pedidos,
  public.ventas_historicas,
  public.notificaciones,
  public.cargas_masivas_historico
RESTART IDENTITY CASCADE;
