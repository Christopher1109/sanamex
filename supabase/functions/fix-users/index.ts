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

    console.log('Starting user fix process...');

    // Get all users without profiles
    const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (usersError) throw usersError;

    console.log(`Found ${users.users.length} users`);

    let fixed = 0;
    let errors = 0;

    for (const user of users.users) {
      try {
        // Check if profile exists
        const { data: existingProfile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single();

        // Check if role exists
        const { data: existingRole } = await supabaseAdmin
          .from('user_roles')
          .select('user_id')
          .eq('user_id', user.id)
          .single();

        // Determine role and details from email
        let role = 'auxiliar';
        let nombre = 'Usuario';
        let unidad = 'Unidad Central';
        let alcance = 'hospital';
        let hospital_id = null;
        let estado_id = null;
        let empresa_id = null;

        if (user.email?.includes('gerente')) {
          role = 'gerente';
          nombre = 'Gerente de Operaciones';
          unidad = 'Dirección General';
          alcance = 'empresa';
          empresa_id = '00000000-0000-0000-0000-000000000000';
        } else if (user.email?.includes('supervisor')) {
          role = 'supervisor';
          nombre = user.email.split('@')[0].replace('.', ' ').split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          alcance = 'hospital';
        } else if (user.email?.includes('almacenista')) {
          role = 'almacenista';
          nombre = 'Almacenista';
          alcance = 'hospital';
        } else if (user.email?.includes('lider')) {
          role = 'lider';
          nombre = 'Líder';
          alcance = 'hospital';
        } else if (user.email?.includes('auxiliar')) {
          role = 'auxiliar';
          nombre = 'Auxiliar';
          alcance = 'hospital';
        }

        // Get hospital_id from email pattern if not gerente
        if (role !== 'gerente' && user.email) {
          // Extract hospital code from email (e.g., almacenista.020115182151-31@imss.mx)
          const emailParts = user.email.split('@')[0].split('.');
          if (emailParts.length > 1) {
            const hospitalCode = emailParts[emailParts.length - 1];
            
            // Find hospital by codigo
            const { data: hospital } = await supabaseAdmin
              .from('hospitales')
              .select('id, estado_id, nombre')
              .eq('codigo', hospitalCode)
              .single();

            if (hospital) {
              hospital_id = hospital.id;
              estado_id = hospital.estado_id;
              unidad = hospital.nombre;
              
              // Get empresa_id from estado
              const { data: estado } = await supabaseAdmin
                .from('estados')
                .select('empresa_id')
                .eq('id', estado_id)
                .single();
              
              if (estado) {
                empresa_id = estado.empresa_id;
              }
            }
          }
        }

        // Create or update profile
        if (!existingProfile) {
          const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
              id: user.id,
              nombre_completo: nombre,
              unidad: unidad,
              hospital_id: hospital_id
            });

          if (profileError) {
            console.error(`Error creating profile for ${user.email}:`, profileError);
            errors++;
            continue;
          }
        }

        // Create or update role
        if (!existingRole) {
          const { error: roleError } = await supabaseAdmin
            .from('user_roles')
            .insert({
              user_id: user.id,
              role: role,
              alcance: alcance,
              hospital_id: hospital_id,
              estado_id: estado_id,
              empresa_id: empresa_id
            });

          if (roleError) {
            console.error(`Error creating role for ${user.email}:`, roleError);
            errors++;
            continue;
          }
        }

        console.log(`Fixed user: ${user.email} (${role})`);
        fixed++;

      } catch (error) {
        console.error(`Error processing user ${user.email}:`, error);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        fixed,
        errors,
        total: users.users.length
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
