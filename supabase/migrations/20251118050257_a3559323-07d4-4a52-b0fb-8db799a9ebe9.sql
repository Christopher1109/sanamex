-- Habilitar RLS policies para permitir inserciones en medicos e insumos

-- Política para permitir a usuarios autenticados insertar médicos
CREATE POLICY "Usuarios autenticados pueden crear medicos"
ON public.medicos
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política para permitir a usuarios autenticados actualizar médicos
CREATE POLICY "Usuarios autenticados pueden actualizar medicos"
ON public.medicos
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Política para permitir a usuarios autenticados insertar insumos
CREATE POLICY "Usuarios autenticados pueden crear insumos"
ON public.insumos
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política para permitir a usuarios autenticados actualizar insumos
CREATE POLICY "Usuarios autenticados pueden actualizar insumos"
ON public.insumos
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Política para permitir a usuarios autenticados insertar paquetes
CREATE POLICY "Usuarios autenticados pueden crear paquetes"
ON public.paquetes_anestesia
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política para permitir a usuarios autenticados actualizar paquetes
CREATE POLICY "Usuarios autenticados pueden actualizar paquetes"
ON public.paquetes_anestesia
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Política para permitir a usuarios autenticados gestionar paquete_insumos
CREATE POLICY "Usuarios autenticados pueden crear paquete_insumos"
ON public.paquete_insumos
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar paquete_insumos"
ON public.paquete_insumos
FOR DELETE
TO authenticated
USING (true);

-- Agregar campos faltantes a la tabla insumos
ALTER TABLE public.insumos
ADD COLUMN IF NOT EXISTS fecha_caducidad DATE,
ADD COLUMN IF NOT EXISTS fecha_entrada DATE DEFAULT CURRENT_DATE;