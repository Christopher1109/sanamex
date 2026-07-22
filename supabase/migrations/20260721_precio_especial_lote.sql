-- Precio especial por lote (pedido Alejandro, sesión 20-jul-2026, aclarado 21-jul)
-- Mismo código de barras/SKU de siempre. Cada lote YA es un registro separado
-- con su propio costo (rentabilidad por lote ya funcionaba). Lo que faltaba:
-- poder fijarle un precio de venta especial a UN lote (ej. caducidad próxima)
-- sin afectar el precio de los demás lotes del mismo producto.
-- APLICADA DIRECTO EN LOVABLE CLOUD el 21-jul-2026 vía MCP. Este archivo es
-- el registro de la migración para historial del repo.

ALTER TABLE public.lotes
  ADD COLUMN precio_especial numeric CHECK (precio_especial >= 0),
  ADD COLUMN motivo_precio_especial text;

COMMENT ON COLUMN public.lotes.precio_especial IS
  'Precio de venta especial solo para este lote (ej. caducidad próxima). NULL = usa el precio normal del producto. No afecta otros lotes del mismo producto.';
COMMENT ON COLUMN public.lotes.motivo_precio_especial IS
  'caducidad_corta | remate | promocion | otro';

-- venta_lineas.precio_lista ya se agregó en un intento anterior de esta
-- misma migración y se conserva: guarda el precio normal vigente al vender,
-- para poder calcular cuánto se "perdió" por vender a precio especial.
-- (La columna codigo_lote_id de ese intento anterior se eliminó: no se
-- necesita un código escaneable aparte, el precio especial se aplica solo
-- vía FEFO cuando le toca vender ese lote.)

-- process_pos_sale se actualizó para que, al descontar por FEFO, cada
-- porción vendida de un lote con precio_especial use ese precio — incluso
-- si una misma venta reparte entre un lote normal y uno con descuento.
