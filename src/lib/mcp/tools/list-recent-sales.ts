import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase-client";


export default defineTool({
  name: "list_recent_sales",
  title: "Ventas recientes",
  description: "Lista las ventas más recientes (últimas 50) con folio, sucursal, total y estado.",
  inputSchema: {
    sucursal_codigo: z.string().trim().optional().describe("Filtrar por código de sucursal (opcional)"),
    dias: z.number().int().min(1).max(90).optional().describe("Ventana en días (default 7)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sucursal_codigo, dias }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    const supabase = client(ctx);
    const since = new Date(Date.now() - (dias ?? 7) * 86400000).toISOString();
    let q = supabase
      .from("ventas")
      .select("id, folio, fecha, total, estado, sucursales!inner(codigo, nombre)")
      .gte("fecha", since)
      .order("fecha", { ascending: false })
      .limit(50);
    if (sucursal_codigo) q = q.eq("sucursales.codigo", sucursal_codigo);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { ventas: data ?? [] },
    };
  },
});
