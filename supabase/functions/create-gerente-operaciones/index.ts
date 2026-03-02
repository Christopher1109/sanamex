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

    // Verificar si ya existe el usuario
    const { data: existingUsers } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "gerente_operaciones")
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: "El usuario gerente de operaciones ya existe",
          credentials: {
            email: "gerente_operaciones@hospital.com",
            password: "gerente_ops123"
          }
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Crear el usuario usando auth.admin.createUser (método correcto)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: "gerente_operaciones@hospital.com",
      password: "gerente_ops123",
      email_confirm: true,
      user_metadata: {
        nombre: "Gerente de Operaciones",
      },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      throw createError;
    }

    if (!newUser.user) {
      throw new Error("No se pudo crear el usuario");
    }

    console.log("Usuario creado:", newUser.user.id);

    // Crear el perfil
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: newUser.user.id,
        nombre: "Gerente de Operaciones",
      });

    if (profileError) {
      console.error("Error creating profile:", profileError);
      throw profileError;
    }

    // Asignar el rol
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUser.user.id,
        role: "gerente_operaciones",
      });

    if (roleError) {
      console.error("Error assigning role:", roleError);
      throw roleError;
    }

    console.log("Usuario gerente de operaciones creado exitosamente");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Usuario gerente de operaciones creado exitosamente",
        credentials: {
          email: "gerente_operaciones@hospital.com",
          password: "gerente_ops123"
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    console.error("Error en create-gerente-operaciones:", errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
