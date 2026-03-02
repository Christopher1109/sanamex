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
    const stateName = body.state_name; // Opcional

    console.log('=== RESETEANDO CONTRASEÑAS ===');
    if (stateName) {
      console.log(`Estado: ${stateName}`);
    }

    // Obtener usuarios de la tabla users
    let query = supabase.from('users').select('username, role');
    if (stateName) {
      query = query.eq('state_name', stateName);
    }

    const { data: usersData, error: usersError } = await query;
    if (usersError) throw usersError;

    console.log(`Usuarios a procesar: ${usersData?.length}`);

    // Obtener todos los usuarios de auth
    const { data: authData } = await supabase.auth.admin.listUsers();
    const authUsersByEmail = new Map(authData.users.map(u => [u.email, u.id]));

    const updated: string[] = [];
    const notFound: string[] = [];
    const errors: Array<{ username: string; error: string }> = [];

    for (const user of usersData || []) {
      const email = `${user.username}@hospital.imss.gob.mx`;
      const password = `IMSS2025${user.role.toUpperCase()}`;
      const userId = authUsersByEmail.get(email);

      if (!userId) {
        console.log(`❌ No encontrado en auth: ${email}`);
        notFound.push(user.username);
        continue;
      }

      try {
        console.log(`Actualizando: ${email}`);

        const { error: updateError } = await supabase.auth.admin.updateUserById(
          userId,
          { password }
        );

        if (updateError) throw updateError;

        updated.push(user.username);
        console.log(`✅ Actualizado: ${email}`);

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ Error ${user.username}:`, errorMsg);
        errors.push({ username: user.username, error: errorMsg });
      }
    }

    console.log('=== RESUMEN ===');
    console.log(`Actualizados: ${updated.length}`);
    console.log(`No encontrados: ${notFound.length}`);
    console.log(`Errores: ${errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: updated.length,
        notFound: notFound.length,
        errors: errors.length,
        updated_users: updated,
        not_found_users: notFound,
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