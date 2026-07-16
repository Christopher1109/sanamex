
-- Confirmación al recibir traspasos: capturar cantidad real, merma, notas por línea

ALTER TABLE public.traspaso_lineas
  ADD COLUMN IF NOT EXISTS cantidad_recibida integer,
  ADD COLUMN IF NOT EXISTS merma_recepcion integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notas_recepcion text;

CREATE OR REPLACE FUNCTION public.recibir_traspaso_confirmado(
  p_traspaso_id uuid,
  p_lineas jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_t record;
  v_linea record;
  v_costo numeric;
  v_item jsonb;
  v_cant_recibida integer;
  v_merma integer;
  v_faltante integer;
  v_neto integer;
  v_notas text;
BEGIN
  SELECT * INTO v_t FROM public.traspasos WHERE id = p_traspaso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no existe'; END IF;
  IF v_t.estado <> 'enviado' THEN
    RAISE EXCEPTION 'Solo se pueden recibir traspasos enviados (estado actual: %)', v_t.estado;
  END IF;

  FOR v_linea IN SELECT * FROM public.traspaso_lineas WHERE traspaso_id = p_traspaso_id LOOP
    -- Buscar la confirmación de esta línea (o usar la cantidad enviada como default)
    v_item := NULL;
    FOR v_item IN SELECT jsonb_array_elements(p_lineas) LOOP
      IF (v_item->>'linea_id')::uuid = v_linea.id THEN EXIT; END IF;
      v_item := NULL;
    END LOOP;

    v_cant_recibida := COALESCE((v_item->>'cantidad_recibida')::int, v_linea.cantidad);
    v_merma        := GREATEST(COALESCE((v_item->>'merma')::int, 0), 0);
    v_notas        := v_item->>'notas';

    IF v_cant_recibida < 0 THEN v_cant_recibida := 0; END IF;
    IF v_cant_recibida > v_linea.cantidad THEN v_cant_recibida := v_linea.cantidad; END IF;
    IF v_merma > v_cant_recibida THEN v_merma := v_cant_recibida; END IF;

    v_faltante := v_linea.cantidad - v_cant_recibida;
    v_neto     := v_cant_recibida - v_merma;

    SELECT costo_unitario INTO v_costo FROM public.lotes WHERE id = v_linea.lote_id;

    -- Sumar al inventario destino solo la cantidad neta usable
    IF v_neto > 0 THEN
      INSERT INTO public.inventario (almacen_id, lote_id, cantidad)
        VALUES (v_t.almacen_destino_id, v_linea.lote_id, v_neto)
      ON CONFLICT (almacen_id, lote_id)
        DO UPDATE SET cantidad = inventario.cantidad + EXCLUDED.cantidad, updated_at = now();

      INSERT INTO public.movimientos_inventario
        (almacen_id, lote_id, tipo, cantidad, costo_unitario,
         referencia_tipo, referencia_id, usuario_id, sucursal_id, notas)
      VALUES
        (v_t.almacen_destino_id, v_linea.lote_id, 'traspaso_entrada', v_neto, v_costo,
         'traspaso', p_traspaso_id, v_user, v_t.sucursal_destino_id,
         'Recepción traspaso ' || v_t.numero_traspaso);
    END IF;

    -- Registrar merma (producto llegó roto/dañado)
    IF v_merma > 0 THEN
      INSERT INTO public.movimientos_inventario
        (almacen_id, lote_id, tipo, cantidad, costo_unitario,
         referencia_tipo, referencia_id, usuario_id, sucursal_id, notas)
      VALUES
        (v_t.almacen_destino_id, v_linea.lote_id, 'merma', v_merma, v_costo,
         'traspaso', p_traspaso_id, v_user, v_t.sucursal_destino_id,
         'Merma en recepción traspaso ' || v_t.numero_traspaso ||
         COALESCE(' — ' || v_notas, ''));
    END IF;

    -- Registrar faltante (menos piezas de las enviadas)
    IF v_faltante > 0 THEN
      INSERT INTO public.movimientos_inventario
        (almacen_id, lote_id, tipo, cantidad, costo_unitario,
         referencia_tipo, referencia_id, usuario_id, sucursal_id, notas)
      VALUES
        (v_t.almacen_destino_id, v_linea.lote_id, 'merma', v_faltante, v_costo,
         'traspaso', p_traspaso_id, v_user, v_t.sucursal_destino_id,
         'Faltante en recepción traspaso ' || v_t.numero_traspaso);
    END IF;

    UPDATE public.traspaso_lineas
       SET cantidad_recibida = v_cant_recibida,
           merma_recepcion   = v_merma,
           notas_recepcion   = v_notas
     WHERE id = v_linea.id;
  END LOOP;

  UPDATE public.traspasos
     SET estado='recibido', recibido_por=v_user, fecha_recepcion=now(), updated_at=now()
   WHERE id = p_traspaso_id;

  RETURN jsonb_build_object('id', p_traspaso_id, 'estado', 'recibido');
END $$;

GRANT EXECUTE ON FUNCTION public.recibir_traspaso_confirmado(uuid, jsonb) TO authenticated;
