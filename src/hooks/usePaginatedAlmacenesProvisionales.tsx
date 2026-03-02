import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;
const STALE_TIME = 30000; // 30 segundos
const CACHE_TIME = 5 * 60 * 1000; // 5 minutos

interface AlmacenProvisional {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  es_principal: boolean;
}

interface InventarioProvisional {
  id: string;
  almacen_provisional_id: string;
  insumo_catalogo_id: string;
  cantidad_disponible: number;
  insumo?: { id: string; nombre: string; clave: string };
}

// Hook para almacenes provisionales con caché
export function useAlmacenesProvisionales(hospitalId: string | undefined) {
  return useQuery({
    queryKey: ['almacenes-provisionales', hospitalId],
    queryFn: async () => {
      if (!hospitalId) return [];
      
      const { data, error } = await supabase
        .from('almacenes_provisionales')
        .select('*')
        .eq('hospital_id', hospitalId)
        .eq('activo', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as AlmacenProvisional[];
    },
    enabled: !!hospitalId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
  });
}

// Hook para inventario provisional paginado - carga todos y filtra client-side
export function usePaginatedInventarioProvisional(almacenId: string | undefined, searchTerm: string = '') {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const queryClient = useQueryClient();

  // Cargar TODOS los datos del inventario provisional (incluyendo cantidad 0 para mostrar "Agotado")
  const dataQuery = useQuery({
    queryKey: ['inventario-provisional-all', almacenId],
    queryFn: async () => {
      if (!almacenId) return [];
      
      const { data, error } = await supabase
        .from('almacen_provisional_inventario')
        .select(`
          *,
          insumo:insumos_catalogo(id, nombre, clave)
        `)
        .eq('almacen_provisional_id', almacenId)
        .gte('cantidad_disponible', 0); // Incluir cantidad 0 para mostrar "Agotado"

      if (error) throw error;
      return (data || []) as InventarioProvisional[];
    },
    enabled: !!almacenId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
  });

  // Filtrado 100% client-side - busca en TODOS los datos
  const filteredData = (() => {
    let result = dataQuery.data || [];
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase().trim();
      const searchSinPuntos = search.replace(/\./g, '');
      
      result = result.filter(item => {
        const nombre = item.insumo?.nombre?.toLowerCase() || '';
        const clave = item.insumo?.clave?.toLowerCase() || '';
        const claveSinPuntos = clave.replace(/\./g, '');
        
        return nombre.includes(search) || 
               clave.includes(search) || 
               claveSinPuntos.includes(searchSinPuntos);
      });
    }
    
    return result;
  })();

  // Paginación sobre datos filtrados
  const totalCount = filteredData.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  
  const paginatedData = (() => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    return filteredData.slice(from, to);
  })();

  const goToPage = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= Math.max(totalPages, 1)) {
      setPage(newPage);
    }
  }, [totalPages]);

  const nextPage = useCallback(() => goToPage(page + 1), [page, goToPage]);
  const previousPage = useCallback(() => goToPage(page - 1), [page, goToPage]);

  const changePageSize = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['inventario-provisional-all', almacenId] });
  }, [queryClient, almacenId]);

  // Reset page cuando cambia búsqueda
  const resetPage = useCallback(() => setPage(1), []);

  // Saber si el almacén tiene datos (sin filtrar) para distinguir "vacío" vs "sin resultados"
  const hasAnyData = (dataQuery.data || []).length > 0;

  return {
    data: paginatedData,
    allData: filteredData,
    rawData: dataQuery.data || [], // Datos sin filtrar para saber si realmente hay inventario
    hasAnyData, // TRUE si el almacén tiene insumos (aunque filtrados sean 0)
    isLoading: dataQuery.isLoading,
    error: dataQuery.error,
    page,
    pageSize,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    goToPage,
    nextPage,
    previousPage,
    changePageSize,
    refetch,
    resetPage,
  };
}

// Hook para inventario general paginado (para traspasos) - carga todos y filtra client-side
export function usePaginatedInventarioGeneral(hospitalId: string | undefined, searchTerm: string = '') {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const queryClient = useQueryClient();

  // Cargar TODOS los datos del inventario general
  const dataQuery = useQuery({
    queryKey: ['inventario-general-all', hospitalId],
    queryFn: async () => {
      if (!hospitalId) return [];
      
      const { data, error } = await supabase
        .from('inventario_consolidado')
        .select(`
          id,
          insumo_catalogo_id,
          cantidad_total,
          insumo:insumos_catalogo(id, nombre, clave)
        `)
        .eq('hospital_id', hospitalId)
        .gt('cantidad_total', 0)
        .order('insumo_catalogo_id');

      if (error) throw error;
      
      return (data || []).map(item => ({
        id: item.id,
        insumo_catalogo_id: item.insumo_catalogo_id,
        cantidad_actual: item.cantidad_total,
        insumo: item.insumo
      }));
    },
    enabled: !!hospitalId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
  });

  // Filtrado 100% client-side - busca en TODOS los datos
  const filteredData = (() => {
    let result = dataQuery.data || [];
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase().trim();
      const searchSinPuntos = search.replace(/\./g, '');
      
      result = result.filter(item => {
        const nombre = item.insumo?.nombre?.toLowerCase() || '';
        const clave = item.insumo?.clave?.toLowerCase() || '';
        const claveSinPuntos = clave.replace(/\./g, '');
        
        return nombre.includes(search) || 
               clave.includes(search) || 
               claveSinPuntos.includes(searchSinPuntos);
      });
    }
    
    return result;
  })();

  // Paginación sobre datos filtrados
  const totalCount = filteredData.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  
  const paginatedData = (() => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    return filteredData.slice(from, to);
  })();

  const goToPage = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= Math.max(totalPages, 1)) {
      setPage(newPage);
    }
  }, [totalPages]);

  const nextPage = useCallback(() => goToPage(page + 1), [page, goToPage]);
  const previousPage = useCallback(() => goToPage(page - 1), [page, goToPage]);

  const changePageSize = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['inventario-general-all', hospitalId] });
  }, [queryClient, hospitalId]);

  // Reset page cuando cambia búsqueda
  const resetPage = useCallback(() => setPage(1), []);

  return {
    data: paginatedData,
    allData: filteredData,
    isLoading: dataQuery.isLoading,
    error: dataQuery.error,
    page,
    pageSize,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    goToPage,
    nextPage,
    previousPage,
    changePageSize,
    refetch,
    resetPage,
  };
}
