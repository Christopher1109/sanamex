import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Usuarios de demostración por unidad
const demoUsers = [
  // Unidad Central
  { email: "gerente.central@hospital.com", password: "gerente123", nombre: "María González García", role: "gerente", unidad: "Unidad Central" },
  { email: "supervisor.central@hospital.com", password: "supervisor123", nombre: "Carlos Ramírez López", role: "supervisor", unidad: "Unidad Central" },
  { email: "lider.central@hospital.com", password: "lider123", nombre: "Ana Martínez Sánchez", role: "lider", unidad: "Unidad Central" },
  { email: "almacenista1.central@hospital.com", password: "almacen123", nombre: "José Torres Flores", role: "almacenista", unidad: "Unidad Central" },
  { email: "almacenista2.central@hospital.com", password: "almacen456", nombre: "Laura Hernández Cruz", role: "almacenista", unidad: "Unidad Central" },
  { email: "auxiliar1.central@hospital.com", password: "auxiliar123", nombre: "Roberto Jiménez Ruiz", role: "auxiliar", unidad: "Unidad Central" },
  { email: "auxiliar2.central@hospital.com", password: "auxiliar456", nombre: "Patricia Morales Díaz", role: "auxiliar", unidad: "Unidad Central" },
  { email: "auxiliar3.central@hospital.com", password: "auxiliar789", nombre: "Miguel Ángel Pérez", role: "auxiliar", unidad: "Unidad Central" },
  { email: "auxiliar4.central@hospital.com", password: "auxiliar321", nombre: "Sandra López Vega", role: "auxiliar", unidad: "Unidad Central" },
  { email: "auxiliar5.central@hospital.com", password: "auxiliar654", nombre: "Fernando Castillo Reyes", role: "auxiliar", unidad: "Unidad Central" },

  // Unidad Norte
  { email: "supervisor.norte@hospital.com", password: "supervisor123", nombre: "Ricardo Mendoza Silva", role: "supervisor", unidad: "Unidad Norte" },
  { email: "lider.norte@hospital.com", password: "lider123", nombre: "Gabriela Ramos Ortiz", role: "lider", unidad: "Unidad Norte" },
  { email: "almacenista1.norte@hospital.com", password: "almacen123", nombre: "Luis Alberto García", role: "almacenista", unidad: "Unidad Norte" },
  { email: "almacenista2.norte@hospital.com", password: "almacen456", nombre: "Carmen Zavala Torres", role: "almacenista", unidad: "Unidad Norte" },
  { email: "auxiliar1.norte@hospital.com", password: "auxiliar123", nombre: "Andrés Soto Vargas", role: "auxiliar", unidad: "Unidad Norte" },
  { email: "auxiliar2.norte@hospital.com", password: "auxiliar456", nombre: "Mónica Guerrero León", role: "auxiliar", unidad: "Unidad Norte" },
  { email: "auxiliar3.norte@hospital.com", password: "auxiliar789", nombre: "Daniel Campos Rojas", role: "auxiliar", unidad: "Unidad Norte" },
  { email: "auxiliar4.norte@hospital.com", password: "auxiliar321", nombre: "Verónica Navarro Ruiz", role: "auxiliar", unidad: "Unidad Norte" },
  { email: "auxiliar5.norte@hospital.com", password: "auxiliar654", nombre: "Pablo Domínguez Cruz", role: "auxiliar", unidad: "Unidad Norte" },
  { email: "auxiliar6.norte@hospital.com", password: "auxiliar987", nombre: "Isabel Aguilar Santos", role: "auxiliar", unidad: "Unidad Norte" },

  // Unidad Sur
  { email: "supervisor.sur@hospital.com", password: "supervisor123", nombre: "Eduardo Vázquez Luna", role: "supervisor", unidad: "Unidad Sur" },
  { email: "lider.sur@hospital.com", password: "lider123", nombre: "Rosa María Delgado", role: "lider", unidad: "Unidad Sur" },
  { email: "almacenista1.sur@hospital.com", password: "almacen123", nombre: "Jorge Medina Castro", role: "almacenista", unidad: "Unidad Sur" },
  { email: "almacenista2.sur@hospital.com", password: "almacen456", nombre: "Teresa Pacheco Gómez", role: "almacenista", unidad: "Unidad Sur" },
  { email: "auxiliar1.sur@hospital.com", password: "auxiliar123", nombre: "Alberto Núñez Molina", role: "auxiliar", unidad: "Unidad Sur" },
  { email: "auxiliar2.sur@hospital.com", password: "auxiliar456", nombre: "Beatriz Salazar Rivas", role: "auxiliar", unidad: "Unidad Sur" },
  { email: "auxiliar3.sur@hospital.com", password: "auxiliar789", nombre: "Héctor Fuentes Ortega", role: "auxiliar", unidad: "Unidad Sur" },
  { email: "auxiliar4.sur@hospital.com", password: "auxiliar321", nombre: "Adriana Guzmán Peña", role: "auxiliar", unidad: "Unidad Sur" },
  { email: "auxiliar5.sur@hospital.com", password: "auxiliar654", nombre: "Raúl Cervantes Valle", role: "auxiliar", unidad: "Unidad Sur" },
  { email: "auxiliar6.sur@hospital.com", password: "auxiliar987", nombre: "Claudia Ríos Paredes", role: "auxiliar", unidad: "Unidad Sur" },

  // Unidad Este
  { email: "supervisor.este@hospital.com", password: "supervisor123", nombre: "Francisco Ibarra León", role: "supervisor", unidad: "Unidad Este" },
  { email: "lider.este@hospital.com", password: "lider123", nombre: "Silvia Rojas Herrera", role: "lider", unidad: "Unidad Este" },
  { email: "almacenista1.este@hospital.com", password: "almacen123", nombre: "Arturo Valdez Soto", role: "almacenista", unidad: "Unidad Este" },
  { email: "almacenista2.este@hospital.com", password: "almacen456", nombre: "Norma Sandoval Mejía", role: "almacenista", unidad: "Unidad Este" },
  { email: "auxiliar1.este@hospital.com", password: "auxiliar123", nombre: "Sergio Benitez Mata", role: "auxiliar", unidad: "Unidad Este" },
  { email: "auxiliar2.este@hospital.com", password: "auxiliar456", nombre: "Diana Coronado Luna", role: "auxiliar", unidad: "Unidad Este" },
  { email: "auxiliar3.este@hospital.com", password: "auxiliar789", nombre: "Guillermo Montes Lara", role: "auxiliar", unidad: "Unidad Este" },
  { email: "auxiliar4.este@hospital.com", password: "auxiliar321", nombre: "Mariana Acosta Téllez", role: "auxiliar", unidad: "Unidad Este" },
  { email: "auxiliar5.este@hospital.com", password: "auxiliar654", nombre: "Omar Villanueva Parra", role: "auxiliar", unidad: "Unidad Este" },
  { email: "auxiliar6.este@hospital.com", password: "auxiliar987", nombre: "Liliana Espinoza Bravo", role: "auxiliar", unidad: "Unidad Este" },
];

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

    const createdUsers = [];
    const errors = [];

    for (const user of demoUsers) {
      try {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
          user_metadata: {
            nombre_completo: user.nombre,
            role: user.role,
            unidad: user.unidad,
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            console.log(`Usuario ya existe: ${user.email}`);
          } else {
            errors.push({ email: user.email, error: error.message });
          }
        } else {
          createdUsers.push({
            email: user.email,
            nombre: user.nombre,
            role: user.role,
            unidad: user.unidad,
          });
          console.log(`Usuario creado: ${user.email}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        errors.push({ email: user.email, error: errorMessage });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `${createdUsers.length} usuarios creados exitosamente`,
        created: createdUsers.length,
        errors: errors.length,
        details: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    console.error("Error en create-demo-users:", errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
