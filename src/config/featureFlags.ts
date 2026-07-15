// Feature flags centrales del ERP.
//
// ⚠️ DEPRECADO como gate visual (A1, jul-2026):
// FASE_2_VISIBLE ya NO oculta rutas / sidebar / dashboard.
// El acceso a Fase 2 (operativa) ahora se controla por rol vía
// `canAccessFase2(userRole)` en `src/config/faseAccess.ts`.
//
// Se conserva la constante 1 sprint como fallback documental por si
// hubiera que apagar Fase 2 de emergencia. NO añadir nuevos usos.
export const FASE_2_VISIBLE = true;
