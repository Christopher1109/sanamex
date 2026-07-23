import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Contraseña inicial para las cuentas placeholder de sucursal/administrativas.
// El Super Admin las puede resetear individualmente desde Gestión de Usuarios.
const PASSWORD = "Sanamex2026!";

// Email de la cuenta real que se convierte en Super Administrador.
// No se le toca la contraseña.
const SUPER_ADMIN_EMAIL = "christocr9@gmail.com";

type RoleApp = "super_admin" | "direccion" | "contabilidad" | "contraloria" | "gerente" | "subgerente" | "almacen_ventas" | "ventas";

interface UserDef {
  username: string | null; // null para la cuenta real del super_admin (usa su email tal cual)
  email: string;
  nombre: string;
  role: RoleApp;
  sucursalCodigo: string | null;
  isRealAccount?: boolean;
}

const SUCURSALES = ["ECA", "F36", "GH", "SV"] as const;
const SUC_NOMBRE: Record<string, string> = { ECA: "Ecatepec", F36: "Izta-F36", GH: "Izta-GH", SV: "San Vicente" };

function buildRoster(): UserDef[] {
  const users: UserDef[] = [
    { username: null, email: SUPER_ADMIN_EMAIL, nombre: "Super Administrador", role: "super_admin", sucursalCodigo: null, isRealAccount: true },
    { username: "direccion", email: "direccion@sanamex.local", nombre: "Dirección General", role: "direccion", sucursalCodigo: null },
    { username: "contabilidad", email: "contabilidad@sanamex.local", nombre: "Contabilidad", role: "contabilidad", sucursalCodigo: null },
    { username: "contraloria", email: "contraloria@sanamex.local", nombre: "Contraloría", role: "contraloria", sucursalCodigo: null },
  ];
  for (const s of SUCURSALES) {
    const k = s.toLowerCase();
    const nombreSuc = SUC_NOMBRE[s];
    users.push({ username: `gerente_${k}`, email: `gerente_${k}@sanamex.local`, nombre: `Gerente ${nombreSuc}`, role: "gerente", sucursalCodigo: s });
    users.push({ username: `subgerente_${k}`, email: `subgerente_${k}@sanamex.local`, nombre: `Subgerente ${nombreSuc}`, role: "subgerente", sucursalCodigo: s });
    users.push({ username: `almacen_${k}`, email: `almacen_${k}@sanamex.local`, nombre: `Almacenista ${nombreSuc}`, role: "almacen_ventas", sucursalCodigo: s });
    users.push({ username: `ventas_${k}`, email: `ventas_${k}@sanamex.local`, nombre: `Ventas ${nombreSuc}`, role: "ventas", sucursalCodigo: s });
  }
  return users; // 1 + 3 + 4*4 = 20
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
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const userClient = createClient(supaUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const caller = claimsData?.claims ? { id: claimsData.claims.sub as string } : null;
    if (claimsErr || !caller) {
      console.error("getClaims failed", claimsErr);
      return new Response(JSON.stringify({ error: "Sesión inválida", detail: claimsErr?.message }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const admin = createClient(supaUrl, svc, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    if (!callerRoles?.some((r: any) => r.role === "super_admin")) {
      return new Response(JSON.stringify({ error: "Solo el Super Administrador puede reconstruir el roster de usuarios" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const roster = buildRoster();
    const finalEmails = new Set(roster.map(u => u.email.toLowerCase()));

    const { data: sucs } = await admin.from("sucursales").select("id,codigo").in("codigo", SUCURSALES as unknown as string[]);
    const sucMap: Record<string, string> = {};
    (sucs || []).forEach((s: any) => { sucMap[s.codigo] = s.id; });

    // Listar todos los usuarios de auth para saber quién ya existe y quién sobra.
    const existingMap: Record<string, string> = {}; // email -> userId
    let page = 1;
    while (true) {
      const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const arr = list?.users || [];
      for (const u of arr) if (u.email) existingMap[u.email.toLowerCase()] = u.id;
      if (arr.length < 200) break;
      page++;
    }

    // 1) Desactivar (no borrar) a cualquier usuario activo que NO esté en el roster final.
    const { data: activeProfiles } = await admin.from("profiles").select("id, email, activo").eq("activo", true);
    const desactivados: string[] = [];
    for (const p of activeProfiles || []) {
      const email = (p.email || "").toLowerCase();
      if (email && !finalEmails.has(email)) {
        await admin.auth.admin.updateUserById(p.id, { ban_duration: "876000h" }).catch(() => {});
        await admin.from("profiles").update({ activo: false }).eq("id", p.id);
        desactivados.push(p.email);
      }
    }

    // 2) Crear / actualizar los 20 usuarios del roster limpio.
    const results: any[] = [];
    async function processOne(u: UserDef) {
      const email = u.email.toLowerCase();
      let userId = existingMap[email] || null;

      if (u.isRealAccount) {
        // Cuenta real: solo se le asigna el rol, nunca se toca su contraseña.
        if (!userId) {
          return { email: u.email, status: "error", error: "La cuenta real del Super Admin no existe todavía en Auth. Debe iniciar sesión al menos una vez antes de reconstruir." };
        }
      } else if (userId) {
        await admin.auth.admin.updateUserById(userId, { password: PASSWORD, ban_duration: "none" });
      } else {
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email, password: PASSWORD, email_confirm: true,
          user_metadata: { username: u.username, nombre: u.nombre, role: u.role },
        });
        if (cErr || !created?.user) {
          return { email: u.email, status: "error", error: cErr?.message || "unknown" };
        }
        userId = created.user.id;
      }

      await admin.from("profiles").upsert({
        id: userId, nombre: u.nombre, username: u.username, email: u.email, activo: true,
      });
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.from("user_roles").insert({ user_id: userId, role: u.role });
      await admin.from("user_sucursal_asignacion").delete().eq("user_id", userId);
      if (u.sucursalCodigo && sucMap[u.sucursalCodigo]) {
        await admin.from("user_sucursal_asignacion").insert({
          user_id: userId, sucursal_id: sucMap[u.sucursalCodigo], es_principal: true,
        });
      }

      // Aplica los permisos por defecto del rol (desde la matriz de roles).
      const { data: defaults } = await admin.from("role_module_defaults").select("modulo, nivel_acceso").eq("rol", u.role);
      if (defaults && defaults.length > 0) {
        await admin.from("user_module_access").delete().eq("user_id", userId);
        await admin.from("user_module_access").insert(
          defaults.map((d: any) => ({ user_id: userId, modulo: d.modulo, nivel_acceso: d.nivel_acceso, otorgado_por: caller.id }))
        );
      }

      return { email: u.email, status: "ok", role: u.role, userId };
    }

    for (let i = 0; i < roster.length; i += 4) {
      const chunk = roster.slice(i, i + 4);
      const res = await Promise.all(chunk.map(processOne));
      results.push(...res);
    }

    const errores = results.filter(r => r.status === "error");
    return new Response(JSON.stringify({
      success: errores.length === 0,
      message: `Roster reconstruido: ${results.length - errores.length} usuarios activos, ${desactivados.length} cuenta(s) anterior(es) desactivadas.${errores.length ? ` ${errores.length} error(es).` : ""}`,
      desactivados, results,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
