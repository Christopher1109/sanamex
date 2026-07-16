import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "No autenticado" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supaUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(supaUrl, svc, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some((r: any) => r.role === "super_admin")) {
      return new Response(JSON.stringify({ error: "Solo super_admin" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { target_user_id, action, new_username, new_nombre } = await req.json();
    if (!target_user_id) return new Response(JSON.stringify({ error: "target_user_id requerido" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    if (action === "disable") {
      await admin.auth.admin.updateUserById(target_user_id, { ban_duration: "876000h" });
      await admin.from("profiles").update({ activo: false }).eq("id", target_user_id);
    } else if (action === "enable") {
      await admin.auth.admin.updateUserById(target_user_id, { ban_duration: "none" });
      await admin.from("profiles").update({ activo: true }).eq("id", target_user_id);
    } else if (action === "rename") {
      const patch: any = {};
      if (new_username) patch.username = new_username;
      if (new_nombre) patch.nombre = new_nombre;
      if (Object.keys(patch).length === 0) return new Response(JSON.stringify({ error: "Nada que actualizar" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      await admin.from("profiles").update(patch).eq("id", target_user_id);
    } else if (action === "delete") {
      // Elimina permisos, rol, sucursales, profile y el usuario de auth
      await admin.from("user_module_access").delete().eq("user_id", target_user_id);
      await admin.from("user_sucursal_asignacion").delete().eq("user_id", target_user_id);
      await admin.from("user_roles").delete().eq("user_id", target_user_id);
      await admin.from("profiles").delete().eq("id", target_user_id);
      await admin.auth.admin.deleteUser(target_user_id);
    } else {
      return new Response(JSON.stringify({ error: "Acción inválida" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
