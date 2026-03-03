-- Add comprobante_pago_url to compras
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS comprobante_pago_url text;

-- Add storage policies for comprobantes-pago bucket
CREATE POLICY "Autenticados suben comprobantes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'comprobantes-pago');

CREATE POLICY "Todos ven comprobantes"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'comprobantes-pago');

-- Make bucket public for viewing
UPDATE storage.buckets SET public = true WHERE id = 'comprobantes-pago';