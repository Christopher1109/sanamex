-- Limpiar duplicados previos: conservar el primer reporte de cada orden.
DELETE FROM public.bitacora_recepcion b
 WHERE b.orden_id IS NOT NULL
   AND b.id <> (
     SELECT b2.id FROM public.bitacora_recepcion b2
      WHERE b2.orden_id = b.orden_id
      ORDER BY b2.created_at ASC, b2.id ASC
      LIMIT 1
   );

CREATE UNIQUE INDEX IF NOT EXISTS bitacora_recepcion_orden_unico
  ON public.bitacora_recepcion (orden_id)
  WHERE orden_id IS NOT NULL;