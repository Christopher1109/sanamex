// Descarga PDF o XML de un CFDI desde Facturapi (proxy autenticado)
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('FACTURAPI_API_KEY');
    if (!apiKey) return new Response(JSON.stringify({ error: 'FACTURAPI_API_KEY no configurada' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: cErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { facturapi_id, formato } = await req.json();
    if (!facturapi_id || !['pdf', 'xml'].includes(formato)) {
      return new Response(JSON.stringify({ error: 'facturapi_id y formato (pdf|xml) requeridos' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const url = `https://www.facturapi.io/v2/invoices/${facturapi_id}/${formato}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: 'Facturapi error', detalle: text }), { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const buf = await res.arrayBuffer();
    const contentType = formato === 'pdf' ? 'application/pdf' : 'application/xml';
    return new Response(buf, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="cfdi-${facturapi_id}.${formato}"`,
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Error interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
