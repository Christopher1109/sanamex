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

    const exportData: Record<string, any[]> = {};

    // 1. States
    const { data: states } = await supabase.from('states').select('*');
    exportData.states = states || [];

    // 2. Hospitales
    const { data: hospitales } = await supabase.from('hospitales').select('*');
    exportData.hospitales = hospitales || [];

    // 3. Almacenes
    const { data: almacenes } = await supabase.from('almacenes').select('*');
    exportData.almacenes = almacenes || [];

    // 4. Insumos Catálogo
    const { data: insumosCatalogo } = await supabase.from('insumos_catalogo').select('*');
    exportData.insumos_catalogo = insumosCatalogo || [];

    // 5. Insumo Configuración
    const { data: insumoConfig } = await supabase.from('insumo_configuracion').select('*');
    exportData.insumo_configuracion = insumoConfig || [];

    // 6. Anestesia Insumos
    const { data: anestesiaInsumos } = await supabase.from('anestesia_insumos').select('*');
    exportData.anestesia_insumos = anestesiaInsumos || [];

    // 7. Profiles
    const { data: profiles } = await supabase.from('profiles').select('*');
    exportData.profiles = profiles || [];

    // 8. User Roles
    const { data: userRoles } = await supabase.from('user_roles').select('*');
    exportData.user_roles = userRoles || [];

    // 9. Inventario Consolidado (grande)
    const { data: invConsolidado } = await supabase.from('inventario_consolidado').select('*');
    exportData.inventario_consolidado = invConsolidado || [];

    // 10. Inventario Lotes (muy grande)
    const { data: invLotes } = await supabase.from('inventario_lotes').select('*');
    exportData.inventario_lotes = invLotes || [];

    // 11. Almacenes Provisionales
    const { data: almacenesProvisionales } = await supabase.from('almacenes_provisionales').select('*');
    exportData.almacenes_provisionales = almacenesProvisionales || [];

    // 12. Hospital Procedimientos
    const { data: hospitalProc } = await supabase.from('hospital_procedimientos').select('*');
    exportData.hospital_procedimientos = hospitalProc || [];

    // 13. Medicos
    const { data: medicos } = await supabase.from('medicos').select('*');
    exportData.medicos = medicos || [];

    // 14. Folios (importante)
    const { data: folios } = await supabase.from('folios').select('*');
    exportData.folios = folios || [];

    // 15. Folios Insumos
    const { data: foliosInsumos } = await supabase.from('folios_insumos').select('*');
    exportData.folios_insumos = foliosInsumos || [];

    // 16. Folios Insumos Adicionales
    const { data: foliosInsumosAdicionales } = await supabase.from('folios_insumos_adicionales').select('*');
    exportData.folios_insumos_adicionales = foliosInsumosAdicionales || [];

    // 17. Insumos Alertas
    const { data: insumosAlertas } = await supabase.from('insumos_alertas').select('*');
    exportData.insumos_alertas = insumosAlertas || [];

    // 18. Movimientos Inventario
    const { data: movimientos } = await supabase.from('movimientos_inventario').select('*');
    exportData.movimientos_inventario = movimientos || [];

    // 19. Movimientos Almacen Provisional
    const { data: movimientosProvisional } = await supabase.from('movimientos_almacen_provisional').select('*');
    exportData.movimientos_almacen_provisional = movimientosProvisional || [];

    // 20. Registro Actividad
    const { data: registroActividad } = await supabase.from('registro_actividad').select('*');
    exportData.registro_actividad = registroActividad || [];

    // 21. Traspasos
    const { data: traspasos } = await supabase.from('traspasos').select('*');
    exportData.traspasos = traspasos || [];

    // 22. Almacen Central
    const { data: almacenCentral } = await supabase.from('almacen_central').select('*');
    exportData.almacen_central = almacenCentral || [];

    // 23. Transferencias Central Hospital
    const { data: transferencias } = await supabase.from('transferencias_central_hospital').select('*');
    exportData.transferencias_central_hospital = transferencias || [];

    // 24. Alertas Transferencia
    const { data: alertasTransferencia } = await supabase.from('alertas_transferencia').select('*');
    exportData.alertas_transferencia = alertasTransferencia || [];

    // 25. Pedidos Compra
    const { data: pedidosCompra } = await supabase.from('pedidos_compra').select('*');
    exportData.pedidos_compra = pedidosCompra || [];

    // 26. Pedido Items
    const { data: pedidoItems } = await supabase.from('pedido_items').select('*');
    exportData.pedido_items = pedidoItems || [];

    // 27. Documentos necesidades
    const { data: docAgrupado } = await supabase.from('documentos_necesidades_agrupado').select('*');
    exportData.documentos_necesidades_agrupado = docAgrupado || [];

    const { data: docSegmentado } = await supabase.from('documentos_necesidades_segmentado').select('*');
    exportData.documentos_necesidades_segmentado = docSegmentado || [];

    const { data: detalleAgrupado } = await supabase.from('documento_agrupado_detalle').select('*');
    exportData.documento_agrupado_detalle = detalleAgrupado || [];

    const { data: detalleSegmentado } = await supabase.from('documento_segmentado_detalle').select('*');
    exportData.documento_segmentado_detalle = detalleSegmentado || [];

    // Generar estadísticas
    const stats: Record<string, number> = {};
    for (const [table, data] of Object.entries(exportData)) {
      stats[table] = data.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        exported_at: new Date().toISOString(),
        stats,
        data: exportData
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="database_export.json"'
        }
      }
    );

  } catch (error: unknown) {
    console.error('Export error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
