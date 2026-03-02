-- Update RLS policies to include cadena_suministros for tables gerente_almacen has access to

-- registro_actividad: add cadena_suministros
DROP POLICY IF EXISTS "Gerentes globales pueden ver todo el registro" ON public.registro_actividad;
CREATE POLICY "Gerentes globales pueden ver todo el registro" 
ON public.registro_actividad 
FOR SELECT 
USING (
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'cadena_suministros'::app_role)
);

-- almacen_central: add cadena_suministros to update
DROP POLICY IF EXISTS "Gerente almacén puede actualizar almacén central" ON public.almacen_central;
CREATE POLICY "Gerentes pueden actualizar almacén central" 
ON public.almacen_central 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'cadena_suministros'::app_role)
);

DROP POLICY IF EXISTS "Gerente almacén puede modificar almacén central" ON public.almacen_central;
CREATE POLICY "Gerentes pueden insertar almacén central" 
ON public.almacen_central 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'cadena_suministros'::app_role)
);

-- almacenes_provisionales: add cadena_suministros
DROP POLICY IF EXISTS "Almacenistas pueden ver almacenes de su hospital" ON public.almacenes_provisionales;
CREATE POLICY "Usuarios pueden ver almacenes provisionales" 
ON public.almacenes_provisionales 
FOR SELECT 
USING (
  has_role(auth.uid(), 'almacenista'::app_role) OR 
  has_role(auth.uid(), 'lider'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'gerente'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'cadena_suministros'::app_role)
);

-- almacen_provisional_inventario: add cadena_suministros
DROP POLICY IF EXISTS "Usuarios pueden ver inventario provisional" ON public.almacen_provisional_inventario;
CREATE POLICY "Usuarios pueden ver inventario provisional" 
ON public.almacen_provisional_inventario 
FOR SELECT 
USING (
  has_role(auth.uid(), 'almacenista'::app_role) OR 
  has_role(auth.uid(), 'lider'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'auxiliar'::app_role) OR 
  has_role(auth.uid(), 'gerente'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'cadena_suministros'::app_role)
);

-- alertas_transferencia: add cadena_suministros to update
DROP POLICY IF EXISTS "Almacenistas pueden actualizar alertas de su hospital" ON public.alertas_transferencia;
CREATE POLICY "Usuarios pueden actualizar alertas de transferencia" 
ON public.alertas_transferencia 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'almacenista'::app_role) OR 
  has_role(auth.uid(), 'lider'::app_role) OR
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'cadena_suministros'::app_role)
);

DROP POLICY IF EXISTS "Almacenistas pueden ver alertas de su hospital" ON public.alertas_transferencia;
CREATE POLICY "Usuarios pueden ver alertas de transferencia" 
ON public.alertas_transferencia 
FOR SELECT 
USING (
  has_role(auth.uid(), 'almacenista'::app_role) OR 
  has_role(auth.uid(), 'lider'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'gerente'::app_role) OR 
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
  has_role(auth.uid(), 'cadena_suministros'::app_role) OR
  has_role(auth.uid(), 'gerente_almacen'::app_role)
);

-- documento_agrupado_detalle: add cadena_suministros
DROP POLICY IF EXISTS "Gerentes pueden ver detalles agrupados" ON public.documento_agrupado_detalle;
CREATE POLICY "Gerentes pueden ver detalles agrupados" 
ON public.documento_agrupado_detalle 
FOR SELECT 
USING (
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'cadena_suministros'::app_role)
);

-- documentos_necesidades_agrupado: add cadena_suministros
DROP POLICY IF EXISTS "Gerentes pueden ver documentos agrupados" ON public.documentos_necesidades_agrupado;
CREATE POLICY "Gerentes pueden ver documentos agrupados" 
ON public.documentos_necesidades_agrupado 
FOR SELECT 
USING (
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
  has_role(auth.uid(), 'gerente_almacen'::app_role) OR
  has_role(auth.uid(), 'cadena_suministros'::app_role)
);

-- documento_segmentado_detalle: add gerente_almacen
DROP POLICY IF EXISTS "Gerentes pueden ver detalles segmentados" ON public.documento_segmentado_detalle;
CREATE POLICY "Gerentes pueden ver detalles segmentados" 
ON public.documento_segmentado_detalle 
FOR SELECT 
USING (
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
  has_role(auth.uid(), 'cadena_suministros'::app_role) OR
  has_role(auth.uid(), 'gerente_almacen'::app_role)
);

-- documentos_necesidades_segmentado: add gerente_almacen
DROP POLICY IF EXISTS "Gerentes pueden ver documentos segmentados" ON public.documentos_necesidades_segmentado;
CREATE POLICY "Gerentes pueden ver documentos segmentados" 
ON public.documentos_necesidades_segmentado 
FOR SELECT 
USING (
  has_role(auth.uid(), 'gerente_operaciones'::app_role) OR 
  has_role(auth.uid(), 'cadena_suministros'::app_role) OR
  has_role(auth.uid(), 'gerente_almacen'::app_role)
);