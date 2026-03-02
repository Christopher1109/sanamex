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

    // Verificar si ya existe un usuario gerente
    const { data: existingUsers, error: checkError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "gerente")
      .limit(1);

    if (checkError) {
      console.error("Error checking for existing admin:", checkError);
    }

    // Si ya existe un gerente, no permitir crear otro
    if (existingUsers && existingUsers.length > 0) {
      throw new Error("Ya existe un usuario gerente. Esta función solo puede usarse una vez.");
    }

    // Crear el usuario gerente inicial
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: "gerente@hospital.com",
      password: "gerente123",
      email_confirm: true,
      user_metadata: {
        nombre_completo: "Gerente Principal",
        role: "gerente",
        unidad: "Unidad Central",
      },
    });

    if (createError) {
      throw createError;
    }

    console.log("Usuario gerente creado exitosamente:", newUser.user?.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Usuario gerente creado exitosamente",
        credentials: {
          email: "gerente@hospital.com",
          password: "gerente123"
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    console.error("Error en setup-admin:", errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
