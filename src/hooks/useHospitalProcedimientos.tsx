import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface HospitalProcedimiento {
  id: string;
  procedimiento_clave: string;
  procedimiento_nombre: string;
  hospital_id: string;
}

export function useHospitalProcedimientos(hospitalId?: string) {
  return useQuery({
    queryKey: ['hospital-procedimientos', hospitalId],
    queryFn: async () => {
      if (!hospitalId) return [];
      
      const { data, error } = await supabase
        .from('hospital_procedimientos')
        .select('id, procedimiento_clave, procedimiento_nombre, hospital_id')
        .eq('hospital_id', hospitalId)
        .eq('activo', true)
        .order('procedimiento_clave');
      
      if (error) throw error;
      return data as HospitalProcedimiento[];
    },
    enabled: !!hospitalId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useInsumosPorProcedimiento(procedimientoClave?: string) {
  return useQuery({
    queryKey: ['insumos-por-procedimiento', procedimientoClave],
    queryFn: async () => {
      if (!procedimientoClave) return [];
      
      const { data, error } = await supabase
        .from('procedimiento_insumos_catalogo')
        .select('insumo_catalogo_id, cantidad_sugerida')
        .eq('procedimiento_clave', procedimientoClave)
        .eq('activo', true);
      
      if (error) throw error;
      return data.map(d => d.insumo_catalogo_id);
    },
    enabled: !!procedimientoClave,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
