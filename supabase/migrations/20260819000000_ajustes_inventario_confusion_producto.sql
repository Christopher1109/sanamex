-- Junta SANAMEX 15-ago-2026: los ajustes de inventario deben tener un motivo
-- obligatorio como primer paso, y "confusión de producto" (se vendió el
-- producto equivocado) es un caso especial que debe ajustar automáticamente
-- las existencias de AMBOS productos: sube el que se había descontado de más
-- (el vendido por error) y baja el que realmente se vendió (el correcto).
--
-- No se toca la función registrar_ajuste_inventario existente (no está en
-- migraciones de este repo, se creó fuera de git): en vez de redefinirla a
-- ciegas, el flujo de confusión de producto la llama DOS veces desde el
-- frontend, una por cada producto involucrado. Esta migración solo agrega
-- la forma de identificar el motivo especial de manera robusta (no por
-- texto) y lo da de alta si no existe.

ALTER TABLE public.motivos_ajuste
  ADD COLUMN IF NOT EXISTS es_confusion_producto BOOLEAN NOT NULL DEFAULT false;

INSERT INTO public.motivos_ajuste (nombre, tipo, es_confusion_producto)
SELECT 'Confusión de producto', 'ajuste', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.motivos_ajuste WHERE es_confusion_producto = true
);
