-- =========================================================
-- Promociones por lista de productos (carga masiva desde Excel)
-- =========================================================

CREATE TABLE public.promociones_lista (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  notas text,
  fecha_inicio date NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin date,
  margen_minimo numeric(6,2) NOT NULL DEFAULT 15,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','activa','cancelada')),
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promociones_lista_vigencia_chk CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE TABLE public.promociones_lista_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promocion_id uuid NOT NULL REFERENCES public.promociones_lista(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  sku text NOT NULL,
  descripcion text,
  costo numeric(14,4),
  precio_base numeric(14,4),
  descuento_propuesto numeric(6,2),
  descuento_aprobado numeric(6,2),
  precio_promo numeric(14,4),
  margen_resultante numeric(6,2),
  observacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promocion_id, sku)
);

CREATE INDEX idx_promociones_lista_estado ON public.promociones_lista(estado, fecha_inicio);
CREATE INDEX idx_promociones_lista_lineas_prod ON public.promociones_lista_lineas(producto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promociones_lista TO authenticated;
GRANT ALL ON public.promociones_lista TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promociones_lista_lineas TO authenticated;
GRANT ALL ON public.promociones_lista_lineas TO service_role;

ALTER TABLE public.promociones_lista ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promociones_lista_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_lista_select_auth" ON public.promociones_lista
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "promo_lista_admin_write" ON public.promociones_lista
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'direccion') OR public.has_role(auth.uid(),'contraloria')
    OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'compras')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'direccion') OR public.has_role(auth.uid(),'contraloria')
    OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'compras')
  );

CREATE POLICY "promo_lista_lineas_select_auth" ON public.promociones_lista_lineas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "promo_lista_lineas_admin_write" ON public.promociones_lista_lineas
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'direccion') OR public.has_role(auth.uid(),'contraloria')
    OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'compras')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'direccion') OR public.has_role(auth.uid(),'contraloria')
    OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'compras')
  );

CREATE TRIGGER trg_promo_lista_updated BEFORE UPDATE ON public.promociones_lista
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_promo_lista_lineas_updated BEFORE UPDATE ON public.promociones_lista_lineas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------
-- Propuesta automática de descuento por margen
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promociones_propuesta_margen(
  p_skus text[],
  p_margen_minimo numeric DEFAULT 15,
  p_descuento_deseado numeric DEFAULT NULL
)
RETURNS TABLE (
  sku text,
  producto_id uuid,
  descripcion text,
  costo numeric,
  precio_base numeric,
  margen_actual numeric,
  descuento_maximo numeric,
  descuento_propuesto numeric,
  precio_propuesto numeric,
  margen_resultante numeric,
  observacion text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH entrada AS (
    SELECT DISTINCT upper(btrim(s)) AS sku FROM unnest(p_skus) AS s WHERE btrim(coalesce(s,'')) <> ''
  ),
  base AS (
    SELECT e.sku,
           p.id AS producto_id,
           coalesce(p.nombre, p.descripcion) AS descripcion,
           NULLIF(GREATEST(coalesce(p.costo_promedio,0), coalesce(p.costo,0)), 0) AS costo,
           NULLIF(p.precio_base, 0) AS precio_base
    FROM entrada e
    LEFT JOIN productos p ON upper(btrim(p.sku)) = e.sku
  ),
  calc AS (
    SELECT b.*,
           CASE WHEN b.precio_base IS NOT NULL AND b.costo IS NOT NULL
                THEN round(((b.precio_base - b.costo) / b.precio_base) * 100, 2) END AS margen_actual,
           -- precio mínimo que respeta el margen objetivo: costo / (1 - margen/100)
           CASE WHEN b.costo IS NOT NULL AND p_margen_minimo < 100
                THEN b.costo / (1 - (LEAST(GREATEST(p_margen_minimo,0),99.9) / 100)) END AS precio_piso
    FROM base b
  ),
  maxdesc AS (
    SELECT c.*,
           CASE WHEN c.precio_base IS NOT NULL AND c.precio_piso IS NOT NULL
                THEN GREATEST(round(((c.precio_base - c.precio_piso) / c.precio_base) * 100, 2), 0) END AS desc_max
    FROM calc c
  ),
  final AS (
    SELECT m.*,
           CASE
             WHEN m.desc_max IS NULL THEN NULL
             WHEN p_descuento_deseado IS NULL THEN m.desc_max
             ELSE LEAST(p_descuento_deseado, m.desc_max)
           END AS desc_prop
    FROM maxdesc m
  )
  SELECT f.sku,
         f.producto_id,
         f.descripcion,
         f.costo,
         f.precio_base,
         f.margen_actual,
         f.desc_max,
         f.desc_prop,
         CASE WHEN f.precio_base IS NOT NULL AND f.desc_prop IS NOT NULL
              THEN round(f.precio_base * (1 - f.desc_prop / 100), 2) END,
         CASE WHEN f.precio_base IS NOT NULL AND f.desc_prop IS NOT NULL AND f.costo IS NOT NULL
                   AND round(f.precio_base * (1 - f.desc_prop / 100), 2) > 0
              THEN round(((round(f.precio_base * (1 - f.desc_prop / 100), 2) - f.costo)
                          / round(f.precio_base * (1 - f.desc_prop / 100), 2)) * 100, 2) END,
         CASE
           WHEN f.producto_id IS NULL THEN 'SKU no encontrado en el catálogo'
           WHEN f.costo IS NULL THEN 'Producto sin costo registrado'
           WHEN f.precio_base IS NULL THEN 'Producto sin precio base'
           WHEN f.desc_max = 0 THEN 'El margen actual ya está por debajo del mínimo: no admite descuento'
           WHEN p_descuento_deseado IS NOT NULL AND p_descuento_deseado > coalesce(f.desc_max,0)
             THEN 'Descuento solicitado recortado para respetar el margen mínimo'
           ELSE NULL
         END
  FROM final f
  ORDER BY (f.producto_id IS NULL) DESC, f.sku;
END;
$$;

REVOKE ALL ON FUNCTION public.promociones_propuesta_margen(text[], numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promociones_propuesta_margen(text[], numeric, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Precio promocional vigente por producto (campañas activas de hoy)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promociones_lista_precio_vigente(p_producto_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT min(l.precio_promo)
  FROM promociones_lista_lineas l
  JOIN promociones_lista pl ON pl.id = l.promocion_id
  WHERE l.producto_id = p_producto_id
    AND pl.estado = 'activa'
    AND pl.fecha_inicio <= CURRENT_DATE
    AND (pl.fecha_fin IS NULL OR pl.fecha_fin >= CURRENT_DATE)
    AND l.precio_promo IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.promociones_lista_precio_vigente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promociones_lista_precio_vigente(uuid) TO authenticated, service_role;