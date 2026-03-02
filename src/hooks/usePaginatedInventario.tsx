import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;
const STALE_TIME = 5 * 60 * 1000; // 5 minutos - datos más estables
const CACHE_TIME = 30 * 60 * 1000; // 30 minutos

interface InventarioConsolidado {
  id: string;
  hospital_id: string;
  almacen_id: string;
  insumo_catalogo_id: string;
  cantidad_total: number;
  cantidad_minima: number;
  insumos_catalogo: {
    id: string;
    nombre: string;
    clave: string;
    descripcion: string;
    categoria: string;
    unidad: string;
    presentacion: string;
    tipo: string;
  };
}

interface InventarioLote {
  id: string;
  consolidado_id: string;
  lote: string | null;
  fecha_caducidad: string | null;
  fecha_entrada: string;
  cantidad: number;
  ubicacion: string;
}

interface UsePaginatedInventarioOptions {
  hospitalId: string | undefined;
  almacenId: string | undefined;
  searchTerm?: string;
  filterStockBajo?: boolean;
  filterProximosCaducar?: boolean;
  filterTipo?: 'todos' | 'insumo' | 'medicamento';
  filterProcedimientoInsumos?: string[]; // IDs de insumos del procedimiento seleccionado
}

export function usePaginatedInventario({
  hospitalId,
  almacenId,
  searchTerm = '',
  filterStockBajo = false,
  filterProximosCaducar = false,
  filterTipo = 'todos',
  filterProcedimientoInsumos
}: UsePaginatedInventarioOptions) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const queryClient = useQueryClient();

  // Query para TODOS los datos del inventario - se carga una sola vez y se filtra en cliente
  // Similar a EdicionMasivaMínimos que carga todo el catálogo y filtra instantáneamente
  const dataQuery = useQuery({
    queryKey: ['inventario-all', hospitalId, almacenId],
    queryFn: async () => {
      if (!hospitalId || !almacenId) return [];
      
      const { data, error } = await supabase
        .from('inventario_consolidado')
        .select(`
          *,
          insumos_catalogo (
            id,
            nombre,
            clave,
            descripcion,
            categoria,
            unidad,
            presentacion,
            tipo
          )
        `)
        .eq('almacen_id', almacenId)
        .gt('cantidad_total', 0)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as InventarioConsolidado[];
    },
    enabled: !!hospitalId && !!almacenId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
  });

  // Filtrado 100% client-side - instantáneo como EdicionMasivaMínimos
  const filteredData = useMemo(() => {
    let result = dataQuery.data || [];
    
    // Filtro por procedimiento (prioridad alta - filtra por IDs de insumos del procedimiento)
    if (filterProcedimientoInsumos && filterProcedimientoInsumos.length > 0) {
      result = result.filter(item => 
        filterProcedimientoInsumos.includes(item.insumo_catalogo_id)
      );
    }
    
    // Búsqueda por nombre o clave (con y sin puntos)
    const search = searchTerm.toLowerCase().trim();
    if (search) {
      const searchSinPuntos = search.replace(/\./g, '');
      result = result.filter(item => {
        const nombre = item.insumos_catalogo?.nombre?.toLowerCase() || '';
        const clave = item.insumos_catalogo?.clave?.toLowerCase() || '';
        const claveSinPuntos = clave.replace(/\./g, '');
        
        return nombre.includes(search) || 
               clave.includes(search) || 
               claveSinPuntos.includes(searchSinPuntos);
      });
    }

    // Filtro de stock bajo
    if (filterStockBajo) {
      result = result.filter(item => item.cantidad_total < (item.cantidad_minima || 10));
    }

    // Filtro de tipo
    if (filterTipo !== 'todos') {
      result = result.filter(item => item.insumos_catalogo?.tipo === filterTipo);
    }

    return result;
  }, [dataQuery.data, searchTerm, filterStockBajo, filterTipo, filterProcedimientoInsumos]);

  // Paginación sobre datos filtrados
  const totalCount = filteredData.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  
  const paginatedData = useMemo(() => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    return filteredData.slice(from, to);
  }, [filteredData, page, pageSize]);

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
    queryClient.invalidateQueries({ queryKey: ['inventario-all', hospitalId] });
  }, [queryClient, hospitalId]);

  // Reset page cuando cambian filtros
  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  return {
    data: paginatedData,
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

// Lazy loading de lotes - solo cuando se necesitan
export function useInventarioLotes(consolidadoIds: string[], enabled: boolean = true) {
  return useQuery({
    queryKey: ['inventario-lotes', consolidadoIds],
    queryFn: async () => {
      if (consolidadoIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('inventario_lotes')
        .select('*')
        .in('consolidado_id', consolidadoIds)
        .gt('cantidad', 0)
        .order('fecha_entrada', { ascending: true });

      if (error) throw error;
      return (data || []) as InventarioLote[];
    },
    enabled: enabled && consolidadoIds.length > 0,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
  });
}

// Hook para estadísticas rápidas del inventario
export function useInventarioStats(hospitalId: string | undefined, almacenId: string | undefined) {
  return useQuery({
    queryKey: ['inventario-stats', hospitalId, almacenId],
    queryFn: async () => {
      if (!hospitalId || !almacenId) return { total: 0, stockBajo: 0, proximosVencer: 0 };
      
      // Total items
      const { count: total } = await supabase
        .from('inventario_consolidado')
        .select('id', { count: 'exact', head: true })
        .eq('almacen_id', almacenId)
        .gt('cantidad_total', 0);

      // Stock bajo (cantidad < minima)
      const { data: stockBajoData } = await supabase
        .from('inventario_consolidado')
        .select('id')
        .eq('almacen_id', almacenId)
        .gt('cantidad_total', 0)
        .lt('cantidad_total', 10);

      // Próximos a vencer (dentro de 60 días)
      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() + 60);
      
      const { data: proximosData } = await supabase
        .from('inventario_lotes')
        .select('consolidado_id')
        .lte('fecha_caducidad', fechaLimite.toISOString())
        .gte('fecha_caducidad', new Date().toISOString())
        .gt('cantidad', 0);

      return {
        total: total || 0,
        stockBajo: stockBajoData?.length || 0,
        proximosVencer: new Set(proximosData?.map(l => l.consolidado_id)).size
      };
    },
    enabled: !!hospitalId && !!almacenId,
    staleTime: 60000, // 1 minuto
    gcTime: CACHE_TIME,
  });
}
