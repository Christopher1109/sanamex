-- Bug critico confirmado: la restriccion CHECK de ordenes_compra.estado nunca
-- se actualizo cuando se diseno el estado intermedio 'confirmada_gerente'
-- (revisar_oc_gerente / autorizar_oc_admin). Resultado: CUALQUIER intento de
-- que un gerente confirmara una OC (accion 'confirmar') fallaba siempre con
--   ERROR 23514: new row for relation "ordenes_compra" violates check
--   constraint "ordenes_compra_estado_check"
-- Reproducido y confirmado con la OC-2026-00047 real (Gerente SMX-SV).

ALTER TABLE public.ordenes_compra DROP CONSTRAINT ordenes_compra_estado_check;
ALTER TABLE public.ordenes_compra ADD CONSTRAINT ordenes_compra_estado_check
  CHECK (estado = ANY (ARRAY[
    'borrador','pendiente_aprobacion','confirmada_gerente',
    'enviada','confirmada','parcial','recibida','cancelada'
  ]));
