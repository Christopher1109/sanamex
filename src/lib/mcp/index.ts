import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import searchProductsTool from "./tools/search-products";
import getInventoryTool from "./tools/get-inventory";
import listExpiringLotsTool from "./tools/list-expiring-lots";
import listRecentSalesTool from "./tools/list-recent-sales";
import listPendingPurchaseOrdersTool from "./tools/list-pending-purchase-orders";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "sanamex-erp-mcp",
  title: "Sanamex ERP",
  version: "0.1.0",
  instructions:
    "Herramientas de consulta para el ERP de Sanamex (distribuidora farmacéutica). " +
    "Todas las llamadas se ejecutan como el usuario autenticado y respetan RLS y permisos por módulo. " +
    "Usa search_products para buscar artículos, get_inventory para consultar stock por sucursal, " +
    "list_expiring_lots para caducidades, list_recent_sales para ventas recientes y " +
    "list_pending_purchase_orders para órdenes de compra pendientes de aprobación.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    whoamiTool,
    searchProductsTool,
    getInventoryTool,
    listExpiringLotsTool,
    listRecentSalesTool,
    listPendingPurchaseOrdersTool,
  ],
});
