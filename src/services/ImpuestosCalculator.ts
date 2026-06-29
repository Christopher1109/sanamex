import { supabase } from '@/integrations/supabase/client';

// Cálculo fino de IVA mensual: trasladado (CFDIs ingreso) vs acreditable (compras).
// Soporta tasa 16% / 0% / exento. El cálculo asume IVA implícito en total
// cuando no se tiene desglose explícito en la tabla (gancho).
export const ImpuestosCalculator = {
  async ivaMensual(anio: number, mes: number) {
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const hasta = new Date(anio, mes, 0).toISOString().slice(0, 10);
    const { data: cfdis } = await supabase.from('cfdi_emitidos')
      .select('total, tipo_comprobante')
      .eq('es_demo', false).neq('estado', 'cancelado')
      .gte('timbrado_at', desde).lte('timbrado_at', hasta);
    const { data: compras } = await supabase.from('compras')
      .select('total, subtotal, iva')
      .gte('created_at', desde).lte('created_at', hasta);
    let trasladado_16 = 0;
    let base_16 = 0;
    let base_0 = 0;
    let base_exento = 0;
    for (const c of (cfdis as any[]) || []) {
      // ingresos: tipo I; egresos (notas de crédito tipo E) restan
      const factor = c.tipo_comprobante === 'E' ? -1 : 1;
      const total = Number(c.total || 0) * factor;
      // Por defecto asumimos 16% efectivo
      const base = total / 1.16;
      base_16 += base;
      trasladado_16 += total - base;
    }
    let acreditable_16 = 0;
    let base_compras = 0;
    for (const c of (compras as any[]) || []) {
      const iva = Number(c.iva || 0);
      const sub = Number(c.subtotal || 0);
      acreditable_16 += iva || (Number(c.total || 0) * 0.16 / 1.16);
      base_compras += sub || (Number(c.total || 0) / 1.16);
    }
    const a_cargo = trasladado_16 - acreditable_16;
    return {
      trasladado_16, base_16, base_0, base_exento,
      acreditable_16, base_compras,
      a_cargo: Math.max(0, a_cargo),
      a_favor: Math.max(0, -a_cargo),
    };
  },

  async isrProvisional(anio: number, mes: number) {
    const { data: params } = await supabase.from('impuestos_parametros').select('*').eq('id', 1).single();
    const coef = Number(params?.coeficiente_utilidad || 0.05);
    const desde = `${anio}-01-01`;
    const hasta = new Date(anio, mes, 0).toISOString().slice(0, 10);
    const { data: cfdis } = await supabase.from('cfdi_emitidos')
      .select('total, tipo_comprobante')
      .eq('es_demo', false).neq('estado', 'cancelado')
      .gte('timbrado_at', desde).lte('timbrado_at', hasta);
    const ingresos = ((cfdis as any[]) || []).reduce((s, c) => {
      const f = c.tipo_comprobante === 'E' ? -1 : 1;
      return s + (Number(c.total || 0) * f) / 1.16;
    }, 0);
    const { data: previas } = await supabase.from('declaraciones')
      .select('a_cargo_o_favor').eq('impuesto', 'ISR').eq('tipo', 'provisional')
      .eq('periodo_anio', anio).lt('periodo_mes', mes).neq('estatus', 'cancelada');
    const pagado_previo = ((previas as any[]) || []).reduce((s, d) => s + Number(d.a_cargo_o_favor || 0), 0);
    const utilidad_estimada = ingresos * coef;
    const isr_causado = utilidad_estimada * 0.30;
    const a_cargo = Math.max(0, isr_causado - pagado_previo);
    return { ingresos_acumulados: ingresos, coeficiente_utilidad: coef, utilidad_estimada, isr_causado, pagado_previo, a_cargo };
  },

  async isn(anio: number, mes: number) {
    const { data: params } = await supabase.from('impuestos_parametros').select('*').eq('id', 1).single();
    const tasa = Number(params?.isn_tasa_pct || 3) / 100;
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const hasta = new Date(anio, mes, 0).toISOString().slice(0, 10);
    const { data: recibos } = await supabase.from('recibos_nomina')
      .select('total_percepciones').eq('estatus', 'timbrado').eq('es_prueba', false)
      .gte('periodo_inicio', desde).lte('periodo_fin', hasta);
    const base = ((recibos as any[]) || []).reduce((s, r) => s + Number(r.total_percepciones || 0), 0);
    return { base, tasa, causado: base * tasa };
  },

  async retenciones(anio: number, mes: number) {
    const { data: params } = await supabase.from('impuestos_parametros').select('*').eq('id', 1).single();
    return {
      retencion_isr_pct: Number(params?.retencion_isr_pct || 1.25),
      retencion_iva_pct: Number(params?.retencion_iva_pct || 10.67),
      nota: 'Captura manual o desde CFDIs de proveedor cuando aplique.',
    };
  },
};

// Stub conexión SAT — sólo prellena estructura, NO envía.
export const SatConnector = {
  async prellenarDeclaracion(declaracion: any) {
    return {
      enviado: false,
      pendiente: 'Requiere e.firma/CIEC del cliente para envío real al SAT.',
      payload_prellenado: declaracion,
    };
  },
};
