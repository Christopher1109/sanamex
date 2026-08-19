REVOKE EXECUTE ON FUNCTION public.cxc_resumen() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cxc_registrar_abono(uuid, numeric, date, text, text, text, text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.conciliacion_enviar_a_cuenta(uuid, text, uuid, uuid, uuid[], uuid[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.corregir_venta_pago_estatus(uuid, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.cxc_resumen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cxc_registrar_abono(uuid, numeric, date, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conciliacion_enviar_a_cuenta(uuid, text, uuid, uuid, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.corregir_venta_pago_estatus(uuid, text, text, text) TO authenticated;