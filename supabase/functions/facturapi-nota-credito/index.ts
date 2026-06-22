// Emite una nota de crédito (CFDI Egreso 'E') con relación 01 a una factura previa.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchAndStoreCfdiArtifacts } from '../_shared/cfdi-storage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const FACTURAPI_BASE = 'https://www.facturapi.io/v2';
const DEFAULT_PRODUCT_KEY = '84111506';
const DEFAULT_UNIT_KEY = 'ACT';

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    const { factura_id, monto, motivo, forma_pago } = await req.json();
    if (!factura_id || !monto) return json({ error: 'factura_id y monto requeridos' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: factura } = await admin.from('cfdi_emitidos').select('*').eq('id', factura_id).maybeSingle();
    if (!factura) return json({ error: 'Factura no encontrada' }, 404);
    if (factura.estado !== 'timbrado') return json({ error: 'La factura no está timbrada' }, 400);
    if (!factura.uuid_sat) return json({ error: 'Factura sin UUID SAT' }, 400);

    const { data: cfg } = await admin.from('configuracion_fiscal').select('*').is('sucursal_id', null).maybeSingle();
    if (!cfg) return json({ error: 'Sin configuración fiscal global' }, 400);

    const montoNum = Number(monto);
    const payload: any = {
      type: 'E',
      customer: {
        legal_name: 'PUBLICO EN GENERAL',
        tax_id: factura.rfc_receptor,
        tax_system: '616',
        address: { zip: cfg.cp_emisor || '00000' },
      },
      items: [{
        quantity: 1,
        product: {
          description: motivo || 'Nota de crédito',
          product_key: DEFAULT_PRODUCT_KEY,
          unit_key: DEFAULT_UNIT_KEY,
          price: montoNum,
          taxability: '02',
          taxes: [{ type: 'IVA', rate: 0, factor: 'Exento' }],
        },
      }],
      use: 'G02',
      payment_form: forma_pago || '01',
      payment_method: 'PUE',
      folio_number: cfg.folio_actual || 1,
      series: cfg.serie_egreso || 'E',
      related_documents: [{ relationship: '01', documents: [factura.uuid_sat] }],
      // fallback alternativo en versiones del SDK:
      related: [factura.uuid_sat],
      relation: '01',
    };

    const res = await fetch(`${FACTURAPI_BASE}/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const respText = await res.text();
    let respJson: any; try { respJson = JSON.parse(respText); } catch { respJson = { raw: respText }; }
    if (!res.ok) return json({ error: respJson?.message || 'Error Facturapi', detalle: respJson }, res.status);

    const stored = await fetchAndStoreCfdiArtifacts({
      admin, apiKey, facturapiId: respJson.id, rfcEmisor: cfg.rfc || 'SIN_RFC',
    });

    const { data: ncRow, error: insErr } = await admin.from('cfdi_emitidos').insert({
      sucursal_id: factura.sucursal_id,
      uuid_sat: respJson.uuid,
      serie: respJson.series,
      folio: respJson.folio_number,
      rfc_receptor: factura.rfc_receptor,
      total: Number(respJson.total ?? montoNum),
      estado: 'timbrado',
      tipo_comprobante: 'E',
      tipo_relacion: '01',
      relacionado_uuid: factura.uuid_sat,
      facturapi_id: respJson.id,
      pac_response: respJson,
      timbrado_at: new Date().toISOString(),
      xml_url: `facturapi:${respJson.id}/xml`,
      pdf_url: `facturapi:${respJson.id}/pdf`,
      xml_storage_path: stored.xml_storage_path,
      pdf_storage_path: stored.pdf_storage_path,
      es_demo: false,
      created_by: userId,
    }).select().single();
    if (insErr) console.error('Error guardando NC:', insErr);

    await admin.from('configuracion_fiscal').update({ folio_actual: (cfg.folio_actual || 1) + 1 }).eq('id', cfg.id);

    return json({ ok: true, nota_credito: ncRow });
  } catch (e: any) {
    console.error('nota-credito error', e);
    return json({ error: e?.message || 'Error interno' }, 500);
  }
});
