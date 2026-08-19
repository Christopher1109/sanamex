// Portal público de autofacturación (self-service).
//
// El cliente captura sucursal + folio del ticket + total y sus datos fiscales,
// y el CFDI se timbra AL INSTANTE contra Facturapi. La respuesta incluye URLs
// firmadas del PDF y del XML, y además se envía la factura por correo.
//
// Acciones:
//   { action: 'sucursales' }  -> catálogo público de sucursales (para el select)
//   (default)                 -> valida ticket, timbra y entrega PDF/XML + correo
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchAndStoreCfdiArtifacts } from '../_shared/cfdi-storage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const RFC_RE = /^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/i;
const FACTURAPI_BASE = 'https://www.facturapi.io/v2';
const DEFAULT_PRODUCT_KEY = '51171800';
const DEFAULT_UNIT_KEY = 'H87';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // --- Catálogo público de sucursales (el portal es anónimo, no puede leer la tabla directo)
    if (body.action === 'sucursales' || req.method === 'GET') {
      const { data, error } = await admin
        .from('sucursales')
        .select('id, nombre, codigo')
        .eq('activo', true)
        .order('nombre');
      if (error) return json({ error: error.message }, 400);
      return json({ sucursales: data || [] });
    }

    const sucursalId = String(body.sucursal_id || '').trim();
    const folio = String(body.folio || '').trim();
    const total = Number(body.total);
    const rfc = String(body.rfc || '').trim().toUpperCase();
    const razonSocial = String(body.razon_social || '').trim();
    const regimen = String(body.regimen_fiscal || '').trim();
    const cp = String(body.codigo_postal || '').trim();
    const email = String(body.email || '').trim();
    const usoCfdi = String(body.uso_cfdi || 'G03').trim();

    if (!sucursalId || !folio) return json({ error: 'Selecciona la sucursal y captura el folio del ticket' }, 400);
    if (!Number.isFinite(total) || total <= 0) return json({ error: 'Captura el total del ticket' }, 400);
    if (!RFC_RE.test(rfc)) return json({ error: 'El RFC no tiene un formato válido' }, 400);
    if (!razonSocial || !regimen || !cp || !email) return json({ error: 'Faltan datos fiscales obligatorios' }, 400);
    if (!/^\d{5}$/.test(cp)) return json({ error: 'El código postal debe tener 5 dígitos' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'El correo no es válido' }, 400);

    const { data: venta } = await admin
      .from('ventas')
      .select('id, total, subtotal, impuestos, fecha, estado, sucursal_id, numero_venta')
      .eq('sucursal_id', sucursalId)
      .eq('numero_venta', folio)
      .maybeSingle();

    // Mensaje genérico a propósito: no revelamos si el folio existe pero el
    // total no coincide (evita adivinar tickets ajenos).
    const generico = 'No encontramos un ticket con esos datos. Verifica sucursal, folio y total.';
    if (!venta) return json({ error: generico }, 404);
    if (venta.estado === 'cancelada') return json({ error: 'Ese ticket está cancelado y no puede facturarse.' }, 400);
    if (Math.abs(Number(venta.total) - total) > 1) return json({ error: generico }, 404);

    // Plazo fiscal: solo el mismo mes calendario de la venta.
    const fVenta = new Date(venta.fecha);
    const hoy = new Date();
    if (fVenta.getUTCFullYear() !== hoy.getUTCFullYear() || fVenta.getUTCMonth() !== hoy.getUTCMonth()) {
      return json({ error: 'El plazo para facturar este ticket ya venció (solo el mismo mes de la compra).' }, 400);
    }

    // ¿Ya facturado? Entregamos la MISMA factura (PDF/XML) en vez de bloquear.
    const { data: cfdiPrevio } = await admin
      .from('cfdi_emitidos')
      .select('id, facturapi_id, uuid_sat, serie, folio, xml_storage_path, pdf_storage_path')
      .eq('venta_id', venta.id)
      .eq('estado', 'timbrado')
      .maybeSingle();
    if (cfdiPrevio) {
      if (cfdiPrevio.facturapi_id) await enviarPorCorreo(cfdiPrevio.facturapi_id, email);
      const links = await firmar(admin, cfdiPrevio);
      return json({
        ok: true, ya_facturada: true,
        mensaje: 'Este ticket ya tenía factura. Aquí está tu comprobante y lo reenviamos a tu correo.',
        cfdi: { uuid: cfdiPrevio.uuid_sat, serie: cfdiPrevio.serie, folio: cfdiPrevio.folio }, ...links,
      });
    }

    const apiKey = Deno.env.get('FACTURAPI_API_KEY');
    if (!apiKey) return json({ error: 'La facturación en línea no está disponible por el momento. Intenta más tarde.' }, 503);

    // Configuración fiscal del emisor
    let { data: cfg } = await admin.from('configuracion_fiscal').select('*').is('sucursal_id', null).maybeSingle();
    if (!cfg) {
      const r = await admin.from('configuracion_fiscal').select('*').eq('sucursal_id', venta.sucursal_id).maybeSingle();
      cfg = r.data;
    }
    if (!cfg) return json({ error: 'La facturación en línea no está configurada. Acude a tu sucursal.' }, 503);

    const { data: lineas } = await admin
      .from('venta_lineas')
      .select('cantidad, precio_unitario, subtotal, productos(sku, nombre)')
      .eq('venta_id', venta.id);
    if (!lineas || lineas.length === 0) return json({ error: 'El ticket no tiene partidas facturables.' }, 400);

    const conIva = Number(venta.impuestos || 0) > 0;
    const items = (lineas as any[]).map((l) => ({
      quantity: Number(l.cantidad),
      product: {
        description: l.productos?.nombre || 'Producto',
        product_key: DEFAULT_PRODUCT_KEY,
        unit_key: DEFAULT_UNIT_KEY,
        price: Number(l.precio_unitario),
        sku: l.productos?.sku || undefined,
        taxability: conIva ? '01' : '02',
        taxes: conIva ? [{ type: 'IVA', rate: 0.16, factor: 'Tasa' }] : [{ type: 'IVA', rate: 0, factor: 'Exento' }],
      },
    }));

    const payload = {
      customer: {
        legal_name: razonSocial, tax_id: rfc, tax_system: regimen,
        address: { zip: cp }, email,
      },
      items,
      use: usoCfdi,
      payment_form: '01',
      payment_method: 'PUE',
      folio_number: cfg.folio_actual || 1,
      series: cfg.serie_default || 'A',
    };

    const { data: solicitud } = await admin.from('autofacturacion_solicitudes').insert({
      venta_id: venta.id, sucursal_id: venta.sucursal_id,
      rfc, razon_social: razonSocial, regimen_fiscal: regimen,
      codigo_postal: cp, email, uso_cfdi: usoCfdi, estado: 'procesando',
    }).select('id').maybeSingle();

    const res = await fetch(`${FACTURAPI_BASE}/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const respText = await res.text();
    let respJson: any;
    try { respJson = JSON.parse(respText); } catch { respJson = { raw: respText }; }

    if (!res.ok) {
      await admin.from('cfdi_emitidos').insert({
        sucursal_id: venta.sucursal_id, venta_id: venta.id,
        serie: cfg.serie_default || 'A', folio: cfg.folio_actual || 1,
        rfc_receptor: rfc, total: Number(venta.total), estado: 'error', pac_response: respJson,
      });
      if (solicitud?.id) {
        await admin.from('autofacturacion_solicitudes')
          .update({ estado: 'pendiente', nota_interna: `Error al timbrar: ${respJson?.message || respText}` })
          .eq('id', solicitud.id);
      }
      await admin.from('ventas').update({ requiere_factura: true }).eq('id', venta.id);
      return json({
        error: 'No pudimos timbrar tu factura en este momento. Tu solicitud quedó registrada y te la enviaremos por correo.',
        detalle: respJson?.message || null,
      }, 502);
    }

    const stored = respJson.id
      ? await fetchAndStoreCfdiArtifacts({ admin, apiKey, facturapiId: respJson.id, rfcEmisor: cfg.rfc || 'SIN_RFC' })
      : { xml_storage_path: null, pdf_storage_path: null, errors: [] };

    const { data: cfdiRow } = await admin.from('cfdi_emitidos').insert({
      sucursal_id: venta.sucursal_id, venta_id: venta.id,
      uuid_sat: respJson.uuid, serie: respJson.series || cfg.serie_default, folio: respJson.folio_number,
      rfc_receptor: rfc, total: Number(respJson.total ?? venta.total),
      estado: 'timbrado', tipo_comprobante: 'I', facturapi_id: respJson.id || null,
      pac_response: respJson, timbrado_at: new Date().toISOString(),
      xml_url: respJson.id ? `facturapi:${respJson.id}/xml` : null,
      pdf_url: respJson.id ? `facturapi:${respJson.id}/pdf` : null,
      xml_storage_path: stored.xml_storage_path, pdf_storage_path: stored.pdf_storage_path,
      es_demo: false,
    }).select('id, uuid_sat, serie, folio, facturapi_id, xml_storage_path, pdf_storage_path').maybeSingle();

    await admin.from('configuracion_fiscal').update({ folio_actual: (cfg.folio_actual || 1) + 1 }).eq('id', cfg.id);
    await admin.from('ventas').update({ requiere_factura: false }).eq('id', venta.id);
    if (solicitud?.id) {
      await admin.from('autofacturacion_solicitudes').update({ estado: 'timbrada' }).eq('id', solicitud.id);
    }

    // Envío por correo (Facturapi manda PDF + XML adjuntos)
    const correoOk = respJson.id ? await enviarPorCorreo(respJson.id, email) : false;
    const links = await firmar(admin, cfdiRow || { xml_storage_path: stored.xml_storage_path, pdf_storage_path: stored.pdf_storage_path });

    return json({
      ok: true,
      mensaje: correoOk
        ? `Tu factura fue timbrada y enviada a ${email}.`
        : 'Tu factura fue timbrada. Descárgala aquí abajo.',
      correo_enviado: correoOk,
      cfdi: { uuid: respJson.uuid, serie: respJson.series || cfg.serie_default, folio: respJson.folio_number },
      ...links,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function enviarPorCorreo(facturapiId: string, email: string): Promise<boolean> {
  const apiKey = Deno.env.get('FACTURAPI_API_KEY');
  if (!apiKey) return false;
  try {
    const r = await fetch(`${FACTURAPI_BASE}/invoices/${facturapiId}/email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return r.ok;
  } catch { return false; }
}

async function firmar(admin: any, cfdi: { xml_storage_path?: string | null; pdf_storage_path?: string | null }) {
  const out: { pdf_url: string | null; xml_url: string | null } = { pdf_url: null, xml_url: null };
  for (const [campo, key] of [['pdf_storage_path', 'pdf_url'], ['xml_storage_path', 'xml_url']] as const) {
    const path = (cfdi as any)?.[campo];
    if (!path) continue;
    const { data } = await admin.storage.from('cfdi').createSignedUrl(path, 60 * 30);
    if (data?.signedUrl) (out as any)[key] = data.signedUrl;
  }
  return out;
}
