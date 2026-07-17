// Descarga PDF o XML de un CFDI.
// Estrategia:
//  1) Si el CFDI ya tiene archivo en el bucket 'cfdi' (xml_storage_path / pdf_storage_path)
//     lo servimos directo desde storage (aplica RLS del bucket).
//  2) Si no existe, lo bajamos de Facturapi, lo subimos al bucket como backfill,
//     actualizamos el registro y lo devolvemos al cliente.
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

    const { facturapi_id, formato } = await req.json();
    if (!facturapi_id || !['pdf', 'xml'].includes(formato)) {
      return json({ error: 'facturapi_id y formato (pdf|xml) requeridos' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Buscar registro
    const { data: cfdi } = await admin.from('cfdi_emitidos')
      .select('id, facturapi_id, pac_response, xml_storage_path, pdf_storage_path, rfc_emisor, rfc_receptor, timbrado_at')
      .or(`facturapi_id.eq.${facturapi_id},pac_response->>id.eq.${facturapi_id}`)
      .maybeSingle();

    const pathField = formato === 'pdf' ? 'pdf_storage_path' : 'xml_storage_path';
    const storedPath = (cfdi as any)?.[pathField] as string | null;

    // 1) Si ya está en el bucket, servir desde storage
    if (storedPath) {
      const { data: dl, error: dlErr } = await admin.storage.from('cfdi').download(storedPath);
      if (!dlErr && dl) {
        const buf = await dl.arrayBuffer();
        return binary(buf, formato, facturapi_id);
      }
      // Si falló la descarga (archivo borrado), caemos al fallback Facturapi
    }

    // 2) Bajar de Facturapi
    const url = `https://www.facturapi.io/v2/invoices/${facturapi_id}/${formato}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      const text = await res.text();
      return json({ error: 'Facturapi error', detalle: text }, res.status);
    }
    const buf = new Uint8Array(await res.arrayBuffer());

    // Backfill al bucket para futuras descargas
    try {
      const rfc = ((cfdi as any)?.rfc_emisor || 'SIN_RFC').toUpperCase();
      const year = new Date((cfdi as any)?.timbrado_at || Date.now()).getFullYear();
      const newPath = `${rfc}/${year}/${facturapi_id}.${formato}`;
      const up = await admin.storage.from('cfdi').upload(newPath, buf, {
        contentType: formato === 'pdf' ? 'application/pdf' : 'application/xml',
        upsert: true,
      });
      if (!up.error && cfdi) {
        await admin.from('cfdi_emitidos').update({ [pathField]: newPath }).eq('id', (cfdi as any).id);
      }
    } catch (_) { /* soft-fail — devolvemos el archivo aunque el backfill falle */ }

    return binary(buf.buffer, formato, facturapi_id);
  } catch (e: any) {
    return json({ error: e?.message || 'Error interno' }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function binary(buf: ArrayBuffer, formato: string, id: string) {
  return new Response(buf, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': formato === 'pdf' ? 'application/pdf' : 'application/xml',
      'Content-Disposition': `attachment; filename="cfdi-${id}.${formato}"`,
    },
  });
}
