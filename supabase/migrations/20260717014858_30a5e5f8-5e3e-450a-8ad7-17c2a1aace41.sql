
-- 1) Estado por sucursal
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS estado text;
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS estado_confirmado boolean NOT NULL DEFAULT false;

UPDATE public.sucursales SET estado='MEX', estado_confirmado=true  WHERE codigo='ECA';
UPDATE public.sucursales SET estado='CDMX', estado_confirmado=true WHERE codigo IN ('F36','GH');
UPDATE public.sucursales SET estado='MEX', estado_confirmado=false WHERE codigo='SV';    -- San Vicente Chicoloapan típicamente Edomex, marcar pendiente confirmar
UPDATE public.sucursales SET estado='CDMX', estado_confirmado=false WHERE codigo='CEDIS';

-- 2) Tabla de tasas ISN por estado (versionables)
CREATE TABLE IF NOT EXISTS public.isn_tasas_estado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estado text NOT NULL,
  tasa_pct numeric(6,4) NOT NULL,
  vigencia_desde date NOT NULL DEFAULT CURRENT_DATE,
  confirmado boolean NOT NULL DEFAULT false,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(estado, vigencia_desde)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.isn_tasas_estado TO authenticated;
GRANT ALL ON public.isn_tasas_estado TO service_role;
ALTER TABLE public.isn_tasas_estado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS isn_tasas_read ON public.isn_tasas_estado;
CREATE POLICY isn_tasas_read ON public.isn_tasas_estado FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR
  has_role(auth.uid(),'contador') OR has_role(auth.uid(),'contabilidad') OR
  has_role(auth.uid(),'contraloria') OR has_role(auth.uid(),'direccion') OR
  has_module_access(auth.uid(),'nomina','consultar') OR
  has_module_access(auth.uid(),'impuestos','consultar')
);
DROP POLICY IF EXISTS isn_tasas_write ON public.isn_tasas_estado;
CREATE POLICY isn_tasas_write ON public.isn_tasas_estado FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'contador') OR has_role(auth.uid(),'contabilidad'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'contador') OR has_role(auth.uid(),'contabilidad'));

INSERT INTO public.isn_tasas_estado(estado, tasa_pct, confirmado, nota)
VALUES
  ('MEX', 3.0, true,  'Estado de México — tasa 3% vigente 2026'),
  ('CDMX', 3.0, false, 'CDMX — 3% default heredado; PENDIENTE DE CONFIRMAR con contador')
ON CONFLICT (estado, vigencia_desde) DO NOTHING;

-- 3) Regla contable de sueldos (ya existe activa) — asegurar presencia idempotente
INSERT INTO public.reglas_contabilizacion(origen, descripcion, activo)
VALUES ('nomina_sueldos', 'Nómina — Sueldos y salarios (gasto)', true)
ON CONFLICT DO NOTHING;

-- 4) RPC dispersar_nomina — genera movimiento bancario de salida idempotente
CREATE OR REPLACE FUNCTION public.dispersar_nomina(
  p_periodo_inicio date, p_periodo_fin date,
  p_sucursal_id uuid, p_cuenta_bancaria_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_corte date;
  v_ref text;
  v_neto numeric := 0;
  v_count int := 0;
  v_existing uuid;
  v_suc text;
BEGIN
  IF NOT (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin')
       OR has_module_access(auth.uid(),'nomina','autorizar')) THEN
    RAISE EXCEPTION 'No autorizado para dispersar nómina';
  END IF;

  SELECT COALESCE(fecha_corte_automatico, CURRENT_DATE) INTO v_corte FROM contabilidad_parametros WHERE id=1;
  IF p_periodo_fin < v_corte THEN
    RAISE EXCEPTION 'Periodo anterior a fecha de corte contable (%): no se genera movimiento bancario', v_corte;
  END IF;

  SELECT codigo INTO v_suc FROM sucursales WHERE id = p_sucursal_id;
  v_ref := 'NOMINA:' || to_char(p_periodo_inicio,'YYYYMMDD') || '-' || to_char(p_periodo_fin,'YYYYMMDD') || ':' || COALESCE(v_suc,'GLOBAL');

  -- Idempotencia
  SELECT id INTO v_existing FROM movimientos_bancarios WHERE referencia = v_ref LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'ya_existe', true, 'movimiento_id', v_existing, 'referencia', v_ref);
  END IF;

  SELECT COALESCE(SUM(rn.neto_pagado),0), COUNT(*)
    INTO v_neto, v_count
  FROM recibos_nomina rn
  JOIN empleados e ON e.id = rn.empleado_id
  WHERE rn.periodo_inicio = p_periodo_inicio
    AND rn.periodo_fin = p_periodo_fin
    AND rn.estatus IN ('timbrado','pagado')
    AND rn.es_prueba = false
    AND (p_sucursal_id IS NULL OR e.sucursal_id = p_sucursal_id);

  IF v_neto <= 0 THEN
    RAISE EXCEPTION 'Sin recibos timbrados en periodo para dispersión (recibos: %)', v_count;
  END IF;

  INSERT INTO movimientos_bancarios(
    cuenta_id, fecha, concepto, referencia, cargo, abono, origen, notas
  ) VALUES (
    p_cuenta_bancaria_id, p_periodo_fin,
    'Dispersión nómina ' || to_char(p_periodo_inicio,'DD/MM/YYYY') || ' - ' || to_char(p_periodo_fin,'DD/MM/YYYY'),
    v_ref, v_neto, 0, 'nomina',
    v_count || ' recibos, sucursal ' || COALESCE(v_suc,'GLOBAL')
  ) RETURNING id INTO v_existing;

  -- Marcar recibos como pagados
  UPDATE recibos_nomina SET estatus='pagado', updated_at=now()
  WHERE periodo_inicio=p_periodo_inicio AND periodo_fin=p_periodo_fin
    AND estatus='timbrado' AND es_prueba=false
    AND empleado_id IN (SELECT id FROM empleados WHERE p_sucursal_id IS NULL OR sucursal_id=p_sucursal_id);

  RETURN jsonb_build_object('ok', true, 'movimiento_id', v_existing, 'referencia', v_ref, 'neto', v_neto, 'recibos', v_count);
END $$;

-- 5) Sync facturapi_id faltante desde pac_response para CFDIs viejos (habilita descarga)
UPDATE public.cfdi_emitidos
   SET facturapi_id = pac_response->>'id'
 WHERE facturapi_id IS NULL
   AND pac_response IS NOT NULL
   AND pac_response ? 'id';
