import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InsumoBase {
  nombre: string;
  clave?: string;
  descripcion?: string;
  categoria?: string;
  unidad?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🏥 Iniciando setup de almacenes e inventarios...');

    // 1. Obtener todos los hospitales
    const { data: hospitales, error: hospitalError } = await supabase
      .from('hospitales')
      .select('*')
      .order('nombre');

    if (hospitalError) {
      throw new Error(`Error al obtener hospitales: ${hospitalError.message}`);
    }

    console.log(`✅ Encontrados ${hospitales.length} hospitales`);

    // 2. Obtener insumos únicos de la tabla actual (sin duplicados)
    const { data: insumosExistentes, error: insumosError } = await supabase
      .from('insumos')
      .select('nombre, clave, descripcion')
      .order('nombre');

    if (insumosError) {
      throw new Error(`Error al obtener insumos: ${insumosError.message}`);
    }

    // Eliminar duplicados por nombre
    const insumosUnicos = Array.from(
      new Map(insumosExistentes.map((i: InsumoBase) => [i.nombre, i])).values()
    );

    console.log(`✅ Encontrados ${insumosUnicos.length} insumos únicos`);

    // 3. Poblar catálogo maestro de insumos
    const catalogoInsumos = [];
    for (const insumo of insumosUnicos) {
      const { data: existente } = await supabase
        .from('insumos_catalogo')
        .select('id')
        .eq('nombre', insumo.nombre)
        .maybeSingle();

      if (!existente) {
        const { data: nuevo, error: createError } = await supabase
          .from('insumos_catalogo')
          .insert({
            nombre: insumo.nombre,
            clave: insumo.clave,
            descripcion: insumo.descripcion,
            categoria: 'Material médico',
            unidad: 'pieza',
            activo: true
          })
          .select()
          .single();

        if (createError) {
          console.error(`Error creando insumo ${insumo.nombre}:`, createError);
        } else {
          catalogoInsumos.push(nuevo);
        }
      } else {
        catalogoInsumos.push(existente);
      }
    }

    console.log(`✅ Catálogo con ${catalogoInsumos.length} insumos`);

    // 4. Crear almacenes y poblar inventario por hospital
    const stats = {
      almacenesCreados: 0,
      inventariosCreados: 0,
      hospitales: [] as any[]
    };

    for (let i = 0; i < hospitales.length; i++) {
      const hospital = hospitales[i];
      
      console.log(`\n🏥 Procesando hospital: ${hospital.nombre || hospital.display_name}`);

      // Crear almacén si no existe
      const { data: almacenExistente } = await supabase
        .from('almacenes')
        .select('*')
        .eq('hospital_id', hospital.id)
        .maybeSingle();

      let almacen;
      if (!almacenExistente) {
        const { data: nuevoAlmacen, error: almacenError } = await supabase
          .from('almacenes')
          .insert({
            hospital_id: hospital.id,
            nombre: `Almacén ${hospital.nombre || hospital.display_name}`,
            descripcion: `Almacén principal del ${hospital.nombre || hospital.display_name}`,
            ubicacion: 'Almacén general',
            activo: true
          })
          .select()
          .single();

        if (almacenError) {
          console.error(`Error creando almacén: ${almacenError.message}`);
          continue;
        }

        almacen = nuevoAlmacen;
        stats.almacenesCreados++;
        console.log(`✅ Almacén creado`);
      } else {
        almacen = almacenExistente;
        console.log(`ℹ️ Almacén ya existe`);
      }

      // Definir rangos de cantidad por hospital (aleatorio)
      const rangos = [
        { min: 80, max: 120 },  // Hospital 0
        { min: 40, max: 70 },   // Hospital 1
        { min: 20, max: 40 },   // Hospital 2
        { min: 10, max: 25 },   // Hospital 3
      ];
      
      const rangoIndex = i % rangos.length;
      const rango = rangos[rangoIndex];

      // Obtener insumos del catálogo
      const { data: catalogoCompleto } = await supabase
        .from('insumos_catalogo')
        .select('*');

      let inventariosHospital = 0;

      // Crear inventario para cada insumo
      for (const insumo of catalogoCompleto || []) {
        // Generar cantidad aleatoria en el rango
        const cantidad = Math.floor(Math.random() * (rango.max - rango.min + 1)) + rango.min;
        
        // Generar fecha de caducidad aleatoria entre 2025-2028
        const year = 2025 + Math.floor(Math.random() * 4);
        const month = Math.floor(Math.random() * 12) + 1;
        const day = Math.floor(Math.random() * 28) + 1;
        const fechaCaducidad = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // Generar lote aleatorio
        const lote = `LOTE-${hospital.budget_code || 'XXX'}-${Math.floor(Math.random() * 10000)}`;

        const { data: inventarioExistente } = await supabase
          .from('inventario_hospital')
          .select('id')
          .eq('almacen_id', almacen.id)
          .eq('insumo_catalogo_id', insumo.id)
          .eq('lote', lote)
          .maybeSingle();

        if (!inventarioExistente) {
          const { error: invError } = await supabase
            .from('inventario_hospital')
            .insert({
              almacen_id: almacen.id,
              insumo_catalogo_id: insumo.id,
              hospital_id: hospital.id,
              lote: lote,
              fecha_caducidad: fechaCaducidad,
              cantidad_inicial: cantidad,
              cantidad_actual: cantidad,
              ubicacion: 'Almacén general',
              estatus: 'activo'
            });

          if (!invError) {
            inventariosHospital++;
            stats.inventariosCreados++;
          }
        }
      }

      stats.hospitales.push({
        nombre: hospital.nombre || hospital.display_name,
        almacen: almacen.nombre,
        insumos: inventariosHospital,
        rangoStock: `${rango.min}-${rango.max} unidades`
      });

      console.log(`✅ ${inventariosHospital} insumos agregados al inventario`);
    }

    console.log('\n🎉 Setup completado exitosamente!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Almacenes e inventarios configurados correctamente',
        stats: stats
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
