import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { sucursal_id, force } = await req.json();
    if (!sucursal_id) return new Response(JSON.stringify({ error: "sucursal_id requerido" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const admin = createClient(supaUrl, svc, { auth: { autoRefreshToken: false, persistSession: false } });

    // Reutilizar caché si existe (no expirado)
    if (!force) {
      const { data: cached } = await admin
        .from("recomendaciones")
        .select("*")
        .eq("sucursal_id", sucursal_id)
        .gt("expira_at", new Date().toISOString())
        .order("generada_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached) {
        return new Response(JSON.stringify({ cached: true, recomendacion: cached }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
    }

    // Recolectar datos: stock actual + ventas 90d + caducidades
    const since = new Date(); since.setDate(since.getDate() - 90);
    const sinceIso = since.toISOString().slice(0, 10);

    const { data: ventas } = await admin
      .from("venta_lineas")
      .select("cantidad, precio_unitario, producto_id, ventas!inner(sucursal_id, fecha, estado), productos!inner(sku, nombre)")
      .gte("ventas.fecha", since.toISOString())
      .eq("ventas.sucursal_id", sucursal_id)
      .eq("ventas.estado", "completada")
      .limit(2000);

    const { data: hist } = await admin
      .from("ventas_historicas")
      .select("producto_sku, producto_nombre, cantidad, fecha, proveedor_sugerido")
      .eq("sucursal_id", sucursal_id)
      .gte("fecha", sinceIso)
      .limit(2000);

    const { data: lotes } = await admin
      .from("lotes")
      .select("producto_id, fecha_caducidad, productos(nombre, sku, costo_promedio, stock_minimo)")
      .lte("fecha_caducidad", new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10))
      .limit(500);

    // Agregar por SKU
    const agg: Record<string, { sku: string; nombre: string; total: number; dias: Set<string> }> = {};
    (ventas || []).forEach((v: any) => {
      const sku = v.productos?.sku;
      if (!sku) return;
      if (!agg[sku]) agg[sku] = { sku, nombre: v.productos.nombre, total: 0, dias: new Set() };
      agg[sku].total += v.cantidad;
      agg[sku].dias.add(String(v.ventas.fecha).slice(0, 10));
    });
    (hist || []).forEach((h: any) => {
      const sku = h.producto_sku;
      if (!sku) return;
      if (!agg[sku]) agg[sku] = { sku, nombre: h.producto_nombre || sku, total: 0, dias: new Set() };
      agg[sku].total += h.cantidad;
      agg[sku].dias.add(String(h.fecha));
    });

    const top = Object.values(agg)
      .map(a => ({ sku: a.sku, nombre: a.nombre, total: a.total, promedio_diario: +(a.total / Math.max(a.dias.size, 1)).toFixed(2) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 25);

    const caducando = (lotes || []).slice(0, 20).map((l: any) => ({
      sku: l.productos?.sku, nombre: l.productos?.nombre, fecha_caducidad: l.fecha_caducidad,
    }));

    // Llamar Lovable AI
    const prompt = `Eres un asistente experto en compras para una distribuidora farmacéutica con 4 sucursales en CDMX.
Analiza los siguientes datos de la sucursal y genera recomendaciones de compra accionables.

PRODUCTOS MÁS VENDIDOS (últimos 90 días):
${JSON.stringify(top, null, 2)}

LOTES PRÓXIMOS A CADUCAR (siguientes 60 días):
${JSON.stringify(caducando, null, 2)}

Genera un análisis breve y JSON con:
1. Top 10 productos a comprar con cantidad sugerida basada en el promedio diario × 30 días
2. Productos en riesgo de caducidad (sugerir promoción/transferencia)
3. Resumen ejecutivo en 3 bullets`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Eres un experto en gestión de inventarios farmacéuticos. Respondes en español, conciso y accionable." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Límite de IA alcanzado, intenta más tarde" }), { status: 429, headers: { ...cors, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Sin créditos de IA, agrega fondos en Lovable Cloud" }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
      const t = await aiResp.text();
      return new Response(JSON.stringify({ error: "AI gateway error: " + t }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const aiJson = await aiResp.json();
    const resumen = aiJson.choices?.[0]?.message?.content || "Sin respuesta";

    const payload = { top_ventas: top, caducando, total_skus_analizados: Object.keys(agg).length };

    const { data: rec, error: insErr } = await admin.from("recomendaciones").insert({
      sucursal_id, tipo: "compra", payload, resumen_ia: resumen, modelo: "google/gemini-2.5-flash",
    }).select().single();
    if (insErr) console.error(insErr);

    return new Response(JSON.stringify({ cached: false, recomendacion: rec }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
