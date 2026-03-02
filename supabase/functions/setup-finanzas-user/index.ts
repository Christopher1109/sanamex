import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const username = "finanzas";
    const emailForAuth = `${username}@sistema.local`;
    const password = "Imss2024!";

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === emailForAuth);

    if (existingUser) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Usuario de finanzas ya existe",
          credentials: {
            username,
            password: "Imss2024!"
          }
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Create user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: emailForAuth,
      password,
      email_confirm: true,
      user_metadata: {
        nombre_completo: "Departamento de Finanzas",
        role: "finanzas",
      },
    });

    if (createError) {
      throw createError;
    }

    // Create profile
    await supabaseAdmin.from("profiles").insert({
      id: newUser.user.id,
      nombre: "Departamento de Finanzas",
      username: username,
    });

    // Assign finanzas role
    await supabaseAdmin.from("user_roles").insert({
      user_id: newUser.user.id,
      role: "finanzas",
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Usuario de finanzas creado exitosamente",
        credentials: {
          username,
          password: "Imss2024!"
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
