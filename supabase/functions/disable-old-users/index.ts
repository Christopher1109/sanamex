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
  const SHORT = ["sv", "f36", "h", "eca"];
  keep.add("superadmin@sanamex.local");
  keep.add("admin_general@sanamex.local");
  for (const k of SHORT) {
    for (const u of [`gerente_${k}`, `subgerente_${k}`, `ventas1_${k}`, `ventas2_${k}`, `almacen_${k}`, `chofer_${k}`]) {
      keep.add(`${u}@sanamex.local`);
    }
  }

  const disabled: string[] = [];
  const errors: any[] = [];
  let page = 1;
  while (true) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users || [];
    for (const u of users) {
      if (!u.email || keep.has(u.email) || u.email.startsWith("disabled_")) continue;
      const newEmail = `disabled_${u.id.slice(0,8)}@disabled.local`;
      const { error } = await admin.auth.admin.updateUserById(u.id, {
        email: newEmail,
        password: crypto.randomUUID() + "Xx!9",
        ban_duration: "876000h",
      } as any);
      if (error) errors.push({ email: u.email, error: error.message });
      else disabled.push(u.email);
    }
    if (users.length < 200) break;
    page++;
  }

  return new Response(JSON.stringify({ disabled_count: disabled.length, disabled, errors }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
