import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: importData } = await req.json();

    if (!importData) {
      throw new Error('No data provided for import');
    }

    const results: Record<string, { inserted: number; errors: string[] }> = {};

    // Orden de importación (tablas padre primero)
    const importOrder = [
      'states',
      'hospitales',
      'almacenes',
      'insumos_catalogo',
      'insumo_configuracion',
      'anestesia_insumos',
      'profiles',
      'user_roles',
      'almacenes_provisionales',
      'hospital_procedimientos',
      'medicos',
      'inventario_consolidado',
      'inventario_lotes',
      'almacen_central',
      'folios',
      'folios_insumos',
      'folios_insumos_adicionales',
      'insumos_alertas',
      'movimientos_inventario',
      'movimientos_almacen_provisional',
      'registro_actividad',
      'traspasos',
      'transferencias_central_hospital',
      'alertas_transferencia',
      'pedidos_compra',
      'pedido_items',
      'documentos_necesidades_agrupado',
      'documentos_necesidades_segmentado',
      'documento_agrupado_detalle',
      'documento_segmentado_detalle',
    ];

    for (const table of importOrder) {
      const tableData = importData[table];
      if (!tableData || tableData.length === 0) {
        results[table] = { inserted: 0, errors: [] };
        continue;
      }

      const errors: string[] = [];
      let inserted = 0;

      // Insertar en lotes de 100
      const batchSize = 100;
      for (let i = 0; i < tableData.length; i += batchSize) {
        const batch = tableData.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from(table)
          .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });

        if (error) {
          errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`);
        } else {
          inserted += batch.length;
        }
      }

      results[table] = { inserted, errors };
      console.log(`Imported ${table}: ${inserted} records, ${errors.length} errors`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        imported_at: new Date().toISOString(),
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Import error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
