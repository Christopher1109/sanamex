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

    console.log('Obteniendo TODOS los usuarios de auth...');

    const { data: authData, error } = await supabase.auth.admin.listUsers();
    
    if (error) throw error;

    console.log(`Total: ${authData.users.length}`);

    const users = authData.users.map(u => ({
      id: u.id,
      email: u.email,
      username: u.user_metadata?.username || u.user_metadata?.nombre || 'N/A',
      confirmed: !!u.email_confirmed_at,
      created: u.created_at,
      last_sign_in: u.last_sign_in_at || 'Nunca'
    }));

    // Agrupar por primer palabra del email (estado o rol)
    const byPrefix = users.reduce((acc, u) => {
      const prefix = u.email?.split('_')[0] || 'sin_email';
      if (!acc[prefix]) acc[prefix] = [];
      acc[prefix].push(u);
      return acc;
    }, {} as Record<string, any[]>);

    return new Response(
      JSON.stringify({
        success: true,
        total: authData.users.length,
        users: users.slice(0, 50), // Primeros 50
        all_users: users, // Todos
        grouped_by_prefix: byPrefix
      }, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error:', error);
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