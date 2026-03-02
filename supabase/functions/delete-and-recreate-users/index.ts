import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const stateName = body.state_name; // Opcional: filtrar por estado

    console.log('=== ELIMINANDO Y RECREANDO USUARIOS ===');
    if (stateName) {
      console.log(`Filtrando por estado: ${stateName}`);
    }

    // Obtener usuarios de la tabla users
    let query = supabase
      .from('users')
      .select('username, role');
    
    if (stateName) {
      query = query.eq('state_name', stateName);
    }

    const { data: usersData, error: usersError } = await query;

    if (usersError) throw usersError;

    console.log(`Total usuarios en tabla users: ${usersData?.length}`);

    // Obtener todos los usuarios de auth
    const { data: authData } = await supabase.auth.admin.listUsers();
    
    const created: string[] = [];
    const errors: Array<{ username: string; error: string }> = [];

    // Procesar cada usuario
    for (const user of usersData || []) {
      const email = `${user.username}@hospital.imss.gob.mx`;
      
      try {
        // Buscar el usuario en auth por email
        const existingUser = authData.users.find(u => u.email === email);
        
        // Si existe, eliminarlo primero
        if (existingUser) {
          console.log(`Eliminando usuario existente: ${email}`);
          await supabase.auth.admin.deleteUser(existingUser.id);
        }

        const password = `IMSS2025${user.role.toUpperCase()}`;

        console.log(`Creando: ${email}`);

        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            username: user.username,
            nombre: user.username,
          }
        });

        if (authError) throw authError;

        // Crear perfil
        await supabase.from('profiles').insert({
          id: authUser.user.id,
          nombre: user.username,
        });

        // Asignar rol
        await supabase.from('user_roles').insert({
          user_id: authUser.user.id,
          role: user.role as any,
        });

        created.push(user.username);
        console.log(`✅ Creado: ${email}`);

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ Error ${user.username}:`, errorMsg);
        errors.push({ username: user.username, error: errorMsg });
      }
    }

    console.log('=== RESUMEN ===');
    console.log(`Creados: ${created.length}`);
    console.log(`Errores: ${errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        created: created.length,
        errors: errors.length,
        created_users: created,
        error_details: errors
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error fatal:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
