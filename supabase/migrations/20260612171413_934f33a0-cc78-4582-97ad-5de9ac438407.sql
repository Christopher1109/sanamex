UPDATE public.compras c
SET subtotal = sub.s,
    impuestos = ROUND(sub.s * 0.16, 2),
    total = ROUND(sub.s * 1.16, 2)
FROM (
  SELECT compra_id, SUM(cantidad_recibida * precio_unitario_real)::numeric AS s
  FROM public.compra_lineas
  GROUP BY compra_id
) sub
WHERE c.id = sub.compra_id
  AND c.notas = 'DEMO_SEED';