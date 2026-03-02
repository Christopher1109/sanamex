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

    const body = await req.json();
    const { hospital_id, tipo_anestesia, anestesia_principal, anestesia_secundaria } = body;

    console.log('=== VALIDANDO TIPO DE ANESTESIA ===');
    console.log('Hospital ID:', hospital_id);
    console.log('Tipo Anestesia:', tipo_anestesia);

    if (!hospital_id) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'Hospital ID es requerido',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Si es anestesia mixta, validar ambos tipos
    if (tipo_anestesia === 'anestesia_mixta') {
      if (!anestesia_principal || !anestesia_secundaria) {
        return new Response(
          JSON.stringify({
            valid: false,
            error: 'Para anestesia mixta se requieren ambos tipos de anestesia',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Validar que ambos tipos existan para el hospital en hospital_procedimientos
      const { data: procedimientos, error } = await supabase
        .from('hospital_procedimientos')
        .select('procedimiento_clave, procedimiento_nombre')
        .eq('hospital_id', hospital_id)
        .eq('activo', true)
        .in('procedimiento_clave', [anestesia_principal, anestesia_secundaria]);

      if (error) throw error;

      if (!procedimientos || procedimientos.length !== 2) {
        const faltantes = [];
        if (!procedimientos?.find(p => p.procedimiento_clave === anestesia_principal)) {
          faltantes.push(anestesia_principal);
        }
        if (!procedimientos?.find(p => p.procedimiento_clave === anestesia_secundaria)) {
          faltantes.push(anestesia_secundaria);
        }

        return new Response(
          JSON.stringify({
            valid: false,
            error: `Los siguientes tipos de anestesia no están disponibles para este hospital: ${faltantes.join(', ')}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      console.log('✅ Anestesia mixta válida');
      return new Response(
        JSON.stringify({
          valid: true,
          message: 'Tipo de anestesia válido para el hospital',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validar tipo de anestesia simple - buscar por clave en hospital_procedimientos
    const { data: procedimientos, error } = await supabase
      .from('hospital_procedimientos')
      .select('procedimiento_clave, procedimiento_nombre')
      .eq('hospital_id', hospital_id)
      .eq('activo', true)
      .eq('procedimiento_clave', tipo_anestesia)
      .limit(1);

    if (error) throw error;

    if (!procedimientos || procedimientos.length === 0) {
      console.log('❌ Tipo de anestesia NO válido para este hospital');
      return new Response(
        JSON.stringify({
          valid: false,
          error: `El tipo de anestesia "${tipo_anestesia}" no está disponible para este hospital`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('✅ Tipo de anestesia válido:', procedimientos[0].procedimiento_nombre);
    return new Response(
      JSON.stringify({
        valid: true,
        message: 'Tipo de anestesia válido para el hospital',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error fatal:', error);
    return new Response(
      JSON.stringify({
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
