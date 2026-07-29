import { supabase } from '@/integrations/supabase/client';

// Calculo fino de IVA mensual: trasladado (ventas, segmentado por la tasa
// real de cada producto) vs acreditable (compras, usando el impuesto ya
// capturado por compra). Corrige dos problemas del calculo anterior:
//   1) Ya no asume 16% parejo sobre el 100% de las ventas -- en farmacia la
//      mayoria de los productos son 0%/exentos, asumir 16% parejo
//      sobrestimaba el IVA trasladado.
//   2) El acreditable de compras leia una columna "iva" que no existe en la
//      tabla `compras` (la columna real es "impuestos"); ahora usa la
//      columna correcta.
// Los montos sin tasa de IVA definida en el catalogo (`productos.iva_tasa`
// es null) o sin linea de detalle ligada al CFDI se agrupan en
// "sin_clasificar" y se muestran aparte, en vez de adivinar una tasa.
export const ImpuestosCalculator = {
    async ivaMensual(anio: number, mes: number) {
          const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
          const hasta = new Date(anio, mes, 0).toISOString().slice(0, 10);

      // ---------- IVA TRASLADADO (ventas) ----------
      const { data: cfdisData } = await supabase.from('cfdi_emitidos')
            .select('id, total, tipo_comprobante, venta_id, es_agrupada')
            .eq('es_demo', false).neq('estado', 'cancelado')
            .gte('timbrado_at', desde).lte('timbrado_at', hasta + 'T23:59:59');
          const cfdis = (cfdisData as any[]) || [];

      const idsAgrupados = cfdis.filter(c => c.es_agrupada).map(c => c.id);
          const ventasPorCfdiAgrupado = new Map<string, string[]>();
          if (idsAgrupados.length) {
                  const { data: rel } = await supabase.from('cfdi_ventas_agrupadas')
                    .select('cfdi_id, venta_id').in('cfdi_id', idsAgrupados);
                  for (const r of (rel as any[]) || []) {
                            const arr = ventasPorCfdiAgrupado.get(r.cfdi_id) || [];
                            arr.push(r.venta_id);
                            ventasPorCfdiAgrupado.set(r.cfdi_id, arr);
                  }
          }

      const todasLasVentaIds = Array.from(new Set([
              ...cfdis.filter(c => !c.es_agrupada && c.venta_id).map(c => c.venta_id as string),
              ...Array.from(ventasPorCfdiAgrupado.values()).flat(),
            ]));

      const lineasPorVenta = new Map<string, { subtotal: number; iva_tasa: number | null; iva_incluido: boolean }[]>();
          if (todasLasVentaIds.length) {
                  const { data: lineasData } = await supabase.from('venta_lineas')
                    .select('venta_id, subtotal, productos(iva_tasa, iva_incluido)')
                    .in('venta_id', todasLasVentaIds);
                  for (const l of (lineasData as any[]) || []) {
                            const arr = lineasPorVenta.get(l.venta_id) || [];
                            arr.push({
                                        subtotal: Number(l.subtotal) || 0,
                                        iva_tasa: l.productos?.iva_tasa ?? null,
                                        iva_incluido: !!l.productos?.iva_incluido,
                            });
                            lineasPorVenta.set(l.venta_id, arr);
                  }
          }

      const buckets: Record<string, { base: number; iva: number }> = {};
          const addBucket = (key: string, base: number, iva: number) => {
                  if (!buckets[key]) buckets[key] = { base: 0, iva: 0 };
                  buckets[key].base += base;
                  buckets[key].iva += iva;
          };

      for (const c of cfdis) {
              if (c.tipo_comprobante === 'P') continue; // REP (complemento de pago): no es un nuevo hecho gravable.
            const factor = c.tipo_comprobante === 'E' ? -1 : 1; // Egreso/nota de credito resta.

            const ventaIds = c.es_agrupada ? (ventasPorCfdiAgrupado.get(c.id) || []) : (c.venta_id ? [c.venta_id] : []);
              const lineas = ventaIds.flatMap(vid => lineasPorVenta.get(vid) || []);

            if (!lineas.length) {
                      // Sin linea de detalle ligada (p.ej. nota de credito global sin
                // desglose): se deja visible en "sin clasificar" en vez de adivinar.
                addBucket('sin_clasificar', Number(c.total) * factor, 0);
                      continue;
            }

            for (const l of lineas) {
                      if (l.iva_tasa === null || l.iva_tasa === undefined) {
                                  addBucket('sin_clasificar', l.subtotal * factor, 0);
                                  continue;
                      }
                      const tasaDec = l.iva_tasa / 100;
                      let base: number;
                      let iva: number;
                      if (l.iva_incluido) {
                                  base = tasaDec > 0 ? l.subtotal / (1 + tasaDec) : l.subtotal;
                                  iva = l.subtotal - base;
                      } else {
                                  base = l.subtotal;
                                  iva = l.subtotal * tasaDec;
                      }
                      addBucket(String(l.iva_tasa), base * factor, iva * factor);
            }
      }

      const trasladado_16 = buckets['16']?.iva || 0;
          const base_16 = buckets['16']?.base || 0;
          const trasladado_8 = buckets['8']?.iva || 0;
          const base_8 = buckets['8']?.base || 0;
          const base_0 = buckets['0']?.base || 0;
          const base_exento = 0; // hoy el catalogo no distingue "0%" de "exento"; ambos usan iva_tasa = 0.
      const base_sin_clasificar = buckets['sin_clasificar']?.base || 0;
          const trasladado_total = Object.values(buckets).reduce((s, b) => s + b.iva, 0);

      // ---------- IVA ACREDITABLE (compras) ----------
      // Usa el impuesto ya capturado por compra (columna `impuestos`), no una
      // tasa asumida. Si una compra no trae impuesto capturado, se reporta en
      // `compras_sin_impuesto_capturado` para que se revise en vez de asumir.
      const { data: comprasData } = await supabase.from('compras')
            .select('total, subtotal, impuestos')
            .neq('estado', 'cancelada')
            .gte('created_at', desde).lte('created_at', hasta + 'T23:59:59');
          const compras = (comprasData as any[]) || [];

      let acreditable_16 = 0;
          let base_compras = 0;
          let compras_sin_impuesto_capturado = 0;
          for (const c of compras) {
                  const impuesto = Number(c.impuestos || 0);
                  const sub = Number(c.subtotal || 0);
                  acreditable_16 += impuesto;
                  base_compras += sub;
                  if (impuesto === 0 && sub > 0) compras_sin_impuesto_capturado += sub;
          }

      const a_cargo = trasladado_total - acreditable_16;
          return {
                  trasladado_16, base_16,
                  trasladado_8, base_8,
                  base_0, base_exento,
                  base_sin_clasificar,
                  trasladado_total,
                  acreditable_16, base_compras,
                  compras_sin_impuesto_capturado,
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
          const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
          const hasta = new Date(anio, mes, 0).toISOString().slice(0, 10);
          // Recibos con empleado y sucursal (para obtener el estado)
      const { data: recibos } = await supabase.from('recibos_nomina')
            .select('total_percepciones, empleados:empleado_id(sucursal_id, entidad_federativa, sucursales:sucursal_id(estado, estado_confirmado, codigo))')
            .in('estatus', ['timbrado','pagado'])
            .eq('es_prueba', false)
            .gte('periodo_inicio', desde).lte('periodo_fin', hasta);
          const { data: tasas } = await supabase.from('isn_tasas_estado').select('*');
          const tasaMap = new Map<string, { tasa: number; confirmado: boolean }>();
          for (const t of (tasas as any[]) || []) {
                  tasaMap.set(String(t.estado).toUpperCase(), { tasa: Number(t.tasa_pct)/100, confirmado: !!t.confirmado });
          }
          const porEstado: Record<string, { base: number; tasa: number; causado: number; confirmado: boolean; codigo?: string }> = {};
          let base_total = 0, causado_total = 0;
          for (const r of (recibos as any[]) || []) {
                  const suc = r.empleados?.sucursales;
                  const estado = String(suc?.estado || r.empleados?.entidad_federativa || 'SIN_ESTADO').toUpperCase();
                  const info = tasaMap.get(estado) || { tasa: 0, confirmado: false };
                  const importe = Number(r.total_percepciones || 0);
                  const causado = importe * info.tasa;
                  if (!porEstado[estado]) porEstado[estado] = { base: 0, tasa: info.tasa, causado: 0, confirmado: info.confirmado, codigo: suc?.codigo };
                  porEstado[estado].base += importe;
                  porEstado[estado].causado += causado;
                  base_total += importe; causado_total += causado;
          }
          return { por_estado: porEstado, base: base_total, causado: causado_total };
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

// Stub conexion SAT -- solo prellena estructura, NO envia.
export const SatConnector = {
    async prellenarDeclaracion(declaracion: any) {
          return {
                  enviado: false,
                  pendiente: 'Requiere e.firma/CIEC del cliente para envio real al SAT.',
                  payload_prellenado: declaracion,
          };
    },
};
