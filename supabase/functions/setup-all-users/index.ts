import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UNIVERSAL_PASSWORD = 'Imss2024!';

interface Hospital {
  id: string;
  display_name: string;
  budget_code: string;
  state_id: string;
  state_name?: string;
}

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

async function deleteAllAuthUsers(supabaseAdmin: any) {
  console.log('🗑️ Deleting ALL auth users with pagination...');
  let totalDeleted = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ 
      page: 1, 
      perPage: 100 
    });
    
    if (error || !users || users.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const user of users) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(user.id);
        totalDeleted++;
      } catch (e) {
        console.log(`Could not delete ${user.email}`);
      }
    }
    
    console.log(`🗑️ Deleted batch, total: ${totalDeleted}`);
    
    // If we deleted less than 100, we're done
    if (users.length < 100) hasMore = false;
  }
  
  console.log(`🗑️ Total deleted: ${totalDeleted}`);
  return totalDeleted;
}

async function setupAllUsers() {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log('🚀 Starting COMPLETE user setup...');

  // STEP 1: Delete ALL auth users with pagination
  await deleteAllAuthUsers(supabaseAdmin);

  // STEP 2: Clean all related tables
  console.log('🧹 Cleaning database tables...');
  await supabaseAdmin.from('user_roles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('users').delete().neq('id', 0);
  console.log('🧹 Tables cleaned');

  // STEP 3: Get all hospitals
  const { data: hospitalesRaw } = await supabaseAdmin
    .from('hospitales')
    .select('id, display_name, budget_code, state_id')
    .order('display_name');

  const { data: states } = await supabaseAdmin.from('states').select('id, name');

  const stateMap: Record<string, string> = {};
  for (const s of states || []) stateMap[s.id] = s.name;

  const hospitales: Hospital[] = (hospitalesRaw || []).map(h => ({
    ...h,
    state_name: stateMap[h.state_id] || 'Sin Estado'
  }));

  console.log(`📊 Found ${hospitales.length} hospitals in ${Object.keys(stateMap).length} states`);

  // Group by state
  const hospitalsByState: Record<string, Hospital[]> = {};
  for (const h of hospitales) {
    if (!h.state_id) continue;
    if (!hospitalsByState[h.state_id]) hospitalsByState[h.state_id] = [];
    hospitalsByState[h.state_id].push(h);
  }

  let created = 0, errors = 0;

  async function createUser(
    username: string, role: string, nombre: string, 
    primaryHospital: Hospital | null, assignedHospitals: Hospital[]
  ) {
    try {
      const email = `${username}@sistema.local`;
      
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: UNIVERSAL_PASSWORD,
        email_confirm: true,
        user_metadata: { username, nombre_completo: nombre, role }
      });

      if (authError || !authUser?.user) {
        console.log(`❌ ${username}: ${authError?.message}`);
        errors++;
        return;
      }

      // Insert profile - link to primary hospital
      const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        id: authUser.user.id, 
        nombre, 
        username,
        hospital_id: primaryHospital?.id || null
      });
      
      if (profileError) {
        console.log(`Profile error ${username}: ${profileError.message}`);
      }

      // Assign role
      const { error: roleError } = await supabaseAdmin.from('user_roles').insert({
        user_id: authUser.user.id, 
        role
      });
      
      if (roleError) {
        console.log(`Role error ${username}: ${roleError.message}`);
      }

      // Insert into users table with COMPLETE hospital assignment
      const { error: userTableError } = await supabaseAdmin.from('users').insert({
        username,
        role,
        state_name: primaryHospital?.state_name || null,
        hospital_budget_code: primaryHospital?.budget_code || null,
        hospital_display_name: primaryHospital?.display_name || null,
        assigned_hospitals: assignedHospitals.length > 1 
          ? assignedHospitals.map(h => h.budget_code).join(',') 
          : null
      });
      
      if (userTableError) {
        console.log(`Users table error ${username}: ${userTableError.message}`);
      }

      created++;
      if (created % 20 === 0) console.log(`✅ Progress: ${created} users created`);
    } catch (e) {
      console.log(`❌ ${username}: ${e}`);
      errors++;
    }
  }

  // STEP 4: Create hospital-level users (1 of each per hospital)
  console.log('👥 Creating hospital users...');
  let num = 1;
  for (const hospital of hospitales) {
    const pad = String(num).padStart(2, '0');
    
    // Each user is ONLY assigned to their specific hospital
    await createUser(
      `auxiliar${pad}`, 'auxiliar', 
      `Auxiliar ${hospital.display_name?.substring(0, 20)}`, 
      hospital, [hospital]
    );
    
    await createUser(
      `lider${pad}`, 'lider', 
      `Líder ${hospital.display_name?.substring(0, 20)}`, 
      hospital, [hospital]
    );
    
    await createUser(
      `almacenista${pad}`, 'almacenista', 
      `Almacenista ${hospital.display_name?.substring(0, 20)}`, 
      hospital, [hospital]
    );
    
    num++;
  }
  console.log(`✅ Hospital users done: ${created}`);

  // STEP 5: Create supervisors (1 per 4 hospitals in same state)
  console.log('👥 Creating supervisors...');
  let supNum = 1;
  for (const [stateId, stateHospitals] of Object.entries(hospitalsByState)) {
    const numSups = Math.ceil(stateHospitals.length / 4);
    const stateName = stateMap[stateId] || 'Zona';
    
    for (let i = 0; i < numSups; i++) {
      const assigned = stateHospitals.slice(i * 4, (i + 1) * 4);
      await createUser(
        `supervisor${String(supNum++).padStart(2, '0')}`, 
        'supervisor', 
        `Supervisor ${stateName.substring(0, 15)} Z${i + 1}`,
        assigned[0], // Primary hospital is first one
        assigned // Can access all 4 assigned hospitals
      );
    }
  }
  console.log(`✅ Supervisors done, total: ${created}`);

  // STEP 6: Create global roles (access to ALL hospitals)
  console.log('👥 Creating global roles...');
  await createUser('operaciones01', 'gerente_operaciones', 'Gerente de Operaciones', null, hospitales);
  await createUser('almacen_gral01', 'gerente_almacen', 'Gerente de Almacén Central', null, hospitales);
  await createUser('suministros01', 'cadena_suministros', 'Cadena de Suministros', null, hospitales);

  console.log(`🎉 SETUP COMPLETE: ${created} users created, ${errors} errors`);
  console.log(`📋 Summary: ${hospitales.length} hospitales × 3 roles + supervisores + 3 globales`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Start background task
  EdgeRuntime.waitUntil(setupAllUsers());

  return new Response(JSON.stringify({
    success: true,
    message: 'Setup completo iniciado en background. Revisa logs para progreso.',
    password: UNIVERSAL_PASSWORD,
    structure: {
      porHospital: '1 auxiliar + 1 líder + 1 almacenista',
      supervisor: '1 por cada 4 hospitales de la misma zona',
      globales: 'operaciones01, almacen_gral01, suministros01'
    },
    credentials: [
      { user: 'auxiliar01', pass: UNIVERSAL_PASSWORD, acceso: 'Solo su hospital asignado' },
      { user: 'lider01', pass: UNIVERSAL_PASSWORD, acceso: 'Solo su hospital asignado' },
      { user: 'almacenista01', pass: UNIVERSAL_PASSWORD, acceso: 'Solo su hospital asignado' },
      { user: 'supervisor01', pass: UNIVERSAL_PASSWORD, acceso: '4 hospitales de su zona' },
      { user: 'operaciones01', pass: UNIVERSAL_PASSWORD, acceso: 'Todos los hospitales' },
      { user: 'almacen_gral01', pass: UNIVERSAL_PASSWORD, acceso: 'Todos los hospitales' },
      { user: 'suministros01', pass: UNIVERSAL_PASSWORD, acceso: 'Todos los hospitales' },
    ]
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
