import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
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

    console.log('Starting system reset...');

    // 1. Delete all users from auth
    const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (usersError) throw usersError;

    console.log(`Deleting ${users.users.length} users...`);
    
    for (const user of users.users) {
      await supabaseAdmin.auth.admin.deleteUser(user.id);
    }

    // 2. Delete all data from tables
    await supabaseAdmin.from('user_roles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('tickets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('folio_insumos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('folios').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('insumos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('medicos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('paquete_insumos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('paquetes_anestesia').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('paquetes_procedimiento').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('procedimientos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('hospital_procedimientos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('traspaso_insumos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('traspasos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('unidades').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('hospitales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('estados').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('empresas').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log('System reset complete');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Sistema completamente limpiado. Ahora puedes ejecutar la importación.',
        deleted_users: users.users.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
