// Portal público de autofacturación.
//
// El cliente captura sucursal + folio del ticket + total y sus datos fiscales.
// Aquí SOLO se valida y se registra la solicitud: el timbrado lo dispara el
// personal desde Ventas (junta 15-ago-2026). No se expone ningún dato de la
// venta más allá de confirmar que el folio existe y el total coincide.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const RFC_RE = /^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
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

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: venta } = await admin
      .from('ventas')
      .select('id, total, fecha, estado, sucursal_id')
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

    const { data: cfdi } = await admin
      .from('cfdi_emitidos')
      .select('id, estado')
      .eq('venta_id', venta.id)
      .neq('estado', 'cancelado')
      .maybeSingle();
    if (cfdi) return json({ error: 'Ese ticket ya fue facturado.' }, 409);

    const { data: previa } = await admin
      .from('autofacturacion_solicitudes')
      .select('id, estado')
      .eq('venta_id', venta.id)
      .neq('estado', 'rechazada')
      .maybeSingle();
    if (previa) return json({ ok: true, ya_solicitada: true, mensaje: 'Ya tenemos una solicitud registrada para este ticket. Te enviaremos la factura por correo.' });

    const { error: insErr } = await admin.from('autofacturacion_solicitudes').insert({
      venta_id: venta.id,
      sucursal_id: venta.sucursal_id,
      rfc, razon_social: razonSocial, regimen_fiscal: regimen,
      codigo_postal: cp, email, uso_cfdi: usoCfdi,
    });
    if (insErr) return json({ error: insErr.message }, 400);

    await admin.from('ventas').update({ requiere_factura: true }).eq('id', venta.id);

    return json({ ok: true, mensaje: 'Solicitud registrada. Recibirás tu factura por correo en las próximas horas.' });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
