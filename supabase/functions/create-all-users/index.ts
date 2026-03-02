import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Verificar autenticación
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No autorizado');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      throw new Error('No autorizado');
    }

    // Verificar que es gerente
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (userRole?.role !== 'gerente') {
      throw new Error('Solo gerentes pueden crear usuarios masivamente');
    }

    console.log('Iniciando creación masiva de usuarios...');

    const usuariosCreados = await crearUsuarios(supabaseAdmin);

    return new Response(
      JSON.stringify({
        success: true,
        usuarios: usuariosCreados,
        message: 'Usuarios creados exitosamente'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

function estadoToSlug(nombreEstado: string): string {
  const slug = nombreEstado
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return slug;
}

async function crearUsuarios(supabaseAdmin: any): Promise<any> {
  const usuariosCreados = {
    gerente: 0,
    lideres: 0,
    auxiliares: 0,
    almacenistas: 0
  };

  // 1. Crear gerente (si no existe)
  try {
    const { data: gerenteExistente } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'gerente')
      .limit(1);

    if (!gerenteExistente || gerenteExistente.length === 0) {
      const { data: gerenteUser, error: gerenteError } = await supabaseAdmin.auth.admin.createUser({
        email: 'gerente@imss.mx',
        password: 'Gerente123!',
        email_confirm: true,
        user_metadata: {
          nombre_completo: 'Gerente de Operaciones IMSS',
          role: 'gerente'
        }
      });

      if (!gerenteError && gerenteUser?.user) {
        await supabaseAdmin.from('user_roles').insert({
          user_id: gerenteUser.user.id,
          role: 'gerente',
          alcance: 'empresa',
          empresa_id: '11111111-1111-1111-1111-111111111111'
        });
        usuariosCreados.gerente = 1;
        console.log('Gerente creado');
      }
    } else {
      console.log('Gerente ya existe');
    }
  } catch (error) {
    console.error('Error creando gerente:', error);
  }

  // 2. Obtener todos los hospitales agrupados por estado
  const { data: hospitales } = await supabaseAdmin
    .from('hospitales')
    .select('id, nombre, codigo, estado_id, estados(id, nombre, codigo)')
    .order('estado_id');

  if (!hospitales) {
    console.log('No hay hospitales');
    return usuariosCreados;
  }

  // Agrupar hospitales por estado
  const hospitalesPorEstado = new Map<string, any[]>();
  for (const hospital of hospitales) {
    const estadoId = hospital.estados.id;
    if (!hospitalesPorEstado.has(estadoId)) {
      hospitalesPorEstado.set(estadoId, []);
    }
    hospitalesPorEstado.get(estadoId)!.push(hospital);
  }

  console.log(`Estados encontrados: ${hospitalesPorEstado.size}`);

  // 3. Crear líderes (máximo 4 hospitales por líder)
  for (const [estadoId, hospitalesDelEstado] of hospitalesPorEstado.entries()) {
    if (hospitalesDelEstado.length === 0) continue;

    const estadoData = hospitalesDelEstado[0].estados;
    const estadoNombre = estadoData.nombre;
    const estadoSlug = estadoToSlug(estadoNombre);

    const numLideres = Math.ceil(hospitalesDelEstado.length / 4);

    for (let i = 0; i < numLideres; i++) {
      try {
        const hospitalesAsignados = hospitalesDelEstado.slice(i * 4, (i + 1) * 4);
        const primerHospital = hospitalesAsignados[0];

        const liderEmail = numLideres === 1
          ? `lider.${estadoSlug}@imss.mx`
          : `lider.${estadoSlug}.${i + 1}@imss.mx`;
        
        const liderPassword = 'Lider123!';
        
        const { data: liderUser, error: liderError } = await supabaseAdmin.auth.admin.createUser({
          email: liderEmail,
          password: liderPassword,
          email_confirm: true,
          user_metadata: {
            nombre_completo: numLideres === 1
              ? `Líder Hospitalario ${estadoNombre}`
              : `Líder Hospitalario ${estadoNombre} ${i + 1}`,
            role: 'lider'
          }
        });

        if (!liderError && liderUser?.user) {
          // Asignar perfil al primer hospital de su grupo
          await supabaseAdmin.from('profiles').update({
            hospital_id: primerHospital.id
          }).eq('id', liderUser.user.id);

          // Crear roles para cada hospital asignado
          for (const hosp of hospitalesAsignados) {
            await supabaseAdmin.from('user_roles').insert({
              user_id: liderUser.user.id,
              role: 'lider',
              alcance: 'hospital',
              hospital_id: hosp.id,
              estado_id: estadoId
            });
          }
          usuariosCreados.lideres++;
          console.log(`Líder creado: ${liderEmail}`);
        }
      } catch (error) {
        console.error('Error creando líder:', error);
      }
    }
  }

  // 4. Crear auxiliares y almacenistas por unidad
  // Agrupamos por estado para enumerar correctamente
  const auxiliaresPorEstado = new Map<string, number>();
  const almacenistasPorEstado = new Map<string, number>();

  for (const hospital of hospitales) {
    const estadoData = hospital.estados;
    const estadoNombre = estadoData.nombre;
    const estadoSlug = estadoToSlug(estadoNombre);
    const estadoCodigo = estadoData.codigo;

    // Obtener unidades del hospital
    const { data: unidades } = await supabaseAdmin
      .from('unidades')
      .select('*')
      .eq('hospital_id', hospital.id);

    if (!unidades) continue;

    for (const unidad of unidades) {
      // Crear auxiliar de anestesia para cada unidad de quirófano
      if (unidad.nombre.toLowerCase().includes('quirófano') || unidad.nombre.toLowerCase().includes('quirofano')) {
        try {
          const contadorAux = (auxiliaresPorEstado.get(estadoCodigo) || 0) + 1;
          auxiliaresPorEstado.set(estadoCodigo, contadorAux);

          const auxiliarEmail = contadorAux === 1
            ? `auxiliar.${estadoSlug}@imss.mx`
            : `auxiliar.${estadoSlug}.${contadorAux}@imss.mx`;
            
          const { data: auxiliarUser } = await supabaseAdmin.auth.admin.createUser({
            email: auxiliarEmail,
            password: 'Auxiliar123!',
            email_confirm: true,
            user_metadata: {
              nombre_completo: contadorAux === 1
                ? `Auxiliar ${estadoNombre}`
                : `Auxiliar ${estadoNombre} ${contadorAux}`,
              role: 'auxiliar',
              unidad: unidad.nombre
            }
          });

          if (auxiliarUser?.user) {
            await supabaseAdmin.from('profiles').update({
              hospital_id: hospital.id,
              unidad: unidad.nombre
            }).eq('id', auxiliarUser.user.id);

            await supabaseAdmin.from('user_roles').insert({
              user_id: auxiliarUser.user.id,
              role: 'auxiliar',
              alcance: 'hospital',
              hospital_id: hospital.id
            });
            usuariosCreados.auxiliares++;
            console.log(`Auxiliar creado: ${auxiliarEmail}`);
          }
        } catch (error) {
          console.error('Error creando auxiliar:', error);
        }
      }

      // Crear almacenista para cada unidad de almacén
      if (unidad.nombre.toLowerCase().includes('almacén') || unidad.nombre.toLowerCase().includes('almacen')) {
        try {
          const contadorAlm = (almacenistasPorEstado.get(estadoCodigo) || 0) + 1;
          almacenistasPorEstado.set(estadoCodigo, contadorAlm);

          const almacenistaEmail = contadorAlm === 1
            ? `almacenista.${estadoSlug}@imss.mx`
            : `almacenista.${estadoSlug}.${contadorAlm}@imss.mx`;
            
          const { data: almacenistaUser } = await supabaseAdmin.auth.admin.createUser({
            email: almacenistaEmail,
            password: 'Almacen123!',
            email_confirm: true,
            user_metadata: {
              nombre_completo: contadorAlm === 1
                ? `Almacenista ${estadoNombre}`
                : `Almacenista ${estadoNombre} ${contadorAlm}`,
              role: 'almacenista',
              unidad: unidad.nombre
            }
          });

          if (almacenistaUser?.user) {
            await supabaseAdmin.from('profiles').update({
              hospital_id: hospital.id,
              unidad: unidad.nombre
            }).eq('id', almacenistaUser.user.id);

            await supabaseAdmin.from('user_roles').insert({
              user_id: almacenistaUser.user.id,
              role: 'almacenista',
              alcance: 'hospital',
              hospital_id: hospital.id
            });
            usuariosCreados.almacenistas++;
            console.log(`Almacenista creado: ${almacenistaEmail}`);
          }
        } catch (error) {
          console.error('Error creando almacenista:', error);
        }
      }
    }
  }

  return usuariosCreados;
}
