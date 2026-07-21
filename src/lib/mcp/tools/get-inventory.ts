import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase-client";


export default defineTool({
  name: "get_inventory",
  title: "Consultar inventario",
  description: "Consulta el stock actual por sucursal para un SKU. Devuelve stock por lote con fecha de caducidad.",
  inputSchema: {
    sku: z.string().trim().min(1).describe("SKU del producto a consultar"),
    sucursal_codigo: z.string().trim().optional().describe("Código de sucursal opcional (ej. sv, f36). Si se omite, retorna todas."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sku, sucursal_codigo }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    const supabase = client(ctx);
    const { data: prod, error: pErr } = await supabase
      .from("productos").select("id, sku, nombre").eq("sku", sku).maybeSingle();
    if (pErr) return { content: [{ type: "text", text: pErr.message }], isError: true };
    if (!prod) return { content: [{ type: "text", text: `SKU no encontrado: ${sku}` }], isError: true };

    let q = supabase
      .from("lotes")
      .select("cantidad, fecha_caducidad, numero_lote, sucursales!inner(codigo, nombre)")
      .eq("producto_id", prod.id)
      .gt("cantidad", 0);
    if (sucursal_codigo) q = q.eq("sucursales.codigo", sucursal_codigo);
    const { data, error } = await q.limit(200);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify({ producto: prod, lotes: data }, null, 2) }],
      structuredContent: { producto: prod, lotes: data ?? [] },
    };
  },
});
