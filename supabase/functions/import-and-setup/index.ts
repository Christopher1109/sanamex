import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HospitalData {
  estado: string;
  clave: string;
  tipo: string;
  numero: string;
  localidad: string;
  procedimiento: string;
}

interface UserCredentials {
  nombre: string;
  email: string;
  password: string;
  rol: string;
  hospital?: string;
  estado?: string;
  hospitales_asignados?: string[];
}

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

    const { data: hospitalDataArray } = await req.json();

    console.log(`Processing ${hospitalDataArray.length} rows`);

    // 1. Extract unique states
    const estadosMap = new Map<string, { nombre: string; codigo: string }>();
    hospitalDataArray.forEach((row: HospitalData) => {
      if (row.estado && row.clave) {
        const codigo = row.clave.substring(0, 2); // First 2 digits = state code
        if (!estadosMap.has(row.estado)) {
          estadosMap.set(row.estado, { nombre: row.estado, codigo });
        }
      }
    });

    // Insert states
    const estadosCreados = new Map<string, string>();
    for (const [nombreEstado, data] of estadosMap) {
      const { data: estado, error } = await supabaseAdmin
        .from('estados')
        .upsert(
          {
            nombre: data.nombre,
            codigo: data.codigo,
            empresa_id: '00000000-0000-0000-0000-000000000000' // Default empresa
          },
          { onConflict: 'codigo' }
        )
        .select()
        .single();

      if (error) {
        console.error(`Error creating state ${nombreEstado}:`, error);
        continue;
      }

      estadosCreados.set(nombreEstado, estado.id);
      console.log(`Created/found state: ${nombreEstado}`);
    }

    // 2. Extract and insert hospitals
    const hospitalesMap = new Map<string, any>();
    for (const row of hospitalDataArray) {
      const hospitalKey = `${row.clave}-${row.numero}`;
      
      if (!hospitalesMap.has(hospitalKey)) {
        const estadoId = estadosCreados.get(row.estado);
        if (!estadoId) continue;

        const { data: hospital, error } = await supabaseAdmin
          .from('hospitales')
          .upsert(
            {
              codigo: hospitalKey,
              nombre: `${row.tipo} ${row.numero} - ${row.localidad}`,
              clave_presupuestal: row.clave,
              tipo_hospital: row.tipo,
              numero_clinica: row.numero,
              localidad: row.localidad,
              estado_id: estadoId
            },
            { onConflict: 'codigo' }
          )
          .select()
          .single();

        if (error) {
          console.error(`Error creating hospital ${hospitalKey}:`, error);
          continue;
        }

        hospitalesMap.set(hospitalKey, hospital);
        console.log(`Created hospital: ${hospital.nombre}`);
      }
    }

    // 3. Insert procedures
    let procedimientosCreados = 0;
    for (const row of hospitalDataArray) {
      const hospitalKey = `${row.clave}-${row.numero}`;
      const hospital = hospitalesMap.get(hospitalKey);
      
      if (hospital && row.procedimiento) {
        const { error } = await supabaseAdmin
          .from('procedimientos')
          .upsert(
            {
              hospital_id: hospital.id,
              nombre: row.procedimiento,
              codigo: `PROC-${hospital.codigo}-${procedimientosCreados}`
            },
            { onConflict: 'hospital_id,nombre' }
          );

        if (!error) {
          procedimientosCreados++;
        }
      }
    }

    // 4. Generate users
    const usuariosGenerados: UserCredentials[] = [];

    // 4.1 Create Gerente de Operaciones
    const gerenteEmail = 'gerente.operaciones@imss.mx';
    const gerentePassword = 'Gerente2025!';
    
    const { data: gerenteAuth, error: gerenteError } = await supabaseAdmin.auth.admin.createUser({
      email: gerenteEmail,
      password: gerentePassword,
      email_confirm: true,
      user_metadata: {
        nombre_completo: 'Gerente de Operaciones'
      }
    });

    if (!gerenteError && gerenteAuth.user) {
      await supabaseAdmin.from('profiles').upsert({
        id: gerenteAuth.user.id,
        nombre_completo: 'Gerente de Operaciones',
        unidad: 'Dirección General'
      });

      await supabaseAdmin.from('user_roles').insert({
        user_id: gerenteAuth.user.id,
        role: 'gerente',
        alcance: 'empresa',
        empresa_id: '00000000-0000-0000-0000-000000000000'
      });

      usuariosGenerados.push({
        nombre: 'Gerente de Operaciones',
        email: gerenteEmail,
        password: gerentePassword,
        rol: 'gerente',
        estado: 'Todos'
      });

      console.log('Created Gerente de Operaciones');
    }

    // 4.2 Create users per hospital
    for (const [hospitalKey, hospital] of hospitalesMap) {
      const roles = ['almacenista', 'lider', 'auxiliar'];
      
      for (const rol of roles) {
        const email = `${rol}.${hospital.codigo}@imss.mx`.toLowerCase().replace(/\s/g, '');
        const password = `${rol.charAt(0).toUpperCase() + rol.slice(1)}2025!`;

        const { data: userAuth, error: userError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            nombre_completo: `${rol.charAt(0).toUpperCase() + rol.slice(1)} ${hospital.nombre}`
          }
        });

        if (!userError && userAuth.user) {
          await supabaseAdmin.from('profiles').upsert({
            id: userAuth.user.id,
            nombre_completo: `${rol.charAt(0).toUpperCase() + rol.slice(1)} ${hospital.nombre}`,
            unidad: hospital.nombre,
            hospital_id: hospital.id
          });

          await supabaseAdmin.from('user_roles').insert({
            user_id: userAuth.user.id,
            role: rol,
            alcance: 'hospital',
            hospital_id: hospital.id,
            estado_id: hospital.estado_id
          });

          usuariosGenerados.push({
            nombre: `${rol.charAt(0).toUpperCase() + rol.slice(1)} ${hospital.nombre}`,
            email,
            password,
            rol,
            hospital: hospital.nombre
          });
        }
      }
    }

    // 4.3 Create supervisors (max 4 hospitals each)
    const hospitalesPorEstado = new Map<string, any[]>();
    for (const hospital of hospitalesMap.values()) {
      const estadoId = hospital.estado_id;
      if (!hospitalesPorEstado.has(estadoId)) {
        hospitalesPorEstado.set(estadoId, []);
      }
      hospitalesPorEstado.get(estadoId)!.push(hospital);
    }

    let supervisorIndex = 1;
    for (const [estadoId, hospitales] of hospitalesPorEstado) {
      const numSupervisores = Math.ceil(hospitales.length / 4);
      
      for (let i = 0; i < numSupervisores; i++) {
        const hospitalesAsignados = hospitales.slice(i * 4, (i + 1) * 4);
        const estadoNombre = Array.from(estadosCreados.entries()).find(([_, id]) => id === estadoId)?.[0] || 'unknown';
        
        const email = `supervisor${supervisorIndex}@imss.mx`;
        const password = `Supervisor2025!`;

        const { data: supervisorAuth, error: supervisorError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            nombre_completo: `Supervisor ${supervisorIndex} - ${estadoNombre}`
          }
        });

        if (!supervisorError && supervisorAuth.user) {
          await supabaseAdmin.from('profiles').upsert({
            id: supervisorAuth.user.id,
            nombre_completo: `Supervisor ${supervisorIndex} - ${estadoNombre}`,
            unidad: estadoNombre
          });

          // Create role for each assigned hospital
          for (const hospital of hospitalesAsignados) {
            await supabaseAdmin.from('user_roles').insert({
              user_id: supervisorAuth.user.id,
              role: 'supervisor',
              alcance: 'hospital',
              hospital_id: hospital.id,
              estado_id: estadoId
            });
          }

          usuariosGenerados.push({
            nombre: `Supervisor ${supervisorIndex} - ${estadoNombre}`,
            email,
            password,
            rol: 'supervisor',
            estado: estadoNombre,
            hospitales_asignados: hospitalesAsignados.map(h => h.nombre)
          });

          supervisorIndex++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          estados: estadosCreados.size,
          hospitales: hospitalesMap.size,
          procedimientos: procedimientosCreados,
          usuarios: usuariosGenerados.length
        },
        usuarios: usuariosGenerados
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
