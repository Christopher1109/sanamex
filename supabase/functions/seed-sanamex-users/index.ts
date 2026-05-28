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
  sucursalCodigo: string | null;
}

const SUCURSALES = ["SMX-SV", "SMX-F36", "SMX-H", "SMX-ECA"] as const;
const SHORT: Record<string, string> = { "SMX-SV": "sv", "SMX-F36": "f36", "SMX-H": "h", "SMX-ECA": "eca" };

function buildUsers(): UserDef[] {
  const users: UserDef[] = [
    { username: "superadmin", nombre: "Super Administrador", role: "super_admin", sucursalCodigo: null },
    { username: "admin_general", nombre: "Administrador General", role: "admin", sucursalCodigo: null },
  ];
  for (const s of SUCURSALES) {
    const k = SHORT[s];
    users.push({ username: `gerente_${k}`, nombre: `Gerente ${s}`, role: "gerente", sucursalCodigo: s });
    users.push({ username: `subgerente_${k}`, nombre: `Subgerente ${s}`, role: "subgerente", sucursalCodigo: s });
    users.push({ username: `ventas1_${k}`, nombre: `Ventas 1 ${s}`, role: "ventas", sucursalCodigo: s });
    users.push({ username: `ventas2_${k}`, nombre: `Ventas 2 ${s}`, role: "ventas", sucursalCodigo: s });
    users.push({ username: `almacen_${k}`, nombre: `Almacenista ${s}`, role: "almacen_ventas", sucursalCodigo: s });
    users.push({ username: `chofer_${k}`, nombre: `Chofer ${s}`, role: "repartidor", sucursalCodigo: s });
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

  const url = new URL(req.url);
  const from = parseInt(url.searchParams.get("from") || "0", 10);
  const to = parseInt(url.searchParams.get("to") || "26", 10);

  try {
    const { data: sucs } = await admin.from("sucursales").select("id,codigo")
      .in("codigo", SUCURSALES as unknown as string[]);
    const sucMap: Record<string, string> = {};
    (sucs || []).forEach((s) => { sucMap[s.codigo] = s.id; });

    // Pre-list existing auth users once
    const existingMap: Record<string, string> = {};
    let page = 1;
    while (true) {
      const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const arr = list?.users || [];
      for (const u of arr) if (u.email) existingMap[u.email] = u.id;
      if (arr.length < 200) break;
      page++;
    }

    const allUsers = buildUsers();
    const users = allUsers.slice(from, to);
    const results: any[] = [];

    async function processOne(u: UserDef) {
      const email = `${u.username}@sanamex.local`;
      let userId = existingMap[email] || null;

      if (userId) {
        await admin.auth.admin.updateUserById(userId, { password: PASSWORD });
      } else {
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email, password: PASSWORD, email_confirm: true,
          user_metadata: { username: u.username, nombre: u.nombre, role: u.role },
        });
        if (cErr || !created?.user) {
          return { username: u.username, status: "error", error: cErr?.message || "unknown" };
        }
        userId = created.user.id;
      }

      await admin.from("profiles").upsert({
        id: userId, nombre: u.nombre, username: u.username, email, activo: true,
      });
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.from("user_roles").insert({ user_id: userId, role: u.role });
      await admin.from("user_sucursal_asignacion").delete().eq("user_id", userId);
      await admin.from("user_sucursal_asignacion").insert({
        user_id: userId,
        sucursal_id: u.sucursalCodigo ? sucMap[u.sucursalCodigo] : null,
        es_principal: true,
      });
      await admin.from("password_resets_log").insert({
        target_user_id: userId,
        reset_by: userId,
        password_assigned: PASSWORD,
        notas: "Contraseña inicial generada por seed",
      });
      return { username: u.username, status: "ok", userId };
    }

    // Run in parallel batches of 4
    for (let i = 0; i < users.length; i += 4) {
      const chunk = users.slice(i, i + 4);
      const res = await Promise.all(chunk.map(processOne));
      results.push(...res);
    }

    return new Response(JSON.stringify({
      success: true, password: PASSWORD, from, to, total: results.length, results,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
