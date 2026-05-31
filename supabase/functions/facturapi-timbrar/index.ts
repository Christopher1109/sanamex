// Timbra una venta como CFDI 4.0 usando Facturapi (modo prueba/producción según la API key configurada)
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FACTURAPI_BASE = 'https://www.facturapi.io/v2';

// Catálogos por defecto (medicamentos / venta al público)
const DEFAULT_PRODUCT_KEY = '51171800';   // Productos farmacéuticos
const DEFAULT_UNIT_KEY = 'H87';           // Pieza
const DEFAULT_TAX_RATE = 0.16;            // IVA 16% si la línea lo lleva

interface TimbrarBody {
  venta_id?: string;
  pedido_id?: string;
  uso_cfdi?: string;          // ej. 'G03', 'P01'
  forma_pago?: string;        // ej. '01' efectivo, '04' tarjeta crédito, '28' tarjeta débito, '03' transferencia
  metodo_pago?: 'PUE' | 'PPD';
  receptor?: {                // si la venta no tiene cliente con RFC, viene de la UI (ej. público general)
    rfc: string;
    nombre: string;
    regimen_fiscal: string;   // ej. '616' sin obligaciones / '612' PF actividad
    cp: string;               // CP del receptor
    email?: string;
  };
  lineas_con_iva?: boolean;   // override: aplicar IVA a todas las líneas
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('FACTURAPI_API_KEY');
    if (!apiKey) {
      return json({ error: 'FACTURAPI_API_KEY no configurada' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsErr || !claimsData?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claimsData.claims.sub as string;

    const body = (await req.json()) as TimbrarBody;
    if (!body.venta_id && !body.pedido_id) return json({ error: 'venta_id o pedido_id requerido' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Unificar carga: venta POS o pedido entregado
    let venta: any = null;
    let lineas: any[] = [];
    let origen: 'venta' | 'pedido' = 'venta';

    if (body.venta_id) {
      origen = 'venta';
      const { data, error } = await admin
        .from('ventas')
        .select('id, sucursal_id, numero_venta, subtotal, impuestos, total, cliente_id, estado')
        .eq('id', body.venta_id)
        .maybeSingle();
      if (error || !data) return json({ error: 'Venta no encontrada' }, 404);
      if (data.estado === 'cancelada') return json({ error: 'Venta cancelada, no se puede timbrar' }, 400);
      venta = { ...data, numero: data.numero_venta };

      const { data: ls, error: lErr } = await admin
        .from('venta_lineas')
        .select('cantidad, precio_unitario, subtotal, productos(sku, nombre, descripcion, iva_incluido)')
        .eq('venta_id', body.venta_id);
      if (lErr || !ls || ls.length === 0) return json({ error: 'Venta sin líneas' }, 400);
      lineas = ls;

      const { data: existing } = await admin
        .from('cfdi_emitidos').select('id, uuid_sat, estado')
        .eq('venta_id', body.venta_id).eq('estado', 'timbrado').maybeSingle();
      if (existing) return json({ error: 'Esta venta ya tiene un CFDI timbrado', cfdi: existing }, 409);
    } else {
      origen = 'pedido';
      const { data, error } = await admin
        .from('pedidos')
        .select('id, sucursal_id, numero_pedido, cliente_id, estado')
        .eq('id', body.pedido_id!)
        .maybeSingle();
      if (error || !data) return json({ error: 'Pedido no encontrado' }, 404);
      if (data.estado !== 'entregado') return json({ error: 'Solo se pueden timbrar pedidos en estado entregado' }, 400);

      const { data: ls, error: lErr } = await admin
        .from('pedido_lineas')
        .select('cantidad, precio_unitario, subtotal, productos(sku, nombre, descripcion, iva_incluido)')
        .eq('pedido_id', body.pedido_id!);
      if (lErr || !ls || ls.length === 0) return json({ error: 'Pedido sin líneas' }, 400);
      lineas = ls;
      const totalCalc = ls.reduce((s: number, l: any) => s + Number(l.subtotal || 0), 0);
      venta = { ...data, numero: data.numero_pedido, total: totalCalc, subtotal: totalCalc, impuestos: 0 };

      const { data: existing } = await admin
        .from('cfdi_emitidos').select('id, uuid_sat, estado')
        .eq('pedido_id', body.pedido_id!).eq('estado', 'timbrado').maybeSingle();
      if (existing) return json({ error: 'Este pedido ya tiene un CFDI timbrado', cfdi: existing }, 409);
    }

    // Config fiscal: una sola global (sucursal_id IS NULL). Compatibilidad: si no hay global, intentar por sucursal.
    let { data: cfg } = await admin
      .from('configuracion_fiscal')
      .select('*')
      .is('sucursal_id', null)
      .maybeSingle();
    if (!cfg) {
      const r = await admin.from('configuracion_fiscal').select('*').eq('sucursal_id', venta.sucursal_id).maybeSingle();
      cfg = r.data;
    }
    if (!cfg) return json({ error: 'No hay configuración fiscal global capturada' }, 400);

    // Receptor
    let receptor = body.receptor;
    if (!receptor && venta.cliente_id) {
      const { data: cli } = await admin
        .from('clientes')
        .select('nombre, rfc, email')
        .eq('id', venta.cliente_id)
        .maybeSingle();
      if (cli?.rfc) {
        receptor = {
          rfc: cli.rfc,
          nombre: cli.nombre,
          regimen_fiscal: '616',
          cp: cfg.cp_emisor || '00000',
          email: cli.email || undefined,
        };
      }
    }
    if (!receptor) {
      // Público en general
      receptor = {
        rfc: 'XAXX010101000',
        nombre: 'PUBLICO EN GENERAL',
        regimen_fiscal: '616',
        cp: cfg.cp_emisor || '00000',
      };
    }

    const aplicaIva = body.lineas_con_iva ?? false;

    // Construir items para Facturapi
    const items = lineas.map((l: any) => {
      const prod = l.productos || {};
      const usaIva = aplicaIva || prod.iva_incluido === false ? aplicaIva : false;
      const item: any = {
        quantity: Number(l.cantidad),
        product: {
          description: prod.nombre || 'Producto',
          product_key: DEFAULT_PRODUCT_KEY,
          unit_key: DEFAULT_UNIT_KEY,
          price: Number(l.precio_unitario),
          sku: prod.sku || undefined,
          taxability: usaIva ? '01' : '02',
          taxes: usaIva
            ? [{ type: 'IVA', rate: DEFAULT_TAX_RATE, factor: 'Tasa' }]
            : [{ type: 'IVA', rate: 0, factor: 'Exento' }],
        },
      };
      return item;
    });

    const payload: any = {
      customer: {
        legal_name: receptor.nombre,
        tax_id: receptor.rfc,
        tax_system: receptor.regimen_fiscal,
        address: { zip: receptor.cp },
        email: receptor.email,
      },
      items,
      use: body.uso_cfdi || (receptor.rfc === 'XAXX010101000' ? 'S01' : 'G03'),
      payment_form: body.forma_pago || '01',
      payment_method: body.metodo_pago || 'PUE',
      folio_number: cfg.folio_actual || 1,
      series: cfg.serie_default || 'A',
    };

    const res = await fetch(`${FACTURAPI_BASE}/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const respText = await res.text();
    let respJson: any;
    try { respJson = JSON.parse(respText); } catch { respJson = { raw: respText }; }

    if (!res.ok) {
      // Guardar intento fallido
      await admin.from('cfdi_emitidos').insert({
        sucursal_id: venta.sucursal_id,
        venta_id: venta.id,
        serie: cfg.serie_default || 'A',
        folio: cfg.folio_actual || 1,
        rfc_receptor: receptor.rfc,
        total: Number(venta.total),
        estado: 'error',
        pac_response: respJson,
        created_by: userId,
      });
      return json({ error: respJson?.message || 'Error Facturapi', detalle: respJson }, res.status);
    }

    // Éxito → guardar y avanzar folio
    const insertRow = {
      sucursal_id: venta.sucursal_id,
      venta_id: venta.id,
      uuid_sat: respJson.uuid,
      serie: respJson.series || cfg.serie_default,
      folio: respJson.folio_number,
      rfc_receptor: receptor.rfc,
      total: Number(respJson.total ?? venta.total),
      estado: 'timbrado',
      pac_response: respJson,
      timbrado_at: new Date().toISOString(),
      xml_url: respJson.id ? `facturapi:${respJson.id}/xml` : null,
      pdf_url: respJson.id ? `facturapi:${respJson.id}/pdf` : null,
      created_by: userId,
    };

    const { data: cfdiRow, error: insErr } = await admin
      .from('cfdi_emitidos')
      .insert(insertRow)
      .select()
      .single();
    if (insErr) return json({ error: 'CFDI timbrado pero falló al guardar: ' + insErr.message, facturapi: respJson }, 500);

    await admin
      .from('configuracion_fiscal')
      .update({ folio_actual: (cfg.folio_actual || 1) + 1 })
      .eq('id', cfg.id);

    return json({ ok: true, cfdi: cfdiRow, facturapi_id: respJson.id });
  } catch (e: any) {
    console.error('timbrar error', e);
    return json({ error: e?.message || 'Error interno' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
