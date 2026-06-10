
CREATE TABLE public.cotizador_pesos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peso_precio numeric NOT NULL DEFAULT 0.40,
  peso_existencia numeric NOT NULL DEFAULT 0.25,
  peso_credito numeric NOT NULL DEFAULT 0.15,
  peso_lead_time numeric NOT NULL DEFAULT 0.10,
  peso_devoluciones numeric NOT NULL DEFAULT 0.10,
  activo boolean DEFAULT true,
  modificado_por uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT NOW(),
  CHECK (peso_precio + peso_existencia + peso_credito + peso_lead_time + peso_devoluciones BETWEEN 0.99 AND 1.01)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizador_pesos TO authenticated;
GRANT ALL ON public.cotizador_pesos TO service_role;
ALTER TABLE public.cotizador_pesos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cotizador_pesos lectura" ON public.cotizador_pesos FOR SELECT TO authenticated USING (true);
CREATE POLICY "cotizador_pesos escritura" ON public.cotizador_pesos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'gerente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'gerente'));

INSERT INTO public.cotizador_pesos (peso_precio, peso_existencia, peso_credito, peso_lead_time, peso_devoluciones)
VALUES (0.40, 0.25, 0.15, 0.10, 0.10);

CREATE OR REPLACE FUNCTION public.recomendar_proveedor(
  p_producto_id uuid, p_cantidad_requerida int, p_fecha date DEFAULT CURRENT_DATE
) RETURNS TABLE (
  proveedor_id uuid, proveedor_codigo text, proveedor_nombre text,
  precio_unitario numeric, precio_con_iva numeric, existencia_proveedor int,
  dias_credito int, lead_time_dias int, acepta_devoluciones boolean, pago_contra_entrega boolean,
  piezas_corrugado int, cantidad_sugerida int, cantidad_disponible int,
  monto_total numeric, con_oferta boolean, score numeric, ranking int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pp numeric; v_pe numeric; v_pc numeric; v_pl numeric; v_pd numeric;
BEGIN
  SELECT peso_precio, peso_existencia, peso_credito, peso_lead_time, peso_devoluciones
    INTO v_pp, v_pe, v_pc, v_pl, v_pd
  FROM cotizador_pesos WHERE activo = true ORDER BY updated_at DESC LIMIT 1;
  v_pp := COALESCE(v_pp,0.40); v_pe := COALESCE(v_pe,0.25); v_pc := COALESCE(v_pc,0.15);
  v_pl := COALESCE(v_pl,0.10); v_pd := COALESCE(v_pd,0.10);

  RETURN QUERY
  WITH pcp AS (
    SELECT pr.id AS prov_id,
      COALESCE(pr.codigo, SUBSTRING(pr.id::text,1,8)) AS prov_cod,
      pr.nombre AS prov_nom,
      COALESCE(pr.dias_credito,0) AS dias_credito,
      COALESCE(pr.lead_time_prometido_dias,0) AS lead_time,
      COALESCE(pr.acepta_devoluciones,false) AS acepta_devoluciones,
      COALESCE(pr.pago_contra_entrega,false) AS pago_contra_entrega,
      lpp.precio,
      COALESCE(lpp.existencia_proveedor,0) AS existencia_proveedor,
      COALESCE(pc.piezas_por_corrugado,1) AS corrugado,
      ofr.precio_oferta, (ofr.id IS NOT NULL) AS con_oferta
    FROM proveedores pr
    INNER JOIN lista_precio_proveedor lpp
      ON lpp.proveedor_id = pr.id AND lpp.producto_id = p_producto_id AND lpp.activo = true
      AND lpp.fecha_vigencia_desde <= p_fecha
      AND (lpp.fecha_vigencia_hasta IS NULL OR lpp.fecha_vigencia_hasta >= p_fecha)
    LEFT JOIN producto_corrugado pc
      ON pc.producto_id = p_producto_id AND (pc.proveedor_id = pr.id OR pc.proveedor_id IS NULL)
    LEFT JOIN ofertas_proveedor ofr
      ON ofr.proveedor_id = pr.id AND ofr.producto_id = p_producto_id AND ofr.activo = true
      AND p_fecha BETWEEN ofr.fecha_inicio AND ofr.fecha_fin
    WHERE pr.activo = true
  ),
  con_scores AS (
    SELECT *,
      COALESCE(precio_oferta, precio) AS precio_efectivo,
      CEIL(p_cantidad_requerida::numeric / NULLIF(corrugado,0)) * corrugado AS cant_corrugado,
      LEAST(CEIL(p_cantidad_requerida::numeric / NULLIF(corrugado,0)) * corrugado, existencia_proveedor) AS cant_disp,
      CASE WHEN COALESCE(precio_oferta, precio) = 0 THEN 0 ELSE 1.0 / COALESCE(precio_oferta, precio) END AS score_precio,
      CASE WHEN existencia_proveedor >= p_cantidad_requerida THEN 1.0
           WHEN existencia_proveedor = 0 THEN 0
           ELSE existencia_proveedor::numeric / p_cantidad_requerida END AS score_existencia,
      LEAST(dias_credito,60)::numeric / 60 AS score_credito,
      GREATEST(0, (30 - lead_time)::numeric / 30) AS score_lead,
      CASE WHEN acepta_devoluciones THEN 1.0 ELSE 0.5 END AS score_dev
    FROM pcp
  ),
  normalizados AS (
    SELECT *,
      CASE WHEN MAX(score_precio) OVER () = MIN(score_precio) OVER () THEN 1.0
           ELSE (score_precio - MIN(score_precio) OVER ()) /
                NULLIF(MAX(score_precio) OVER () - MIN(score_precio) OVER (),0)
      END AS sp_norm
    FROM con_scores
  )
  SELECT n.prov_id, n.prov_cod, n.prov_nom,
    n.precio_efectivo, (n.precio_efectivo * 1.16)::numeric,
    n.existencia_proveedor, n.dias_credito, n.lead_time,
    n.acepta_devoluciones, n.pago_contra_entrega,
    n.corrugado::int, n.cant_corrugado::int, n.cant_disp::int,
    (n.cant_corrugado * n.precio_efectivo)::numeric, n.con_oferta,
    ROUND((COALESCE(n.sp_norm,1)*v_pp + n.score_existencia*v_pe + n.score_credito*v_pc + n.score_lead*v_pl + n.score_dev*v_pd) * 100, 2),
    ROW_NUMBER() OVER (ORDER BY (COALESCE(n.sp_norm,1)*v_pp + n.score_existencia*v_pe + n.score_credito*v_pc + n.score_lead*v_pl + n.score_dev*v_pd) DESC)::int
  FROM normalizados n;
END; $$;

CREATE TABLE public.cotizaciones_carrito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  cantidad int NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric NOT NULL,
  notas text,
  agregado_at timestamptz DEFAULT NOW(),
  UNIQUE (usuario_id, producto_id, proveedor_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizaciones_carrito TO authenticated;
GRANT ALL ON public.cotizaciones_carrito TO service_role;
ALTER TABLE public.cotizaciones_carrito ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carrito propio" ON public.cotizaciones_carrito FOR ALL TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

CREATE SEQUENCE IF NOT EXISTS public.oc_folio_seq;

CREATE OR REPLACE FUNCTION public.generar_folio_oc() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_anio text; v_seq int;
BEGIN
  v_anio := TO_CHAR(CURRENT_DATE,'YYYY');
  v_seq := nextval('oc_folio_seq');
  RETURN 'OC-' || v_anio || '-' || LPAD(v_seq::text, 5, '0');
END; $$;

CREATE TABLE public.ordenes_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text UNIQUE NOT NULL DEFAULT public.generar_folio_oc(),
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id),
  sucursal_destino_id uuid REFERENCES public.sucursales(id),
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','enviada','confirmada','parcial','recibida','cancelada')),
  fecha_creacion date DEFAULT CURRENT_DATE,
  fecha_envio date,
  fecha_recepcion_esperada date,
  fecha_recepcion_real date,
  subtotal numeric NOT NULL DEFAULT 0,
  iva numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notas text,
  creada_por uuid REFERENCES auth.users(id),
  enviada_por uuid REFERENCES auth.users(id),
  recibida_por uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes_compra TO authenticated;
GRANT ALL ON public.ordenes_compra TO service_role;
ALTER TABLE public.ordenes_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "OC lectura" ON public.ordenes_compra FOR SELECT TO authenticated USING (true);
CREATE POLICY "OC escritura" ON public.ordenes_compra FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'almacen'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'almacen'));

CREATE TABLE public.orden_compra_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  cantidad_solicitada int NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_recibida int NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0),
  precio_unitario numeric NOT NULL,
  precio_con_iva numeric,
  subtotal numeric GENERATED ALWAYS AS (cantidad_solicitada * precio_unitario) STORED,
  notas_linea text,
  created_at timestamptz DEFAULT NOW(),
  UNIQUE (orden_id, producto_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orden_compra_lineas TO authenticated;
GRANT ALL ON public.orden_compra_lineas TO service_role;
ALTER TABLE public.orden_compra_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "OC lineas lectura" ON public.orden_compra_lineas FOR SELECT TO authenticated USING (true);
CREATE POLICY "OC lineas escritura" ON public.orden_compra_lineas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'almacen'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'almacen'));

CREATE INDEX idx_oc_proveedor ON public.ordenes_compra (proveedor_id, estado);
CREATE INDEX idx_oc_lineas ON public.orden_compra_lineas (orden_id);

CREATE TRIGGER trg_oc_updated_at BEFORE UPDATE ON public.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.recalc_total_oc(p_orden_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub numeric;
BEGIN
  SELECT COALESCE(SUM(subtotal),0) INTO v_sub FROM orden_compra_lineas WHERE orden_id = p_orden_id;
  UPDATE ordenes_compra SET subtotal = v_sub, iva = ROUND(v_sub*0.16,2), total = ROUND(v_sub*1.16,2), updated_at = NOW()
   WHERE id = p_orden_id;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_recalc_oc() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM recalc_total_oc(COALESCE(NEW.orden_id, OLD.orden_id)); RETURN NULL; END; $$;

CREATE TRIGGER trg_oc_lineas_total AFTER INSERT OR UPDATE OR DELETE ON public.orden_compra_lineas
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_oc();

CREATE OR REPLACE VIEW public.vista_fill_rate_proveedores AS
SELECT pr.id AS proveedor_id,
  COALESCE(pr.codigo, SUBSTRING(pr.id::text,1,8)) AS proveedor_codigo,
  pr.nombre AS proveedor_nombre,
  COUNT(DISTINCT oc.id) AS total_ocs,
  COUNT(DISTINCT ocl.id) AS total_lineas,
  COALESCE(SUM(ocl.cantidad_solicitada),0) AS total_solicitado,
  COALESCE(SUM(ocl.cantidad_recibida),0) AS total_recibido,
  CASE WHEN COALESCE(SUM(ocl.cantidad_solicitada),0) = 0 THEN NULL
       ELSE ROUND(SUM(ocl.cantidad_recibida)::numeric / SUM(ocl.cantidad_solicitada) * 100, 2)
  END AS fill_rate_pct,
  AVG((oc.fecha_recepcion_real - oc.fecha_envio))::int AS lead_time_promedio_real
FROM public.proveedores pr
LEFT JOIN public.ordenes_compra oc ON oc.proveedor_id = pr.id AND oc.estado IN ('recibida','parcial')
LEFT JOIN public.orden_compra_lineas ocl ON ocl.orden_id = oc.id
WHERE pr.activo = true
GROUP BY pr.id, pr.codigo, pr.nombre;
GRANT SELECT ON public.vista_fill_rate_proveedores TO authenticated;
GRANT ALL ON public.vista_fill_rate_proveedores TO service_role;

CREATE OR REPLACE FUNCTION public.recibir_oc(
  p_orden_id uuid, p_recepciones jsonb, p_almacen_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item jsonb; v_linea record; v_cant int; v_lote_id uuid; v_estado text;
  v_total_sol int; v_total_rec int; v_user uuid := auth.uid();
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_recepciones) LOOP
    v_cant := (v_item->>'cantidad')::int;
    IF v_cant <= 0 THEN CONTINUE; END IF;
    SELECT ocl.* INTO v_linea FROM orden_compra_lineas ocl
     WHERE ocl.id = (v_item->>'linea_id')::uuid AND ocl.orden_id = p_orden_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE orden_compra_lineas SET cantidad_recibida = cantidad_recibida + v_cant WHERE id = v_linea.id;

    INSERT INTO lotes (producto_id, numero_lote, costo_unitario, fecha_recepcion)
    VALUES (v_linea.producto_id,
            'OC-'||SUBSTRING(p_orden_id::text,1,8)||'-'||to_char(now(),'YYYYMMDDHH24MISS'),
            v_linea.precio_unitario, CURRENT_DATE)
    RETURNING id INTO v_lote_id;

    INSERT INTO inventario (almacen_id, lote_id, cantidad) VALUES (p_almacen_id, v_lote_id, v_cant);

    INSERT INTO movimientos_inventario (almacen_id, lote_id, tipo, cantidad, costo_unitario,
      referencia_tipo, referencia_id, usuario_id, notas)
    VALUES (p_almacen_id, v_lote_id, 'entrada', v_cant, v_linea.precio_unitario,
            'orden_compra', p_orden_id, v_user, 'Recepción OC');
  END LOOP;

  SELECT COALESCE(SUM(cantidad_solicitada),0), COALESCE(SUM(cantidad_recibida),0)
    INTO v_total_sol, v_total_rec
  FROM orden_compra_lineas WHERE orden_id = p_orden_id;

  v_estado := CASE
    WHEN v_total_rec = 0 THEN 'enviada'
    WHEN v_total_rec >= v_total_sol THEN 'recibida'
    ELSE 'parcial' END;

  UPDATE ordenes_compra
     SET estado = v_estado,
         fecha_recepcion_real = CASE WHEN v_estado='recibida' THEN CURRENT_DATE ELSE fecha_recepcion_real END,
         recibida_por = v_user
   WHERE id = p_orden_id;

  RETURN jsonb_build_object('estado', v_estado, 'solicitado', v_total_sol, 'recibido', v_total_rec);
END; $$;
