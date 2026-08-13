import { supabase } from '@/integrations/supabase/client';

// ============================================================
// Motor de comisiones — "Plan Equipo" (v1)
//
// Implementa: Ventas -> Utilidad Bruta -> (menos Gastos, capturados a
// mano) -> Utilidad Neta -> escalón -> % de comisión -> reparto por
// rol -> comisión por empleado.
//
// QUEDA FUERA de esta primera versión (documentado, no inventado):
//   - "Plan Individual" (comisión directa por vendedor sobre su
//     propia utilidad bruta, aparte del Plan Equipo de sucursal).
//   - "Bono Gerentes" como escalón separado.
//   - "Bonos trimestrales A-P-P" y "metas consecutivas" (montos fijos
//     por escalón, aparte de la comisión %).
//   - Captura automática de gastos por sucursal — no existe todavía
//     un módulo de gastos operativos, así que se teclean a mano cada
//     vez que se corre el cálculo.
// Esto se documentó explícitamente en la migración y aquí para que
// se pueda retomar en una siguiente fase, no porque se haya perdido
// de vista.
// ============================================================

export type CategoriaReparto = 'gerente' | 'subgerente' | 'vendedor' | 'almacen';

export type PreviewComision = {
  sucursal_id: string;
  anio: number;
  trimestre: number;
  periodo_inicio: string;
  periodo_fin: string;
  ventas_totales: number;
  costo_ventas: number;
  utilidad_bruta: number;
  gastos_periodo: number;
  utilidad_neta: number;
  escalon: { id: string; orden: number; limite_inferior: number; limite_superior: number | null; pct_comision: number } | null;
  pct_comision_aplicado: number;
  comision_total: number;
  reparto: Array<{
    categoria: CategoriaReparto;
    pct_reparto: number;
    monto_categoria: number;
    empleados: Array<{ id: string; nombre: string; monto: number }>;
  }>;
  empleados_sin_categoria: Array<{ id: string; nombre: string; puesto: string | null }>;
};

// Mapeo puesto -> categoría de reparto. Es una interpretación nuestra
// del catálogo de puestos que vimos en Incidencias_Q14 — el cliente
// no ha confirmado esta tabla. Puestos administrativos/corporativos
// (auxiliar contable, coordinador calidad, gerente compras, etc.) NO
// entran al Plan Equipo de sucursal; en el Excel real tienen su
// propia sección "Bonos Administración" que no se implementó aquí.
function categorizarPuesto(puesto: string | null): CategoriaReparto | null {
  if (!puesto) return null;
  const p = puesto.toUpperCase();
  if (p.includes('SUBGERENTE') || p.includes('SUB-GERENTE') || p.includes('SUB GERENTE')) return 'subgerente';
  if (p.includes('GERENTE')) return 'gerente'; // después de checar subgerente
  if (p.includes('VENTAS') || p.includes('SURTIDO') || p.includes('PROSPECTOR')) return 'vendedor';
  if (p.includes('ALMACEN') || p.includes('ALMACÉN') || p.includes('REPARTO')) return 'almacen';
  return null; // administración/corporativo — fuera del Plan Equipo v1
}

function rangoTrimestre(anio: number, trimestre: number): { inicio: string; fin: string } {
  const mesInicio = (trimestre - 1) * 3; // 0-indexed
  const inicio = new Date(Date.UTC(anio, mesInicio, 1));
  const fin = new Date(Date.UTC(anio, mesInicio + 3, 0)); // último día del 3er mes
  return { inicio: inicio.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
}

export const ComisionesCalculator = {
  rangoTrimestre,

  async calcularPreview(sucursalId: string, anio: number, trimestre: number, gastosPeriodo: number): Promise<PreviewComision> {
    const { inicio, fin } = rangoTrimestre(anio, trimestre);

    // Ventas del trimestre en la sucursal, con costo de cada línea vía su lote.
    const { data: ventas, error: errVentas } = await supabase
      .from('ventas')
      .select('id, venta_lineas(cantidad, subtotal, lotes(costo_unitario))')
      .eq('sucursal_id', sucursalId)
      .gte('fecha', inicio)
      .lte('fecha', fin)
      .neq('estado', 'cancelada');
    if (errVentas) throw errVentas;

    let ventasTotales = 0;
    let costoVentas = 0;
    for (const v of (ventas as any[]) || []) {
      for (const l of v.venta_lineas || []) {
        ventasTotales += Number(l.subtotal || 0);
        costoVentas += Number(l.cantidad || 0) * Number(l.lotes?.costo_unitario || 0);
      }
    }
    const utilidadBruta = ventasTotales - costoVentas;
    const utilidadNeta = utilidadBruta - gastosPeriodo;

    // Escalón aplicable: primero el específico de la sucursal, si no hay, el global.
    const { data: escalones, error: errEsc } = await (supabase as any)
      .from('comisiones_escalones')
      .select('*')
      .eq('anio', anio).eq('trimestre', trimestre)
      .or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
      .order('orden');
    if (errEsc) throw errEsc;

    const especificos = ((escalones as any[]) || []).filter(e => e.sucursal_id === sucursalId);
    const pool = especificos.length > 0 ? especificos : ((escalones as any[]) || []).filter(e => e.sucursal_id === null);

    const escalon = pool.find(e =>
      utilidadNeta >= Number(e.limite_inferior) &&
      (e.limite_superior === null || utilidadNeta <= Number(e.limite_superior))
    ) || null;

    const pctAplicado = escalon ? Number(escalon.pct_comision) : 0;
    const comisionTotal = utilidadNeta > 0 ? Math.round(utilidadNeta * pctAplicado) / 100 : 0;

    // Reparto por rol
    const { data: repartoRoles, error: errRep } = await (supabase as any)
      .from('comisiones_reparto_roles').select('*');
    if (errRep) throw errRep;

    const { data: empleados, error: errEmp } = await supabase
      .from('empleados').select('id, nombre, puesto')
      .eq('sucursal_id', sucursalId).eq('activo', true);
    if (errEmp) throw errEmp;

    const porCategoria = new Map<CategoriaReparto, Array<{ id: string; nombre: string }>>();
    const sinCategoria: Array<{ id: string; nombre: string; puesto: string | null }> = [];
    for (const e of (empleados as any[]) || []) {
      const cat = categorizarPuesto(e.puesto);
      if (!cat) { sinCategoria.push({ id: e.id, nombre: e.nombre, puesto: e.puesto }); continue; }
      if (!porCategoria.has(cat)) porCategoria.set(cat, []);
      porCategoria.get(cat)!.push({ id: e.id, nombre: e.nombre });
    }

    const reparto: PreviewComision['reparto'] = [];
    for (const r of (repartoRoles as any[]) || []) {
      const cat = r.categoria as CategoriaReparto;
      const empsCat = porCategoria.get(cat) || [];
      const montoCategoria = Math.round(comisionTotal * Number(r.pct_reparto)) / 100;
      const montoPorEmpleado = empsCat.length > 0 ? Math.round((montoCategoria / empsCat.length) * 100) / 100 : 0;
      reparto.push({
        categoria: cat,
        pct_reparto: Number(r.pct_reparto),
        monto_categoria: montoCategoria,
        empleados: empsCat.map(e => ({ ...e, monto: montoPorEmpleado })),
      });
    }

    return {
      sucursal_id: sucursalId, anio, trimestre, periodo_inicio: inicio, periodo_fin: fin,
      ventas_totales: ventasTotales, costo_ventas: costoVentas, utilidad_bruta: utilidadBruta,
      gastos_periodo: gastosPeriodo, utilidad_neta: utilidadNeta,
      escalon: escalon ? { id: escalon.id, orden: escalon.orden, limite_inferior: Number(escalon.limite_inferior), limite_superior: escalon.limite_superior === null ? null : Number(escalon.limite_superior), pct_comision: Number(escalon.pct_comision) } : null,
      pct_comision_aplicado: pctAplicado, comision_total: comisionTotal,
      reparto, empleados_sin_categoria: sinCategoria,
    };
  },

  // Guarda la corrida en comisiones_calculo_sucursal y genera una fila
  // en `comisiones` (la tabla ya existente) por cada empleado que le
  // tocó parte del reparto — así el resto del sistema (nómina, etc.)
  // no necesita saber que existe un motor nuevo, solo lee `comisiones`
  // como ya hacía.
  async aplicarCalculo(preview: PreviewComision, userId: string | null): Promise<string> {
    const { data: calc, error: errCalc } = await (supabase as any)
      .from('comisiones_calculo_sucursal')
      .insert({
        sucursal_id: preview.sucursal_id, anio: preview.anio, trimestre: preview.trimestre,
        ventas_totales: preview.ventas_totales, costo_ventas: preview.costo_ventas,
        utilidad_bruta: preview.utilidad_bruta, gastos_periodo: preview.gastos_periodo,
        utilidad_neta: preview.utilidad_neta, escalon_id: preview.escalon?.id || null,
        pct_comision_aplicado: preview.pct_comision_aplicado, comision_total: preview.comision_total,
        aplicada: true, calculado_por: userId,
      })
      .select('id').single();
    if (errCalc) throw errCalc;
    const calculoId = calc!.id as string;

    const filas = preview.reparto.flatMap(r => r.empleados
      .filter(e => e.monto > 0)
      .map(e => ({
        empleado_id: e.id,
        periodo_inicio: preview.periodo_inicio,
        periodo_fin: preview.periodo_fin,
        base_calculo: preview.utilidad_neta,
        porcentaje: preview.pct_comision_aplicado,
        monto: e.monto,
        grava: true,
        notas: `Motor de comisiones — Plan Equipo Q${preview.trimestre} ${preview.anio} — categoría ${r.categoria} (${r.pct_reparto}% del total, repartido entre ${r.empleados.length} empleado(s))`,
        calculo_id: calculoId,
        categoria_reparto: r.categoria,
      })));

    if (filas.length > 0) {
      const { error: errIns } = await (supabase as any).from('comisiones').insert(filas);
      if (errIns) throw errIns;
    }
    return calculoId;
  },
};
