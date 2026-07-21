import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase-client";


export default defineTool({
  name: "list_pending_purchase_orders",
  title: "Órdenes de compra pendientes",
  description: "Lista las órdenes de compra con estado 'pendiente_aprobacion'.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    const supabase = client(ctx);
    const { data, error } = await supabase
      .from("ordenes_compra")
      .select("id, folio, fecha, total, estado, proveedores(nombre)")
      .eq("estado", "pendiente_aprobacion")
      .order("fecha", { ascending: false })
      .limit(50);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { ordenes: data ?? [] },
    };
  },
});
