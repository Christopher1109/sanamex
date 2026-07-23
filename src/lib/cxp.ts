import { supabase } from '@/integrations/supabase/client';

export interface RegistrarPagoCompraInput {
  compraId: string;
  compraTotal: number;
  montoYaPagado: number; // suma de pagos_cxp existentes antes de este pago
  monto: number;
  fecha: string; // YYYY-MM-DD
  formaPago: string;
  referencia?: string | null;
  bancoCuentaId?: string | null;
  notas?: string | null;
  comprobanteUrl?: string | null;
}

/**
 * Única fuente de verdad para registrar un pago de una compra (Cuentas por
 * Pagar y Compras deben llamar SIEMPRE a esta función, nunca escribir en
 * `compras.pagada` ni en `pagos_cxp` por su cuenta). Garantiza que:
 *  - Todo pago quede registrado en pagos_cxp (requisito para poder
 *    conciliarlo después contra el estado de cuenta bancario).
 *  - `compras.pagada` / `estado` / `fecha_pago_real` se actualicen
 *    automáticamente en cuanto la suma de pagos alcance el total,
 *    sin importar desde qué pantalla se registró el pago.
 */
export async function registrarPagoCompra(input: RegistrarPagoCompraInput) {
  const user = (await supabase.auth.getUser()).data.user;

  const { error: pagoError } = await supabase.from('pagos_cxp').insert({
    compra_id: input.compraId,
    fecha: input.fecha,
    monto: input.monto,
    forma_pago: input.formaPago,
    referencia: input.referencia || null,
    banco_cuenta_id: input.bancoCuentaId || null,
    notas: input.notas || null,
    comprobante_url: input.comprobanteUrl || null,
    creado_por: user?.id,
  });
  if (pagoError) return { error: pagoError };

  const totalPagado = Number(input.montoYaPagado) + Number(input.monto);
  const quedaSaldada = totalPagado >= Number(input.compraTotal) - 0.5; // tolerancia por centavos

  if (quedaSaldada) {
    const { error: updError } = await supabase.from('compras').update({
      pagada: true,
      estado: 'pagada',
      fecha_pago_real: input.fecha,
      ...(input.comprobanteUrl ? { comprobante_pago_url: input.comprobanteUrl } : {}),
    } as any).eq('id', input.compraId);
    if (updError) return { error: updError };
  }

  await supabase.from('audit_log').insert({
    entidad: 'compra',
    accion: quedaSaldada ? 'Pago registrado (compra saldada)' : 'Pago parcial registrado',
    entidad_id: input.compraId,
    usuario_id: user?.id,
    usuario_nombre: user?.email,
  });

  return { error: null, quedaSaldada };
}
