import { supabase } from '@/integrations/supabase/client';
import { categorizarPuesto } from './ComisionesCalculator';

// Motor de nómina simplificado pero funcional. Tablas ISR vienen de tablas_isr
// (versionables por año). Subsidio al empleo: aplica tabla SAT (placeholder simple aquí).
export type ConceptoCalculado = {
  clave: string; descripcion: string; tipo: 'percepcion'|'deduccion'|'otro_pago';
  importe_gravado: number; importe_exento: number; importe_total: number;
};

const IMSS_OBRERO_PCT = 0.02375; // tasa promedio obrera aprox (excedente + prestaciones + invalidez + cesantía)

async function calcularISRPeriodo(grav: number, periodicidad: string, anio: number) {
  const { data: tabla } = await supabase.from('tablas_isr')
    .select('*').eq('anio', anio).eq('periodicidad', periodicidad === 'quincenal' ? 'quincenal' : 'mensual').eq('tipo', 'isr')
    .order('limite_inferior');
  let rows = (tabla as any[]) || [];
  // Fallback: si no hay quincenal, convierte mensual /2
  if (!rows.length) {
    const { data: mensual } = await supabase.from('tablas_isr')
      .select('*').eq('anio', anio).eq('periodicidad', 'mensual').eq('tipo', 'isr').order('limite_inferior');
    rows = ((mensual as any[]) || []).map(r => ({
      ...r,
      limite_inferior: Number(r.limite_inferior) / 2,
      limite_superior: r.limite_superior ? Number(r.limite_superior) / 2 : null,
      cuota_fija: Number(r.cuota_fija) / 2,
    }));
  }
  if (!rows.length) return 0;
  const tramo = rows.find(r => grav >= Number(r.limite_inferior) && (!r.limite_superior || grav <= Number(r.limite_superior)))
    || rows[rows.length - 1];
  const excedente = grav - Number(tramo.limite_inferior);
  return Number(tramo.cuota_fija) + excedente * Number(tramo.tasa_excedente);
}

export const NominaCalculator = {
  async calcularRecibo(empleadoId: string, inicio: string, fin: string): Promise<{
    conceptos: ConceptoCalculado[]; total_percepciones: number; total_deducciones: number;
    neto: number; dias_pagados: number;
  }> {
    const { data: emp } = await supabase.from('empleados').select('*').eq('id', empleadoId).single();
    const { data: params } = await supabase.from('impuestos_parametros').select('*').eq('id', 1).single();
    if (!emp) throw new Error('Empleado no encontrado');
    const sd = Number(emp.salario_diario || 0);
    const dias = Math.floor((new Date(fin).getTime() - new Date(inicio).getTime()) / 86400000) + 1;
    const periodicidad = emp.periodicidad_pago || params?.periodicidad_nomina || 'quincenal';
    const anio = new Date(inicio).getFullYear();

    // Asistencia del periodo
    const { data: asist } = await supabase.from('asistencia')
      .select('*').eq('empleado_id', empleadoId).gte('fecha', inicio).lte('fecha', fin);
    const a: any[] = (asist as any[]) || [];
    const faltas = a.filter(x => x.incidencia === 'falta').length;
    const retardos = a.filter(x => x.incidencia === 'retardo').length;
    const festivos = a.filter(x => x.incidencia === 'dia_festivo' || x.incidencia === 'descanso_laborado').length;
    const horasExtra = a.reduce((s, x) => s + Number(x.horas_extra || 0), 0);
    const diasPagados = Math.max(0, dias - faltas);

    const sueldo = sd * diasPagados;
    const conceptos: ConceptoCalculado[] = [];
    conceptos.push({ clave: '001', descripcion: 'Sueldo', tipo: 'percepcion', importe_gravado: sueldo, importe_exento: 0, importe_total: sueldo });
    if (retardos === 0 && faltas === 0) {
      // Bono "mixto" (13-ago-2026): el % ahora se busca por categoría de
      // puesto en nomina_bono_puntualidad_config en vez de estar fijo en
      // el código. Se sembró 10% parejo para TODAS las categorías, que es
      // exactamente la Regla A confirmada el 27-jul — así que hoy el
      // resultado no cambia. Queda listo para que, en cuanto se cierre en
      // la junta cuál regla aplica (la plana o la variable por puesto de
      // CONTPAQi), se ajuste solo la tabla, sin tocar código de nuevo.
      const categoria = categorizarPuesto(emp.puesto) || 'otros';
      const { data: cfgRow } = await supabase
        .from('nomina_bono_puntualidad_config' as any)
        .select('pct_mensual').eq('categoria', categoria).maybeSingle();
      const pctMensual = Number((cfgRow as any)?.pct_mensual ?? 10);
      const factorPuntualidad = periodicidad === 'quincenal' ? pctMensual / 200
        : periodicidad === 'semanal' ? pctMensual / 100 / 4.345
        : pctMensual / 100; // mensual
      const punt = Math.round(sueldo * factorPuntualidad * 100) / 100;
      conceptos.push({ clave: '010', descripcion: 'Premio por puntualidad', tipo: 'percepcion', importe_gravado: punt, importe_exento: 0, importe_total: punt });
    }
    if (festivos > 0) {
      const monto = sd * festivos * 2;
      conceptos.push({ clave: '019F', descripcion: 'Día festivo/descanso laborado', tipo: 'percepcion', importe_gravado: monto, importe_exento: 0, importe_total: monto });
    }
    if (horasExtra > 0) {
      const monto = (sd / 8) * horasExtra * 2;
      conceptos.push({ clave: '019H', descripcion: 'Horas extra', tipo: 'percepcion', importe_gravado: monto, importe_exento: 0, importe_total: monto });
    }

    // Vales de despensa — SUPUESTO PENDIENTE DE CONFIRMAR CON EL CLIENTE.
    // En la reunión el cliente dijo "chance es por antigüedad" pero no
    // cerró la regla. Con base en el histórico real de CONTPAQi que nos
    // compartieron (Q14, 2da quincena jul-2026), los empleados que ya
    // estaban activos ANTES del inicio del periodo recibieron un monto
    // fijo (~$1,320 quincenales); los de alta reciente dentro del mismo
    // periodo recibieron $0 (se entiende que se prorratea a 0 en su
    // primer periodo incompleto). Esa es la regla que se implementa
    // aquí como primera versión — falta que el cliente confirme si es
    // correcta, si cambia por puesto, o si hay una tabla de antigüedad
    // con montos escalonados.
    const DESPENSA_QUINCENAL = 1320;
    const yaActivoAlIniciarPeriodo = !emp.fecha_alta || new Date(emp.fecha_alta) < new Date(inicio);
    if (yaActivoAlIniciarPeriodo) {
      conceptos.push({ clave: '029', descripcion: 'Vales de despensa', tipo: 'percepcion', importe_gravado: 0, importe_exento: DESPENSA_QUINCENAL, importe_total: DESPENSA_QUINCENAL });
    }

    const totalGravado = conceptos.filter(c => c.tipo === 'percepcion').reduce((s, c) => s + c.importe_gravado, 0);
    const isr = await calcularISRPeriodo(totalGravado, periodicidad, anio);
    const sbc = Number(emp.sbc || sd);
    const imss = sbc * diasPagados * IMSS_OBRERO_PCT;

    // Cuota patronal RT según registro patronal del empleado
    let primaRT = 0;
    if (emp.registro_patronal) {
      const { data: prt } = await supabase.from('primas_riesgo_patronal')
        .select('prima_rt').eq('registro_patronal', emp.registro_patronal).eq('activo', true).maybeSingle();
      primaRT = Number(prt?.prima_rt || 0);
    }
    const cuotaRT = sbc * diasPagados * primaRT;

    if (isr > 0) conceptos.push({ clave: '002', descripcion: 'ISR', tipo: 'deduccion', importe_gravado: 0, importe_exento: 0, importe_total: isr });
    if (imss > 0) conceptos.push({ clave: '001D', descripcion: 'IMSS obrero', tipo: 'deduccion', importe_gravado: 0, importe_exento: 0, importe_total: imss });
    if (cuotaRT > 0) conceptos.push({ clave: 'RT', descripcion: `Cuota patronal RT (${(primaRT*100).toFixed(4)}%)`, tipo: 'otro_pago', importe_gravado: 0, importe_exento: 0, importe_total: cuotaRT });

    const total_percepciones = conceptos.filter(c => c.tipo === 'percepcion').reduce((s, c) => s + c.importe_total, 0);
    const total_deducciones = conceptos.filter(c => c.tipo === 'deduccion').reduce((s, c) => s + c.importe_total, 0);
    return { conceptos, total_percepciones, total_deducciones, neto: total_percepciones - total_deducciones, dias_pagados: diasPagados };
  },

  async guardarRecibo(empleadoId: string, inicio: string, fin: string, esPrueba = false) {
    const calc = await this.calcularRecibo(empleadoId, inicio, fin);
    const { data: rec, error } = await supabase.from('recibos_nomina').insert({
      empleado_id: empleadoId, periodo_inicio: inicio, periodo_fin: fin,
      dias_pagados: calc.dias_pagados, total_percepciones: calc.total_percepciones,
      total_deducciones: calc.total_deducciones, neto_pagado: calc.neto,
      estatus: 'generado', es_prueba: esPrueba,
    }).select('id').single();
    if (error) throw error;
    await supabase.from('recibo_conceptos').insert(calc.conceptos.map(c => ({ ...c, recibo_id: rec!.id })));
    return rec!.id;
  },
};

// Adaptador biométrico — stub pendiente de equipo del cliente.
export const BiometricoConnector = {
  disponible: false,
  async sincronizar(_desde: string, _hasta: string) {
    throw new Error('Conector biométrico pendiente: requiere modelo/IP del equipo del cliente.');
  },
};
