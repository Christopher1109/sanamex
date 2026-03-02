import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeo de nombres de procedimientos del Excel a valores de base de datos
const procedimientoMapping: Record<string, string> = {
  'Sedación': 'sedacion',
  'Anestesia Loco Regional': 'loco_regional',
  'Anestesia General Balanceada Adulto': 'general_balanceada_adulto',
  'Anestesia General Balanceada Pediátrica': 'general_balanceada_pediatrica',
  'Anestesia General Endovenosa': 'general_endovenosa',
  'Anestesia General de Alta Especialidad': 'alta_especialidad',
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
    const data = body.data || [];

    console.log('=== IMPORTANDO PROCEDIMIENTOS POR HOSPITAL ===');
    console.log(`Registros a procesar: ${data.length}`);

    let processed = 0;
    let created = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      processed++;

      try {
        const { estado, tipo, numero, localidad, procedimientos } = row;

        console.log(`\n--- Procesando fila ${i + 1} ---`);
        console.log(`Hospital: ${tipo} ${numero} ${localidad}, ${estado}`);

        // Buscar el hospital en la base de datos
        const { data: hospitales, error: hospitalError } = await supabase
          .from('hospitales')
          .select('id, display_name')
          .ilike('display_name', `${tipo} ${numero} ${localidad}%`)
          .limit(1);

        if (hospitalError) throw hospitalError;

        if (!hospitales || hospitales.length === 0) {
          console.log(`❌ Hospital no encontrado: ${tipo} ${numero} ${localidad}`);
          skipped++;
          continue;
        }

        const hospital = hospitales[0];
        console.log(`✅ Hospital encontrado: ${hospital.display_name} (${hospital.id})`);

        // Parsear los procedimientos (separados por comas)
        const procedimientosList = procedimientos
          .split(',')
          .map((p: string) => p.trim())
          .filter((p: string) => p.length > 0);

        console.log(`Procedimientos a agregar: ${procedimientosList.length}`);

        // Eliminar procedimientos existentes para este hospital
        const { error: deleteError } = await supabase
          .from('procedimientos')
          .delete()
          .eq('hospital_id', hospital.id);

        if (deleteError) {
          console.error('Error al eliminar procedimientos anteriores:', deleteError);
        }

        // Insertar cada procedimiento
        for (const procNombre of procedimientosList) {
          const procValue = procedimientoMapping[procNombre];

          if (!procValue) {
            console.log(`⚠️ Procedimiento no mapeado: "${procNombre}"`);
            continue;
          }

          const { error: insertError } = await supabase
            .from('procedimientos')
            .insert({
              nombre: procValue,
              hospital_id: hospital.id,
              descripcion: procNombre,
            });

          if (insertError) {
            console.error(`❌ Error al insertar procedimiento ${procNombre}:`, insertError);
          } else {
            console.log(`✅ Procedimiento agregado: ${procNombre}`);
            created++;
          }
        }

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ Error en fila ${i + 1}:`, errorMsg);
        errors.push({ row: i + 1, error: errorMsg });
      }
    }

    console.log('\n=== RESUMEN ===');
    console.log(`Filas procesadas: ${processed}`);
    console.log(`Procedimientos creados: ${created}`);
    console.log(`Hospitales omitidos: ${skipped}`);
    console.log(`Errores: ${errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        created,
        skipped,
        errors: errors.length,
        error_details: errors,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error fatal:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
