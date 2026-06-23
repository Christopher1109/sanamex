// Emite recibo de nómina (CFDI 4.0 type N) en Facturapi.
// En sandbox/test produce un recibo de PRUEBA — no afecta saldos fiscales.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchAndStoreCfdiArtifacts } from '../_shared/cfdi-storage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FACTURAPI_BASE = 'https://www.facturapi.io/v2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get('FACTURAPI_API_KEY');
    if (!apiKey) return json({ error: 'FACTURAPI_API_KEY no configurada' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: cErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (cErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json() as { recibo_id: string; es_prueba?: boolean };
    if (!body.recibo_id) return json({ error: 'recibo_id requerido' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: rec } = await admin.from('recibos_nomina').select('*, empleados(*)').eq('id', body.recibo_id).single();
    if (!rec) return json({ error: 'Recibo no encontrado' }, 404);
    const emp = (rec as any).empleados;

    const { data: conceptos } = await admin.from('recibo_conceptos').select('*').eq('recibo_id', body.recibo_id);

    const isTest = apiKey.startsWith('sk_test_');
    const esPrueba = body.es_prueba ?? isTest;

    // Estructura simplificada de complemento nómina 1.2 para Facturapi
    const payload = {
      type: 'N',
      customer: {
        legal_name: emp.nombre,
        tax_id: emp.rfc || 'XAXX010101000',
        tax_system: '605',
        address: { zip: '06000', country: 'MEX' },
      },
      payroll: {
        type: '1',
        payment_date: rec.periodo_fin,
        initial_payment_date: rec.periodo_inicio,
        final_payment_date: rec.periodo_fin,
        days_paid: Number(rec.dias_pagados),
        issuer: { employer_registration: 'A0000000000', from: 'PROPIOS' },
        employee: {
          curp: emp.curp || 'XAXX010101HDFXXX01',
          social_security_number: emp.nss || '00000000000',
          start_date: emp.fecha_alta || rec.periodo_inicio,
          job_position: emp.puesto || 'EMPLEADO',
          contract_type: '01',
          regime_type: emp.regimen || '02',
          working_day_type: '01',
          payment_frequency: emp.periodicidad_pago === 'quincenal' ? '04' : '02',
          base_salary: Number(emp.salario_diario),
          daily_salary: Number(emp.sbc || emp.salario_diario),
          zip_code: '06000',
          state: emp.entidad_federativa || 'MEX',
        },
        perceptions: ((conceptos as any[]) || []).filter(c => c.tipo === 'percepcion').map(c => ({
          code: c.clave, type: c.clave.startsWith('019') ? '019' : c.clave, description: c.descripcion,
          taxed: Number(c.importe_gravado), exempt: Number(c.importe_exento),
        })),
        deductions: ((conceptos as any[]) || []).filter(c => c.tipo === 'deduccion').map(c => ({
          code: c.clave, type: c.clave === '002' ? '002' : '001', description: c.descripcion,
          amount: Number(c.importe_total),
        })),
      },
    };

    // En sandbox, retornamos respuesta simulada si la API rechaza (CSD/registro patronal).
    let pacResp: any;
    let okReal = false;
    try {
      const r = await fetch(`${FACTURAPI_BASE}/invoices`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      pacResp = await r.json();
      okReal = r.ok;
    } catch (e) {
      pacResp = { error: String(e) };
    }

    if (!okReal && esPrueba) {
      // Modo prueba: registra el recibo como "timbrado de prueba" sin CFDI real.
      await admin.from('recibos_nomina').update({
        estatus: 'timbrado', es_prueba: true,
      }).eq('id', body.recibo_id);
      return json({
        ok: true, prueba: true,
        nota: 'Recibo de prueba registrado. Timbrado real requiere CSD/registro patronal en Facturapi.',
        pac_error: pacResp,
      });
    }

    if (!okReal) return json({ error: 'Facturapi error', detalle: pacResp }, 502);

    // Guardar CFDI emitido
    const { data: cfdi } = await admin.from('cfdi_emitidos').insert({
      facturapi_id: pacResp.id,
      uuid_sat: pacResp.uuid,
      folio: pacResp.folio_number?.toString(),
      total: pacResp.total,
      rfc_receptor: emp.rfc,
      estado: 'vigente',
      tipo_comprobante: 'N',
      es_demo: false,
      pac_response: pacResp,
      timbrado_at: new Date().toISOString(),
      created_by: userId,
    }).select('id').single();

    if (cfdi) {
      try { await fetchAndStoreCfdiArtifacts(admin, apiKey, cfdi.id, pacResp.id); } catch {}
      await admin.from('recibos_nomina').update({
        estatus: 'timbrado', cfdi_id: cfdi.id, es_prueba: false,
      }).eq('id', body.recibo_id);
    }

    return json({ ok: true, prueba: false, cfdi_id: cfdi?.id, uuid: pacResp.uuid });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
