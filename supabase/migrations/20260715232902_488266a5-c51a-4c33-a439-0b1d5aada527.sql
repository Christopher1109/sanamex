ALTER TABLE public.contabilidad_parametros
  ADD COLUMN IF NOT EXISTS fecha_corte_automatico DATE NOT NULL DEFAULT CURRENT_DATE;

COMMENT ON COLUMN public.contabilidad_parametros.fecha_corte_automatico IS
  'Fecha de corte (Go-Live). Documentos (CFDI, pagos CxP, movimientos bancarios) con fecha < a esta NO generan pólizas automáticas. Editable por super_admin.';

UPDATE public.contabilidad_parametros
   SET fecha_corte_automatico = CURRENT_DATE,
       updated_at = now()
 WHERE id = 1;