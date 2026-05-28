import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const keep = new Set<string>();
  // build allowed emails
  const SHORT = ["sv", "f36", "h", "eca"];
  keep.add("superadmin@sanamex.local");
  keep.add("admin_general@sanamex.local");
  for (const k of SHORT) {
    for (const u of [`gerente_${k}`, `subgerente_${k}`, `ventas1_${k}`, `ventas2_${k}`, `almacen_${k}`, `chofer_${k}`]) {
      keep.add(`${u}@sanamex.local`);
    }
  }

  const deleted: string[] = [];
  const errors: any[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    const users = data?.users || [];
    for (const u of users) {
      if (!u.email || keep.has(u.email)) continue;
      try {
        await admin.from("user_roles").delete().eq("user_id", u.id);
        await admin.from("user_sucursal_asignacion").delete().eq("user_id", u.id);
        await admin.from("profiles").delete().eq("id", u.id);
        const { error: dErr } = await admin.auth.admin.deleteUser(u.id);
        if (dErr) errors.push({ email: u.email, error: dErr.message });
        else deleted.push(u.email);
      } catch (e: any) {
        errors.push({ email: u.email, error: e.message });
      }
    }
    if (users.length < 200) break;
    page++;
  }

  return new Response(JSON.stringify({ success: true, deleted_count: deleted.length, deleted, errors }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
