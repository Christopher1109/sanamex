UPDATE public.compra_lineas cl
SET precio_unitario_estimado = p,
    precio_unitario_real = p
FROM (
  SELECT id, ROUND((25 + random()*450)::numeric, 2) AS p
  FROM public.compra_lineas
  WHERE compra_id IN (SELECT id FROM public.compras WHERE notas='DEMO_SEED')
) src
WHERE cl.id = src.id;

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