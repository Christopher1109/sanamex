import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

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

    // Obtener el body de la petición
    const body = await req.json().catch(() => ({}));
    const stateName = body.state_name;

    console.log('Iniciando exportación de usuarios...', stateName ? `Estado: ${stateName}` : 'Todos los estados');

    // Obtener usuarios filtrados por estado si se proporciona
    let query = supabase
      .from('users')
      .select('*')
      .order('state_name', { ascending: true });
    
    if (stateName) {
      query = query.eq('state_name', stateName);
    }

    const { data: usersData, error: usersError } = await query;

    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw usersError;
    }

    console.log('Usuarios obtenidos:', usersData?.length);

    // Obtener todos los usuarios de auth para obtener emails
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error('Error fetching auth users:', authError);
      throw authError;
    }

    console.log('Auth users obtenidos:', authData.users.length);

    // Crear un mapa de username a email
    const emailMap = new Map();
    authData.users.forEach(authUser => {
      const metadata = authUser.user_metadata || {};
      const username = metadata.username || authUser.email?.split('@')[0];
      if (username) {
        emailMap.set(username, authUser.email || 'Sin email');
      }
    });

    // Combinar los datos
    const exportData = usersData?.map(user => ({
      'Usuario': user.username,
      'Email': emailMap.get(user.username) || 'No encontrado',
      'Rol': user.role,
      'Hospital': user.hospital_display_name || 'N/A',
      'Código Hospital': user.hospital_budget_code || 'N/A',
      'Estado': user.state_name || 'N/A',
      'Hospitales Asignados': user.assigned_hospitals || 'N/A',
      'Grupo Supervisor': user.supervisor_group || 'N/A',
      'Fecha Creación': user.created_at ? new Date(user.created_at).toLocaleDateString('es-MX') : 'N/A'
    })) || [];

    console.log('Datos procesados:', exportData.length, 'registros');

    // Crear el workbook
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuarios');

    // Ajustar ancho de columnas
    const columnWidths = [
      { wch: 40 }, // Usuario
      { wch: 35 }, // Email
      { wch: 15 }, // Rol
      { wch: 30 }, // Hospital
      { wch: 20 }, // Código Hospital
      { wch: 25 }, // Estado
      { wch: 50 }, // Hospitales Asignados
      { wch: 18 }, // Grupo Supervisor
      { wch: 18 }, // Fecha Creación
    ];
    worksheet['!cols'] = columnWidths;

    // Generar el archivo Excel
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true 
    });

    console.log('Excel generado exitosamente');

    // Retornar el archivo
    return new Response(excelBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="usuarios_sistema_${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });

  } catch (error) {
    console.error('Error en export-users-excel:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
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
