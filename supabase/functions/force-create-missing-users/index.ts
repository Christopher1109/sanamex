// ⛔ FUNCIÓN DESHABILITADA POR SEGURIDAD — auditoría 22-jul-2026.
//
// Este edge function usaba la SERVICE_ROLE_KEY (acceso total a la base de
// datos, sin restricciones) y NO verificaba quién la llamaba: cualquier
// persona en internet con la anon key pública del proyecto (siempre
// extraíble del sitio web) podía invocarla directamente por HTTP sin haber
// iniciado sesión. Se deja el nombre de la función reservado (para no
// romper referencias) pero su lógica fue retirada.
//
// Si esta función SÍ se necesita en el futuro, debe reescribirse
// verificando primero que el llamante esté autenticado y tenga el rol
// 'super_admin' (ver supabase/functions/super-admin-toggle-user/index.ts
// como referencia del patrón correcto), antes de tocar cualquier dato.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: 'Esta función fue deshabilitada por seguridad. Contacta al Super Administrador.' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
