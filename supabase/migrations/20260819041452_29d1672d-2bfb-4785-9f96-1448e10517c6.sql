CREATE TABLE public.autofacturacion_solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id uuid NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id),
  rfc text NOT NULL,
  razon_social text NOT NULL,
  regimen_fiscal text NOT NULL,
  codigo_postal text NOT NULL,
  email text NOT NULL,
  uso_cfdi text NOT NULL DEFAULT 'G03',
  estado text NOT NULL DEFAULT 'pendiente',
  nota_interna text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX autofact_solicitud_venta_unica ON public.autofacturacion_solicitudes(venta_id) WHERE estado <> 'rechazada';

GRANT SELECT ON public.autofacturacion_solicitudes TO authenticated;
GRANT UPDATE ON public.autofacturacion_solicitudes TO authenticated;
GRANT ALL ON public.autofacturacion_solicitudes TO service_role;

ALTER TABLE public.autofacturacion_solicitudes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal autenticado consulta solicitudes"
ON public.autofacturacion_solicitudes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gerentes y admins actualizan solicitudes"
ON public.autofacturacion_solicitudes FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'contador'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'contador'));

CREATE TRIGGER autofact_solicitudes_updated_at
BEFORE UPDATE ON public.autofacturacion_solicitudes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();