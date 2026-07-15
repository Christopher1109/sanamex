import { supabase } from '@/integrations/supabase/client';

// Lee la fecha de corte Go-Live. Documentos anteriores a esta fecha
// NO deben generar pólizas automáticas (viven como histórico).
async function getFechaCorte(): Promise<string> {
  const { data } = await supabase
    .from('contabilidad_parametros')
    .select('fecha_corte_automatico')
    .eq('id', 1)
    .maybeSingle();
  return (data as any)?.fecha_corte_automatico || new Date().toISOString().slice(0, 10);
}

// Devuelve el mayor entre `desde` solicitado por el usuario y la fecha de corte.
function aplicarCorte(desde: string | undefined, corte: string): string {
  if (!desde) return corte;
  return desde > corte ? desde : corte;
}

// Carga una regla y valida que esté activa y no marcada PENDIENTE DE CONFIRMAR.
// Reglas como IMSS patronal, ISN y retención IVA están en la BD con activo=false
// y descripción "PENDIENTE DE CONFIRMAR CON CONTADOR" — se ignoran hasta que
// el contador las confirme.
async function cargarReglaActiva(origen: string) {
  const { data: regla } = await supabase
    .from('reglas_contabilizacion')
    .select('*')
    .eq('origen', origen)
    .eq('activo', true)
    .maybeSingle();
  if (!regla) return null;
  if (String(regla.descripcion || '').toUpperCase().includes('PENDIENTE DE CONFIRMAR')) return null;
  return regla as any;
}

// Genera pólizas BORRADOR desde CFDIs, pagos CxP y movimientos bancarios.
// Idempotente: usa (origen_referencia_tipo, origen_referencia_id) como candado.
// Todas las funciones respetan `contabilidad_parametros.fecha_corte_automatico`
// como piso mínimo — nunca contabilizan documentos anteriores al Go-Live.
export const AsientoGenerator = {
  async generarDesdeCFDIs(desde?: string, hasta?: string) {
    const corte = await getFechaCorte();
    const desdeEfectivo = aplicarCorte(desde, corte);
    const regla = await cargarReglaActiva('cfdi_ingreso');
    if (!regla?.cuenta_cargo_id || !regla?.cuenta_abono_id) {
      throw new Error('Configura la regla activa "cfdi_ingreso" (cuenta cargo y abono).');
    }
    let q = supabase.from('cfdi_emitidos').select('id, total, timbrado_at, folio, uuid_sat')
      .eq('es_demo', false).neq('estado', 'cancelado')
      .gte('timbrado_at', desdeEfectivo);
    if (hasta) q = q.lte('timbrado_at', hasta);
    const { data: cfdis, error } = await q;
    if (error) throw error;
    let creadas = 0;
    for (const c of (cfdis as any[]) || []) {
      const refId = c.id;
      const { data: existe } = await supabase.from('polizas').select('id')
        .eq('origen_referencia_tipo', 'cfdi').eq('origen_referencia_id', refId).maybeSingle();
      if (existe) continue;
      const fecha = (c.timbrado_at || new Date().toISOString()).slice(0, 10);
      const { data: pol, error: e1 } = await supabase.from('polizas').insert({
        tipo: 'ingreso', fecha, concepto: `CFDI ${c.folio || c.uuid_sat || ''}`,
        estatus: 'borrador', origen: 'automatica',
        origen_referencia_tipo: 'cfdi', origen_referencia_id: refId,
      }).select('id').single();
      if (e1 || !pol) continue;
      await supabase.from('poliza_movimientos').insert([
        { poliza_id: pol.id, cuenta_id: regla.cuenta_cargo_id, cargo: c.total, abono: 0, concepto: 'Ingreso CFDI' },
        { poliza_id: pol.id, cuenta_id: regla.cuenta_abono_id, cargo: 0, abono: c.total, concepto: 'Ingreso CFDI' },
      ]);
      creadas++;
    }
    return { creadas, total: cfdis?.length || 0, corte, desde_efectivo: desdeEfectivo };
  },

  async generarDesdePagosCxP(desde?: string, hasta?: string) {
    const corte = await getFechaCorte();
    const desdeEfectivo = aplicarCorte(desde, corte);
    const regla = await cargarReglaActiva('pago_cxp');
    if (!regla?.cuenta_cargo_id || !regla?.cuenta_abono_id) {
      throw new Error('Configura la regla activa "pago_cxp".');
    }
    let q = supabase.from('pagos_cxp').select('id, monto, fecha, compra_id')
      .gte('fecha', desdeEfectivo);
    if (hasta) q = q.lte('fecha', hasta);
    const { data: pagos, error } = await q;
    if (error) throw error;
    let creadas = 0;
    for (const p of (pagos as any[]) || []) {
      const { data: existe } = await supabase.from('polizas').select('id')
        .eq('origen_referencia_tipo', 'pago_cxp').eq('origen_referencia_id', p.id).maybeSingle();
      if (existe) continue;
      const { data: pol } = await supabase.from('polizas').insert({
        tipo: 'egreso', fecha: p.fecha, concepto: `Pago a proveedor ${p.compra_id}`,
        estatus: 'borrador', origen: 'automatica',
        origen_referencia_tipo: 'pago_cxp', origen_referencia_id: p.id,
      }).select('id').single();
      if (!pol) continue;
      await supabase.from('poliza_movimientos').insert([
        { poliza_id: pol.id, cuenta_id: regla.cuenta_cargo_id, cargo: p.monto, abono: 0, concepto: 'Pago CxP' },
        { poliza_id: pol.id, cuenta_id: regla.cuenta_abono_id, cargo: 0, abono: p.monto, concepto: 'Pago CxP' },
      ]);
      creadas++;
    }
    return { creadas, total: pagos?.length || 0, corte, desde_efectivo: desdeEfectivo };
  },

  async generarDesdeBancos(desde?: string, hasta?: string) {
    const corte = await getFechaCorte();
    const desdeEfectivo = aplicarCorte(desde, corte);
    const regla = await cargarReglaActiva('mov_bancario');
    if (!regla?.cuenta_cargo_id || !regla?.cuenta_abono_id) {
      throw new Error('Configura la regla activa "mov_bancario".');
    }
    let q = supabase.from('movimientos_bancarios')
      .select('id, cargo, abono, fecha, concepto, conciliado, cuenta_id, cuentas_bancarias(cuenta_contable_id)')
      .eq('conciliado', true)
      .gte('fecha', desdeEfectivo);
    if (hasta) q = q.lte('fecha', hasta);
    const { data: movs, error } = await q;
    if (error) throw error;
    let creadas = 0;
    for (const m of (movs as any[]) || []) {
      const { data: existe } = await supabase.from('polizas').select('id')
        .eq('origen_referencia_tipo', 'mov_bancario').eq('origen_referencia_id', m.id).maybeSingle();
      if (existe) continue;
      const monto = Math.abs(Number(m.cargo || m.abono || 0));
      if (monto <= 0) continue;
      const cuentaBancoId = (m as any).cuentas_bancarias?.cuenta_contable_id || regla.cuenta_abono_id;
      if (!cuentaBancoId) continue;
      const { data: pol } = await supabase.from('polizas').insert({
        tipo: 'diario', fecha: m.fecha, concepto: m.concepto || 'Movimiento bancario',
        estatus: 'borrador', origen: 'automatica',
        origen_referencia_tipo: 'mov_bancario', origen_referencia_id: m.id,
      }).select('id').single();
      if (!pol) continue;
      const esDeposito = Number(m.abono || 0) > 0;
      await supabase.from('poliza_movimientos').insert(esDeposito ? [
        { poliza_id: pol.id, cuenta_id: cuentaBancoId, cargo: monto, abono: 0, concepto: 'Banco' },
        { poliza_id: pol.id, cuenta_id: regla.cuenta_abono_id, cargo: 0, abono: monto, concepto: 'Contrapartida bancaria' },
      ] : [
        { poliza_id: pol.id, cuenta_id: regla.cuenta_cargo_id, cargo: monto, abono: 0, concepto: 'Contrapartida bancaria' },
        { poliza_id: pol.id, cuenta_id: cuentaBancoId, cargo: 0, abono: monto, concepto: 'Banco' },
      ]);
      creadas++;
    }
    return { creadas, total: movs?.length || 0, corte, desde_efectivo: desdeEfectivo };
  },

  // B4 — Batch: corre las tres fuentes en una sola pasada, para el rango indicado.
  // No lanza si una fuente no está configurada; sólo la salta y la reporta.
  // Idempotente por diseño (cada sub-función revisa `origen_referencia_*`).
  async generarDelDia(desde?: string, hasta?: string) {
    const detalle: Record<string, any> = {};
    let creadasTotal = 0;
    const fuentes = [
      ['cfdi', () => this.generarDesdeCFDIs(desde, hasta)],
      ['pagos_cxp', () => this.generarDesdePagosCxP(desde, hasta)],
      ['bancos', () => this.generarDesdeBancos(desde, hasta)],
    ] as const;
    for (const [nombre, fn] of fuentes) {
      try {
        const r = await fn();
        detalle[nombre] = r;
        creadasTotal += r.creadas;
      } catch (e: any) {
        detalle[nombre] = { error: e?.message || String(e), creadas: 0 };
      }
    }
    return { creadasTotal, detalle };
  },

  async getFechaCorte() {
    return getFechaCorte();
  },
};
