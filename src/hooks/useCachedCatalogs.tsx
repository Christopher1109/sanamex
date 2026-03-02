import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Catálogos que raramente cambian - caché agresivo de 5 minutos
const CATALOG_STALE_TIME = 5 * 60 * 1000; // 5 minutos
const CATALOG_CACHE_TIME = 30 * 60 * 1000; // 30 minutos en caché

export function useCachedHospitales() {
  return useQuery({
    queryKey: ['hospitales-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hospitales')
        .select('id, nombre, display_name, budget_code, state_id')
        .order('nombre');
      if (error) throw error;
      return data || [];
    },
    staleTime: CATALOG_STALE_TIME,
    gcTime: CATALOG_CACHE_TIME,
  });
}

export function useCachedInsumosCatalogo() {
  return useQuery({
    queryKey: ['insumos-catalogo-cache'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insumos_catalogo')
        .select('id, nombre, clave, categoria, unidad, presentacion')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data || [];
    },
    staleTime: CATALOG_STALE_TIME,
    gcTime: CATALOG_CACHE_TIME,
  });
}

export function useCachedMedicos(hospitalId?: string) {
  return useQuery({
    queryKey: ['medicos-catalog', hospitalId],
    queryFn: async () => {
      let query = supabase
        .from('medicos')
        .select('id, nombre, especialidad, hospital_id')
        .eq('activo', true)
        .order('nombre');
      
      if (hospitalId) {
        query = query.eq('hospital_id', hospitalId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: CATALOG_STALE_TIME,
    gcTime: CATALOG_CACHE_TIME,
    enabled: true,
  });
}

export function useCachedAlmacenes(hospitalId?: string) {
  return useQuery({
    queryKey: ['almacenes-catalog', hospitalId],
    queryFn: async () => {
      let query = supabase
        .from('almacenes')
        .select('id, nombre, hospital_id')
        .eq('activo', true);
      
      if (hospitalId) {
        query = query.eq('hospital_id', hospitalId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: CATALOG_STALE_TIME,
    gcTime: CATALOG_CACHE_TIME,
  });
}

export function useCachedAlmacenesProvisionales(hospitalId?: string) {
  return useQuery({
    queryKey: ['almacenes-provisionales-catalog', hospitalId],
    queryFn: async () => {
      let query = supabase
        .from('almacenes_provisionales')
        .select('id, nombre, hospital_id, es_principal')
        .eq('activo', true);
      
      if (hospitalId) {
        query = query.eq('hospital_id', hospitalId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: CATALOG_STALE_TIME,
    gcTime: CATALOG_CACHE_TIME,
  });
}

export function useCachedProcedimientos(hospitalId?: string) {
  return useQuery({
    queryKey: ['procedimientos-catalog', hospitalId],
    queryFn: async () => {
      let query = supabase
        .from('hospital_procedimientos')
        .select('id, procedimiento_clave, procedimiento_nombre, hospital_id')
        .eq('activo', true);
      
      if (hospitalId) {
        query = query.eq('hospital_id', hospitalId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: CATALOG_STALE_TIME,
    gcTime: CATALOG_CACHE_TIME,
  });
}

export function useCachedTarifas(hospitalId?: string) {
  return useQuery({
    queryKey: ['tarifas-catalog', hospitalId],
    queryFn: async () => {
      let query = supabase
        .from('tarifas_procedimientos')
        .select('id, procedimiento_clave, procedimiento_nombre, tarifa_facturacion, hospital_id')
        .eq('activo', true);
      
      if (hospitalId) {
        query = query.eq('hospital_id', hospitalId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: CATALOG_STALE_TIME,
    gcTime: CATALOG_CACHE_TIME,
  });
}

// Hook para precargar todos los catálogos al inicio de la app
export function usePrefetchCatalogs() {
  useCachedHospitales();
  useCachedInsumosCatalogo();
}
