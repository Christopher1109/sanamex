import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "search_products",
  title: "Buscar productos",
  description: "Busca productos por SKU o nombre (coincidencia parcial). Devuelve hasta 25 resultados con precio y costo.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Texto a buscar en SKU o nombre del producto"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    const supabase = client(ctx);
    const { data, error } = await supabase
      .from("productos")
      .select("id, sku, nombre, precio_venta, costo_promedio, stock_minimo")
      .or(`sku.ilike.%${query}%,nombre.ilike.%${query}%`)
      .limit(25);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { productos: data ?? [] },
    };
  },
});
