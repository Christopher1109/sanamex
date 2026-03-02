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
    const filter = body.filter || 'coahuila';

    console.log(`Consultando usuarios de auth que contengan: ${filter}`);

    // Obtener TODOS los usuarios de auth
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      throw authError;
    }

    console.log(`Total usuarios en auth: ${authData.users.length}`);

    // Filtrar los que contienen el texto buscado
    const filtered = authData.users.filter(u => 
      u.email?.toLowerCase().includes(filter.toLowerCase()) ||
      u.user_metadata?.username?.toLowerCase().includes(filter.toLowerCase())
    );

    console.log(`Usuarios filtrados: ${filtered.length}`);

    const userInfo = filtered.map(u => ({
      email: u.email,
      username: u.user_metadata?.username || 'N/A',
      email_confirmed: !!u.email_confirmed_at,
      created_at: u.created_at,
      last_sign_in: u.last_sign_in_at || 'Nunca'
    }));

    return new Response(
      JSON.stringify({
        success: true,
        total_auth_users: authData.users.length,
        filtered_count: filtered.length,
        users: userInfo
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});