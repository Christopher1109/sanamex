import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserData {
  username: string;
  role: string;
  hospital_display_name: string | null;
  hospital_budget_code: string | null;
  state_name: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Iniciando recreación de usuarios en auth...');

    // Obtener todos los usuarios de la tabla users
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('username, role, hospital_display_name, hospital_budget_code, state_name')
      .order('state_name', { ascending: true });

    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw usersError;
    }

    console.log(`Encontrados ${usersData?.length} usuarios en la tabla users`);

    const created: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ username: string; error: string }> = [];

    // Procesar cada usuario
    for (const user of usersData || []) {
      try {
        const email = `${user.username}@hospital.imss.gob.mx`;
        const password = `IMSS2025${user.role.toUpperCase()}`;

        console.log(`Procesando usuario: ${user.username} (${email})`);

        // Verificar si el usuario ya existe
        const { data: existingUser } = await supabase.auth.admin.listUsers();
        const userExists = existingUser.users.some(u => u.email === email);

        if (userExists) {
          console.log(`Usuario ya existe: ${email}`);
          skipped.push(user.username);
          continue;
        }

        // Crear usuario en auth
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            username: user.username,
            nombre: user.username,
          }
        });

        if (authError) {
          console.error(`Error creando usuario ${email}:`, authError);
          errors.push({ username: user.username, error: authError.message });
          continue;
        }

        console.log(`Usuario creado en auth: ${email}`);

        // Crear perfil en profiles
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            nombre: user.username,
            hospital_id: null // Puedes ajustar esto según tu lógica
          });

        if (profileError) {
          console.error(`Error creando perfil para ${email}:`, profileError);
        }

        // Crear rol en user_roles
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: authData.user.id,
            role: user.role as any
          });

        if (roleError) {
          console.error(`Error asignando rol para ${email}:`, roleError);
        }

        created.push(user.username);
        console.log(`✓ Usuario completo: ${email}`);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Error procesando ${user.username}:`, errorMessage);
        errors.push({ username: user.username, error: errorMessage });
      }
    }

    console.log('=== RESUMEN ===');
    console.log(`Creados: ${created.length}`);
    console.log(`Saltados (ya existían): ${skipped.length}`);
    console.log(`Errores: ${errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: usersData?.length || 0,
          created: created.length,
          skipped: skipped.length,
          errors: errors.length
        },
        created,
        skipped,
        errors
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error en recreate-auth-users:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});