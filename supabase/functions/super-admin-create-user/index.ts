import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateUserBody {
  email: string;
  password: string;
  nombre: string;
  username?: string;
  role: string;
  sucursal_id?: string | null;
  module_access: Record<string, string>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Validar caller es super_admin
    const auth = req.headers.get("Authorization");
    if (!auth) throw new Error("Sin autorización");
    const token = auth.replace("Bearer ", "");
    const { data: { user }, error: uerr } = await admin.auth.getUser(token);
    if (uerr || !user) throw new Error("No autenticado");

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some((r: any) => r.role === "super_admin")) {
      throw new Error("Solo super_admin puede crear usuarios");
    }

    const body = (await req.json()) as CreateUserBody;
    if (!body.email || !body.password || !body.nombre || !body.role) {
      throw new Error("Faltan campos requeridos");
    }
    if (body.password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");

    // Crear usuario en Auth
    const { data: newUser, error: cErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { nombre: body.nombre, username: body.username || null },
    });
    if (cErr || !newUser?.user) throw cErr || new Error("No se pudo crear el usuario");
    const uid = newUser.user.id;

    // Profile
    await admin.from("profiles").upsert({
      id: uid,
      nombre: body.nombre,
      username: body.username || null,
      email: body.email,
      activo: true,
    });

    // Rol base
    await admin.from("user_roles").insert({ user_id: uid, role: body.role });

    // Sucursal asignada
    if (body.sucursal_id) {
      await admin.from("user_sucursal_asignacion").insert({
        user_id: uid, sucursal_id: body.sucursal_id,
      });
    }

    // Permisos por módulo
    const rows = Object.entries(body.module_access).map(([modulo, nivel]) => ({
      user_id: uid, modulo, nivel_acceso: nivel, otorgado_por: user.id,
    }));
    if (rows.length) {
      const { error: pErr } = await admin.from("user_module_access").insert(rows);
      if (pErr) console.error("Error insertando permisos:", pErr);
    }

    return new Response(
      JSON.stringify({ success: true, user_id: uid }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
