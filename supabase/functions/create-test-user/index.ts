import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const testUsers = [
      { email: 'admin@test.com', password: 'Admin123!', role: 'gerente_operaciones', nombre: 'Gerente Operaciones Test' },
      { email: 'supervisor@test.com', password: 'Super123!', role: 'supervisor', nombre: 'Supervisor Test' },
      { email: 'lider@test.com', password: 'Lider123!', role: 'lider', nombre: 'Líder Test' },
      { email: 'almacen@test.com', password: 'Almacen123!', role: 'almacenista', nombre: 'Almacenista Test' },
      { email: 'auxiliar@test.com', password: 'Auxiliar123!', role: 'auxiliar', nombre: 'Auxiliar Test' },
    ];

    const results = [];

    for (const user of testUsers) {
      try {
        // Check if user exists
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existing = existingUsers?.users?.find(u => u.email === user.email);
        
        if (existing) {
          // Update password
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            existing.id,
            { password: user.password }
          );
          
          if (updateError) {
            results.push({ email: user.email, status: 'error', error: updateError.message });
          } else {
            results.push({ email: user.email, password: user.password, role: user.role, status: 'password_updated' });
          }
        } else {
          // Create new user
          const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: user.email,
            password: user.password,
            email_confirm: true,
            user_metadata: { nombre_completo: user.nombre, role: user.role }
          });

          if (authError) {
            results.push({ email: user.email, status: 'error', error: authError.message });
            continue;
          }

          if (authUser?.user) {
            // Create profile
            await supabaseAdmin.from('profiles').upsert({
              id: authUser.user.id,
              nombre: user.nombre
            });

            // Assign role
            await supabaseAdmin.from('user_roles').upsert({
              user_id: authUser.user.id,
              role: user.role
            });

            results.push({ email: user.email, password: user.password, role: user.role, status: 'created' });
          }
        }
      } catch (err: unknown) {
        results.push({ email: user.email, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return new Response(
      JSON.stringify({ success: true, users: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
