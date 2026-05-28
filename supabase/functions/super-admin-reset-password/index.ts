import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "!";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autenticado" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verificar que es super_admin
    const userClient = createClient(supaUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(supaUrl, svc, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some((r: any) => r.role === "super_admin")) {
      return new Response(JSON.stringify({ error: "Solo super_admin" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { target_user_id, custom_password } = await req.json();
    if (!target_user_id) {
      return new Response(JSON.stringify({ error: "target_user_id requerido" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const newPassword = custom_password && String(custom_password).length >= 8 ? String(custom_password) : genPassword();

    const { error: updErr } = await admin.auth.admin.updateUserById(target_user_id, { password: newPassword });
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    await admin.from("password_resets_log").insert({
      target_user_id,
      reset_by: user.id,
      password_assigned: newPassword,
      notas: "Reseteo manual por super admin",
    });

    return new Response(JSON.stringify({ success: true, new_password: newPassword }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
