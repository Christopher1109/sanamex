// Cancela un CFDI en Facturapi
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const apiKey = Deno.env.get('FACTURAPI_API_KEY');
    if (!apiKey) return j({ error: 'FACTURAPI_API_KEY no configurada' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return j({ error: 'Unauthorized' }, 401);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: cErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (cErr || !claims?.claims) return j({ error: 'Unauthorized' }, 401);

    const { cfdi_id, motivo } = await req.json();
    if (!cfdi_id) return j({ error: 'cfdi_id requerido' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: cfdi } = await admin.from('cfdi_emitidos').select('*').eq('id', cfdi_id).maybeSingle();
    if (!cfdi) return j({ error: 'CFDI no encontrado' }, 404);

    const facturapiId = (cfdi.pac_response as any)?.id;
    if (!facturapiId) return j({ error: 'No hay id Facturapi en este CFDI' }, 400);

    const url = `https://www.facturapi.io/v2/invoices/${facturapiId}?motive=${encodeURIComponent(motivo || '02')}`;
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } });
    const text = await res.text();
    let body: any; try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!res.ok) return j({ error: body?.message || 'Error Facturapi', detalle: body }, res.status);

    await admin.from('cfdi_emitidos').update({ estado: 'cancelado', pac_response: body }).eq('id', cfdi_id);
    return j({ ok: true, facturapi: body });
  } catch (e: any) {
    return j({ error: e?.message || 'Error interno' }, 500);
  }
});
