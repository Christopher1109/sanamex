import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExcelRow {
  Nombre_Usuario: string;
  Rol: string;
  Estado: string;
  Hospital: string;
  Hospitales_Asignados: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: excelData } = await req.json();

    if (!excelData || !Array.isArray(excelData)) {
      throw new Error('Invalid data format. Expected array of Excel rows.');
    }

    console.log(`Processing ${excelData.length} rows from Excel`);

    // 1. Get or create empresa (Grupo CB)
    let empresa;
    const { data: existingEmpresa } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('codigo', 'CB')
      .single();

    if (existingEmpresa) {
      empresa = existingEmpresa;
      console.log('Using existing empresa:', empresa.id);
    } else {
      const { data: newEmpresa, error: empresaError } = await supabaseAdmin
        .from('empresas')
        .insert({ nombre: 'Grupo CB', codigo: 'CB' })
        .select()
        .single();
      
      if (empresaError) throw empresaError;
      empresa = newEmpresa;
      console.log('Empresa created:', empresa.id);
    }

    // 2. Get or create estados
    const estadosSet = new Set<string>();
    excelData.forEach((row: ExcelRow) => {
      if (row.Estado && row.Estado !== 'Todos') {
        estadosSet.add(row.Estado);
      }
    });

    const estadosMap = new Map<string, string>();
    for (const estadoNombre of estadosSet) {
      const codigo = estadoNombre.substring(0, 3).toUpperCase();
      
      const { data: existingEstado } = await supabaseAdmin
        .from('estados')
        .select('*')
        .eq('empresa_id', empresa.id)
        .eq('codigo', codigo)
        .single();

      if (existingEstado) {
        estadosMap.set(estadoNombre, existingEstado.id);
        console.log(`Using existing estado: ${estadoNombre} (${existingEstado.id})`);
      } else {
        const { data: newEstado, error: estadoError } = await supabaseAdmin
          .from('estados')
          .insert({
            nombre: estadoNombre,
            codigo: codigo,
            empresa_id: empresa.id
          })
          .select()
          .single();

        if (estadoError) throw estadoError;
        estadosMap.set(estadoNombre, newEstado.id);
        console.log(`Estado created: ${estadoNombre} (${newEstado.id})`);
      }
    }

    // 3. Get or create hospitales
    const hospitalesMap = new Map<string, { id: string, estado: string }>();
    for (const row of excelData) {
      if (row.Hospital && row.Hospital !== 'Todos' && !hospitalesMap.has(row.Hospital)) {
        const estadoId = estadosMap.get(row.Estado);
        if (!estadoId) continue;

        const codigo = row.Hospital.substring(0, 10).toUpperCase().replace(/\s/g, '');
        
        const { data: existingHospital } = await supabaseAdmin
          .from('hospitales')
          .select('*')
          .eq('codigo', codigo)
          .eq('estado_id', estadoId)
          .single();

        if (existingHospital) {
          hospitalesMap.set(row.Hospital, { id: existingHospital.id, estado: row.Estado });
          console.log(`Using existing hospital: ${row.Hospital} (${existingHospital.id})`);
        } else {
          const { data: newHospital, error: hospitalError } = await supabaseAdmin
            .from('hospitales')
            .insert({
              nombre: row.Hospital,
              codigo: codigo,
              estado_id: estadoId
            })
            .select()
            .single();

          if (hospitalError) throw hospitalError;
          hospitalesMap.set(row.Hospital, { id: newHospital.id, estado: row.Estado });
          
          // Create unidades for this hospital
          await supabaseAdmin.from('unidades').insert([
            {
              nombre: 'Quirófano',
              codigo: 'QX',
              tipo: 'quirofano',
              hospital_id: newHospital.id
            },
            {
              nombre: 'Almacén',
              codigo: 'ALM',
              tipo: 'almacen',
              hospital_id: newHospital.id
            }
          ]);

          console.log(`Hospital created: ${row.Hospital} (${newHospital.id})`);
        }
      }
    }

    // 4. Create users (skip if already exists)
    const createdUsers = [];
    const skippedUsers = [];
    
    for (const row of excelData) {
      try {
        const email = generateEmail(row);
        const password = 'imss2024';
        
        // Try to create auth user directly - it will fail if exists
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: email,
          password: password,
          email_confirm: true,
          user_metadata: {
            nombre_completo: row.Nombre_Usuario
          }
        });

        if (authError) {
          if (authError.message?.includes('already been registered')) {
            console.log(`User already exists, skipping: ${email}`);
            skippedUsers.push(email);
            continue;
          }
          console.error(`Error creating user ${email}:`, authError);
          continue;
        }

        console.log(`User created: ${email} (${authUser.user.id})`);

        // Determine role and scope
        const roleInfo = determineRoleAndScope(row, estadosMap, hospitalesMap, empresa.id);
        
        // Create profile - SOLO si tiene hospital_id válido
        const hospitalId = row.Hospital && row.Hospital !== 'Todos' 
          ? hospitalesMap.get(row.Hospital)?.id 
          : null;

        // Solo crear perfiles para usuarios que tienen hospital asignado
        if (hospitalId || roleInfo.role === 'gerente') {
          await supabaseAdmin.from('profiles').upsert({
            id: authUser.user.id,
            nombre_completo: row.Nombre_Usuario,
            unidad: row.Hospital || 'Todos',
            hospital_id: hospitalId
          });
        }

        // Create user role
        await supabaseAdmin.from('user_roles').insert({
          user_id: authUser.user.id,
          role: roleInfo.role,
          alcance: roleInfo.alcance,
          hospital_id: roleInfo.hospital_id,
          estado_id: roleInfo.estado_id,
          empresa_id: roleInfo.empresa_id
        });

        createdUsers.push({
          nombre: row.Nombre_Usuario,
          email: email,
          password: password,
          rol: row.Rol,
          estado: row.Estado,
          hospital: row.Hospital,
          hospitales_asignados: row.Hospitales_Asignados || row.Hospital
        });
      } catch (rowError) {
        console.error(`Error processing row for ${row.Nombre_Usuario}:`, rowError);
        continue;
      }
    }

    console.log(`Process completed: ${createdUsers.length} new users, ${skippedUsers.length} skipped`);

    // Get total users in system
    const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers();
    const totalUsersInSystem = allUsers?.users.length || 0;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: createdUsers.length > 0 
          ? `${createdUsers.length} usuarios creados exitosamente${skippedUsers.length > 0 ? `, ${skippedUsers.length} ya existían` : ''}`
          : `Todos los usuarios (${skippedUsers.length}) ya existían en el sistema`,
        users: createdUsers,
        skippedCount: skippedUsers.length,
        totalInSystem: totalUsersInSystem,
        summary: {
          empresa: empresa.nombre,
          estados: estadosMap.size,
          hospitales: hospitalesMap.size,
          usuarios: createdUsers.length,
          usuariosExistentes: skippedUsers.length,
          totalUsuarios: totalUsersInSystem
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function generateEmail(row: ExcelRow): string {
  // Normalizar caracteres especiales (tildes, ñ, etc.)
  const normalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
      .replace(/ñ/g, 'n')
      .replace(/[^a-z0-9]/g, '-') // Solo letras, números y guiones
      .replace(/-+/g, '-') // Eliminar guiones múltiples
      .replace(/^-|-$/g, ''); // Eliminar guiones al inicio/final
  };
  
  const rol = row.Rol.toLowerCase();
  const estado = normalizeText(row.Estado);
  const hospital = row.Hospital ? normalizeText(row.Hospital) : '';
  
  if (rol.includes('gerente de operaciones')) {
    return 'gerente.operaciones@imss.mx';
  } else if (rol.includes('supervisor')) {
    const match = row.Nombre_Usuario.match(/Supervisor (.+) (\d+)/);
    const numero = match ? match[2] : '1';
    return `supervisor.${estado}.${numero}@imss.mx`;
  } else if (rol.includes('líder')) {
    return `lider.${estado}.${hospital}@imss.mx`;
  } else if (rol.includes('auxiliar')) {
    return `auxiliar.${estado}.${hospital}@imss.mx`;
  } else if (rol.includes('almacenista')) {
    return `almacenista.${estado}.${hospital}@imss.mx`;
  }
  
  return `${rol}.${estado}@imss.mx`;
}

function determineRoleAndScope(
  row: ExcelRow,
  estadosMap: Map<string, string>,
  hospitalesMap: Map<string, { id: string, estado: string }>,
  empresaId: string
): {
  role: string;
  alcance: string;
  hospital_id: string | null;
  estado_id: string | null;
  empresa_id: string | null;
} {
  const rol = row.Rol.toLowerCase();
  
  if (rol.includes('gerente de operaciones')) {
    return {
      role: 'gerente',
      alcance: 'empresa',
      hospital_id: null,
      estado_id: null,
      empresa_id: empresaId
    };
  } else if (rol.includes('supervisor')) {
    return {
      role: 'supervisor',
      alcance: 'estado',
      hospital_id: null,
      estado_id: estadosMap.get(row.Estado) || null,
      empresa_id: null
    };
  } else if (rol.includes('líder')) {
    return {
      role: 'lider',
      alcance: 'hospital',
      hospital_id: hospitalesMap.get(row.Hospital)?.id || null,
      estado_id: null,
      empresa_id: null
    };
  } else if (rol.includes('auxiliar')) {
    return {
      role: 'auxiliar',
      alcance: 'hospital',
      hospital_id: hospitalesMap.get(row.Hospital)?.id || null,
      estado_id: null,
      empresa_id: null
    };
  } else if (rol.includes('almacenista')) {
    return {
      role: 'almacenista',
      alcance: 'hospital',
      hospital_id: hospitalesMap.get(row.Hospital)?.id || null,
      estado_id: null,
      empresa_id: null
    };
  }
  
  return {
    role: 'auxiliar',
    alcance: 'hospital',
    hospital_id: null,
    estado_id: null,
    empresa_id: null
  };
}
