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
  name: "list_expiring_lots",
  title: "Lotes próximos a caducar",
  description: "Lista lotes con stock que caducan dentro de los próximos N días (por defecto 60).",
  inputSchema: {
    dias: z.number().int().min(1).max(365).optional().describe("Horizonte en días (1-365, default 60)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ dias }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    const supabase = client(ctx);
    const horizon = new Date(Date.now() + (dias ?? 60) * 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("lotes")
      .select("cantidad, fecha_caducidad, numero_lote, productos(sku, nombre), sucursales(codigo, nombre)")
      .gt("cantidad", 0)
      .lte("fecha_caducidad", horizon)
      .order("fecha_caducidad", { ascending: true })
      .limit(100);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { lotes: data ?? [] },
    };
  },
});
