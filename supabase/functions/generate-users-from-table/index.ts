import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserCredential {
  username: string;
  email: string;
  password: string;
  role: string;
  state_name: string | null;
  hospital_display_name: string | null;
  assigned_hospitals: string | null;
}

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

    console.log('Iniciando generación de usuarios desde tabla users...');

    // Obtener todos los usuarios de la tabla users
    const { data: usersFromTable, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('*')
      .order('role');

    if (fetchError) {
      throw new Error(`Error al obtener usuarios: ${fetchError.message}`);
    }

    if (!usersFromTable || usersFromTable.length === 0) {
      throw new Error('No hay usuarios en la tabla users');
    }

    console.log(`Encontrados ${usersFromTable.length} usuarios para crear`);

    const credentials: UserCredential[] = [];
    const errors: any[] = [];
    let created = 0;
    let skipped = 0;

    // Mapeo de roles de la tabla users a app_role
    const roleMapping: Record<string, string> = {
      'gerente_operaciones': 'gerente',
      'supervisor': 'supervisor',
      'lider': 'lider',
      'almacenista': 'almacenista',
      'auxiliar': 'auxiliar'
    };

    // Función para sanitizar username y convertirlo en email válido
    const sanitizeUsername = (username: string): string => {
      return username
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
        .replace(/[^a-z0-9_.-]/g, '_') // Reemplazar caracteres no válidos con _
        .replace(/_+/g, '_') // Evitar múltiples guiones bajos consecutivos
        .replace(/^[._]|[._]$/g, ''); // Eliminar puntos/guiones al inicio o final
    };

    for (const user of usersFromTable) {
      try {
        const sanitizedUsername = sanitizeUsername(user.username);
        const email = `${sanitizedUsername}@hospital.imss.gob.mx`;
        const password = `IMSS2025${user.role}`;
        
        console.log(`Procesando: ${user.username} -> ${sanitizedUsername} (${user.role})`);

        // Verificar si el usuario ya existe por email
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const userExists = existingUsers?.users?.some(u => u.email === email);

        if (userExists) {
          console.log(`Usuario ya existe: ${email}`);
          skipped++;
          credentials.push({
            username: user.username,
            email,
            password,
            role: user.role,
            state_name: user.state_name,
            hospital_display_name: user.hospital_display_name,
            assigned_hospitals: user.assigned_hospitals
          });
          continue;
        }

        // Crear usuario en auth.users
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            nombre_completo: user.username,
            role: user.role
          }
        });

        if (authError) {
          console.error(`Error creando usuario ${email}:`, authError);
          errors.push({ username: user.username, error: authError.message });
          continue;
        }

        if (!authUser?.user) {
          console.error(`No se pudo crear usuario ${email}`);
          errors.push({ username: user.username, error: 'No user returned' });
          continue;
        }

        console.log(`Usuario creado en auth: ${email}`);

        // Crear perfil
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: authUser.user.id,
            nombre: user.username,
            hospital_id: null // Podríamos buscar el hospital_id basado en hospital_budget_code si es necesario
          });

        if (profileError) {
          console.error(`Error creando perfil para ${email}:`, profileError);
        }

        // Asignar rol en user_roles
        const appRole = roleMapping[user.role] || 'auxiliar';
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: authUser.user.id,
            role: appRole
          });

        if (roleError) {
          console.error(`Error asignando rol para ${email}:`, roleError);
        }

        created++;
        credentials.push({
          username: user.username,
          email,
          password,
          role: user.role,
          state_name: user.state_name,
          hospital_display_name: user.hospital_display_name,
          assigned_hospitals: user.assigned_hospitals
        });

        console.log(`Usuario completado: ${email}`);

      } catch (error) {
        console.error(`Error procesando usuario ${user.username}:`, error);
        errors.push({ 
          username: user.username, 
          error: error instanceof Error ? error.message : 'Error desconocido' 
        });
      }
    }

    console.log(`Proceso completado: ${created} creados, ${skipped} ya existían, ${errors.length} errores`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: usersFromTable.length,
          created,
          skipped,
          errors: errors.length
        },
        credentials,
        errors: errors.length > 0 ? errors : undefined,
        message: `Se procesaron ${usersFromTable.length} usuarios: ${created} creados, ${skipped} ya existían`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error general:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
