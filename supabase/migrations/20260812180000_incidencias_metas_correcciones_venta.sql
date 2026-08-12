-- ============================================================
-- Sesión 27-jul-2026 (Sanamex): incidencias solo por Excel,
-- metas de comisiones por vendedor/sucursal, y corrección
-- auditada de método de pago + estatus de venta en Corte de Caja
-- ============================================================

-- A) Fix: el CHECK original de asistencia.incidencia no incluía los
--    valores que el frontend ya usa (permiso_ce, permiso_sg, bono,
--    penalizacion) -> cualquier insert con esos valores fallaba.
ALTER TABLE public.asistencia DROP CONSTRAINT IF EXISTS asistencia_incidencia_check;
ALTER TABLE public.asistencia ADD CONSTRAINT asistencia_incidencia_check
  CHECK (incidencia IS NULL OR incidencia IN (
    'falta','retardo','permiso','permiso_ce','permiso_sg',
    'vacaciones','incapacidad','dia_festivo','descanso_laborado',
    'horas_extra','bono','penalizacion'
  ));

-- B) Decisión 27-jul-2026 (Contabilidad Sanamex): gerente/subgerente
--    ya NO pueden reportar/editar incidencias directamente en el
--    sistema. Siguen mandando el Excel quincenal como hasta ahora;
--    solo admin/super_admin/contador lo cargan e interpretan.
--    Se conserva su acceso de SOLO LECTURA para que puedan ver el
--    estado de sus empleados.
DROP POLICY IF EXISTS asis_all ON public.asistencia;
DO $$ BEGIN
  CREATE POLICY asis_write ON public.asistencia FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY asis_read_gerencia ON public.asistencia FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'subgerente') OR public.has_role(auth.uid(),'auditoria') OR public.has_role(auth.uid(),'auditor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- C) Metas de comisiones por vendedor y por sucursal, editables
--    trimestralmente (pedido de Alejandro, sesión 27-jul-2026).
--    Una meta puede aplicar a un vendedor específico (empleado_id) o
--    a toda una sucursal (sucursal_id) — exactamente uno de los dos.
CREATE TABLE IF NOT EXISTS public.metas_comisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id uuid REFERENCES public.empleados(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE CASCADE,
  anio int NOT NULL,
  trimestre int NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  meta_venta numeric NOT NULL DEFAULT 0,
  porcentaje_comision numeric NOT NULL DEFAULT 0,
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metas_scope_check CHECK (
    (empleado_id IS NOT NULL AND sucursal_id IS NULL) OR
    (empleado_id IS NULL AND sucursal_id IS NOT NULL)
  ),
  CONSTRAINT metas_unica_vendedor UNIQUE (empleado_id, anio, trimestre),
  CONSTRAINT metas_unica_sucursal UNIQUE (sucursal_id, anio, trimestre)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_comisiones TO authenticated;
GRANT ALL ON public.metas_comisiones TO service_role;
ALTER TABLE public.metas_comisiones ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY metas_read ON public.metas_comisiones FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY metas_write ON public.metas_comisiones FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_metas_updated ON public.metas_comisiones;
CREATE TRIGGER trg_metas_updated BEFORE UPDATE ON public.metas_comisiones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- D) Corte de caja: estatus de entrega de la venta (concluida / en
--    ruta) + corrección auditada del método de pago cuando el real
--    difiere del reportado. Se conserva el histórico: nunca se
--    sobreescribe el dato original, se agrega un renglón de
--    corrección con quién y cuándo lo hizo.
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS estatus_entrega text NOT NULL DEFAULT 'concluida'
  CHECK (estatus_entrega IN ('concluida','en_ruta'));

CREATE TABLE IF NOT EXISTS public.venta_correcciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id uuid NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  metodo_pago_anterior text,
  metodo_pago_corregido text NOT NULL,
  estatus_anterior text,
  estatus_corregido text NOT NULL,
  motivo text,
  corregido_por uuid,
  corregido_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.venta_correcciones TO authenticated;
GRANT ALL ON public.venta_correcciones TO service_role;
ALTER TABLE public.venta_correcciones ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY vcorr_read ON public.venta_correcciones FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY vcorr_insert ON public.venta_correcciones FOR INSERT TO authenticated
    WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'contador') OR public.has_role(auth.uid(),'contraloria') OR public.has_role(auth.uid(),'gerente'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RPC: aplica la corrección de forma atómica y deja el registro de
-- auditoría. metodo_pago_corregido se guarda como texto libre (ej.
-- "transferencia") porque venta_pagos permite pagos divididos; el
-- ajuste real de montos por método sigue haciéndose en venta_pagos,
-- esta corrección documenta cuál fue el método/estatus REAL.
CREATE OR REPLACE FUNCTION public.corregir_venta_pago_estatus(
  p_venta_id uuid,
  p_metodo_pago_corregido text,
  p_estatus_corregido text,
  p_motivo text DEFAULT NULL
) RETURNS public.venta_correcciones
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_metodo_anterior text;
  v_estatus_anterior text;
  v_row public.venta_correcciones;
BEGIN
  IF p_estatus_corregido NOT IN ('concluida','en_ruta') THEN
    RAISE EXCEPTION 'estatus_corregido inválido: %', p_estatus_corregido;
  END IF;

  SELECT string_agg(mp.nombre, ' + '), v.estatus_entrega
    INTO v_metodo_anterior, v_estatus_anterior
    FROM public.ventas v
    LEFT JOIN public.venta_pagos vp ON vp.venta_id = v.id
    LEFT JOIN public.metodos_pago mp ON mp.id = vp.metodo_pago_id
   WHERE v.id = p_venta_id
   GROUP BY v.estatus_entrega;

  UPDATE public.ventas SET estatus_entrega = p_estatus_corregido WHERE id = p_venta_id;

  INSERT INTO public.venta_correcciones (
    venta_id, metodo_pago_anterior, metodo_pago_corregido,
    estatus_anterior, estatus_corregido, motivo, corregido_por
  ) VALUES (
    p_venta_id, v_metodo_anterior, p_metodo_pago_corregido,
    v_estatus_anterior, p_estatus_corregido, p_motivo, auth.uid()
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.corregir_venta_pago_estatus(uuid, text, text, text) TO authenticated;
