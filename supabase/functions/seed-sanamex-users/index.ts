import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PASSWORD = "Sanamex2026!";

type RoleApp =
  | "super_admin" | "admin" | "gerente" | "subgerente"
  | "ventas" | "almacen_ventas" | "repartidor";

interface UserDef {
  username: string;
  nombre: string;
  role: RoleApp;
  sucursalCodigo: string | null; // null = global
}

const SUCURSALES = ["SMX-SV", "SMX-F36", "SMX-H", "SMX-ECA"] as const;
const SHORT: Record<string,string> = { "SMX-SV":"sv", "SMX-F36":"f36", "SMX-H":"h", "SMX-ECA":"eca" };

function buildUsers(): UserDef[] {
  const users: UserDef[] = [
    { username: "superadmin",    nombre: "Super Administrador", role: "super_admin", sucursalCodigo: null },
    { username: "admin_general", nombre: "Administrador General", role: "admin",      sucursalCodigo: null },
  ];
  for (const s of SUCURSALES) {
    const k = SHORT[s];
    users.push({ username: `gerente_${k}`,    nombre: `Gerente ${s}`,    role: "gerente",    sucursalCodigo: s });
    users.push({ username: `subgerente_${k}`, nombre: `Subgerente ${s}`, role: "subgerente", sucursalCodigo: s });
    users.push({ username: `ventas1_${k}`,    nombre: `Ventas 1 ${s}`,   role: "ventas",     sucursalCodigo: s });
    users.push({ username: `ventas2_${k}`,    nombre: `Ventas 2 ${s}`,   role: "ventas",     sucursalCodigo: s });
    users.push({ username: `almacen_${k}`,    nombre: `Almacenista ${s}`,role: "almacen_ventas", sucursalCodigo: s });
    users.push({ username: `chofer_${k}`,     nombre: `Chofer ${s}`,     role: "repartidor", sucursalCodigo: s });
  }
  return users;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    // Mapear sucursales codigo -> id
    const { data: sucs } = await admin.from("sucursales").select("id,codigo")
      .in("codigo", SUCURSALES as unknown as string[]);
    const sucMap: Record<string,string> = {};
    (sucs || []).forEach(s => { sucMap[s.codigo] = s.id; });

    const users = buildUsers();
    const results: any[] = [];

    for (const u of users) {
      const email = `${u.username}@sanamex.local`;
      // Crear o reutilizar
      let userId: string | null = null;
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password: PASSWORD, email_confirm: true,
        user_metadata: { username: u.username, nombre: u.nombre, role: u.role },
      });
      if (cErr) {
        // Buscar existente
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const existing = list?.users?.find((x: any) => x.email === email);
        if (existing) {
          userId = existing.id;
          await admin.auth.admin.updateUserById(userId, { password: PASSWORD });
        } else {
          results.push({ username: u.username, status: "error", error: cErr.message });
          continue;
        }
      } else {
        userId = created.user!.id;
      }

      // Profile
      await admin.from("profiles").upsert({
        id: userId, nombre: u.nombre, username: u.username, email, activo: true,
      });

      // Limpiar roles previos y asignar el nuevo
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.from("user_roles").insert({ user_id: userId, role: u.role });

      // Asignación sucursal
      await admin.from("user_sucursal_asignacion").delete().eq("user_id", userId);
      await admin.from("user_sucursal_asignacion").insert({
        user_id: userId,
        sucursal_id: u.sucursalCodigo ? sucMap[u.sucursalCodigo] : null,
        es_principal: true,
      });

      // Log de contraseña inicial (para super admin)
      await admin.from("password_resets_log").insert({
        target_user_id: userId,
        reset_by: userId, // self-seeded
        password_assigned: PASSWORD,
        notas: "Contraseña inicial generada por seed",
      });

      results.push({ username: u.username, status: "ok", userId });
    }

    return new Response(JSON.stringify({
      success: true, password: PASSWORD, total: results.length, results
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});
