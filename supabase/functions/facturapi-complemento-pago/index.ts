// Emite un Complemento de Recepción de Pagos 2.0 (REP) vía Facturapi
// referenciando una factura PPD previamente timbrada.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchAndStoreCfdiArtifacts } from '../_shared/cfdi-storage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const FACTURAPI_BASE = 'https://www.facturapi.io/v2';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get('FACTURAPI_API_KEY');
    if (!apiKey) return json({ error: 'FACTURAPI_API_KEY no configurada' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: cErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (cErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const { factura_id, monto, fecha_pago, forma_pago, num_parcialidad } = body;
    if (!factura_id || !monto || !forma_pago) {
      return json({ error: 'factura_id, monto y forma_pago requeridos' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: factura, error: fErr } = await admin
      .from('cfdi_emitidos').select('*').eq('id', factura_id).maybeSingle();
    if (fErr || !factura) return json({ error: 'Factura no encontrada' }, 404);
    if (factura.estado !== 'timbrado') return json({ error: 'La factura no está timbrada' }, 400);
    if (!factura.facturapi_id && !(factura.pac_response as any)?.id) {
      return json({ error: 'La factura no tiene id de Facturapi (probablemente es demo)' }, 400);
    }
    const facturaFacturapiId = factura.facturapi_id || (factura.pac_response as any).id;

    const { data: cfg } = await admin.from('configuracion_fiscal').select('*').is('sucursal_id', null).maybeSingle();
    if (!cfg) return json({ error: 'Sin configuración fiscal global' }, 400);

    const fechaPagoIso = fecha_pago ? new Date(fecha_pago).toISOString() : new Date().toISOString();
    const parcialidad = Number(num_parcialidad || 1);

    // Saldo anterior / saldo insoluto
    const { data: pagosPrev } = await admin
      .from('pagos_recibidos').select('monto').eq('factura_id', factura_id).eq('estado', 'registrado');
    const pagadoPrev = (pagosPrev || []).reduce((s: number, p: any) => s + Number(p.monto), 0);
    const saldoAnterior = Number(factura.total) - pagadoPrev;
    const saldoInsoluto = Math.max(0, saldoAnterior - Number(monto));

    const payload = {
      type: 'P', // Pago
      payments: [{
        payment_form: forma_pago,
        date: fechaPagoIso,
        currency: 'MXN',
        amount: Number(monto),
        related_documents: [{
          uuid: factura.uuid_sat,
          relationship: '01',
          installment: parcialidad,
          last_balance: saldoAnterior,
          amount: Number(monto),
          currency: 'MXN',
          taxes: [],
        }],
      }],
      folio_number: cfg.folio_actual || 1,
      series: cfg.serie_rep || 'P',
    };

    const res = await fetch(`${FACTURAPI_BASE}/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const respText = await res.text();
    let respJson: any; try { respJson = JSON.parse(respText); } catch { respJson = { raw: respText }; }

    if (!res.ok) {
      return json({ error: respJson?.message || 'Error Facturapi', detalle: respJson }, res.status);
    }

    // Resguardar XML/PDF
    const stored = await fetchAndStoreCfdiArtifacts({
      admin, apiKey, facturapiId: respJson.id, rfcEmisor: cfg.rfc || 'SIN_RFC',
    });

    // Insertar el REP en cfdi_emitidos
    const { data: repRow, error: insErr } = await admin.from('cfdi_emitidos').insert({
      sucursal_id: factura.sucursal_id,
      uuid_sat: respJson.uuid,
      serie: respJson.series,
      folio: respJson.folio_number,
      rfc_receptor: factura.rfc_receptor,
      total: 0, // REP siempre lleva total 0
      estado: 'timbrado',
      tipo_comprobante: 'P',
      facturapi_id: respJson.id,
      relacionado_uuid: factura.uuid_sat,
      pac_response: respJson,
      timbrado_at: new Date().toISOString(),
      xml_url: `facturapi:${respJson.id}/xml`,
      pdf_url: `facturapi:${respJson.id}/pdf`,
      xml_storage_path: stored.xml_storage_path,
      pdf_storage_path: stored.pdf_storage_path,
      es_demo: false,
      created_by: userId,
    }).select().single();

    if (insErr) console.error('Error guardando REP:', insErr);

    await admin.from('configuracion_fiscal').update({ folio_actual: (cfg.folio_actual || 1) + 1 }).eq('id', cfg.id);

    const { data: pagoRow } = await admin.from('pagos_recibidos').insert({
      factura_id,
      fecha_pago: fechaPagoIso,
      monto: Number(monto),
      forma_pago,
      num_parcialidad: parcialidad,
      rep_cfdi_id: repRow?.id || null,
      rep_facturapi_id: respJson.id,
      rep_uuid_sat: respJson.uuid,
      estado: 'registrado',
      created_by: userId,
    }).select().single();

    return json({ ok: true, rep: repRow, pago: pagoRow, saldo_insoluto: saldoInsoluto });
  } catch (e: any) {
    console.error('complemento-pago error', e);
    return json({ error: e?.message || 'Error interno' }, 500);
  }
});
