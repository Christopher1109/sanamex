import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PaginationConfig {
  pageSize?: number;
  initialPage?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  goToPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  refetch: () => void;
}

interface QueryOptions {
  select?: string;
  filters?: Record<string, unknown>;
  orderBy?: { column: string; ascending?: boolean };
  enabled?: boolean;
}

export function usePaginatedFolios(
  hospitalBudgetCode: string | undefined,
  config: PaginationConfig = {}
): PaginatedResult<any> {
  const { pageSize = 50, initialPage = 1 } = config;
  const [page, setPage] = useState(initialPage);
  const queryClient = useQueryClient();

  const countQuery = useQuery({
    queryKey: ['folios-count', hospitalBudgetCode],
    queryFn: async () => {
      if (!hospitalBudgetCode) return 0;
      const { count, error } = await supabase
        .from('folios')
        .select('*', { count: 'exact', head: true })
        .eq('hospital_budget_code', hospitalBudgetCode);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!hospitalBudgetCode,
    staleTime: 30000,
  });

  const dataQuery = useQuery({
    queryKey: ['folios-paginated', hospitalBudgetCode, page, pageSize],
    queryFn: async () => {
      if (!hospitalBudgetCode) return [];
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from('folios')
        .select('*')
        .eq('hospital_budget_code', hospitalBudgetCode)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return data || [];
    },
    enabled: !!hospitalBudgetCode,
    staleTime: 10000,
  });

  const totalCount = countQuery.data || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const goToPage = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= Math.max(totalPages, 1)) {
      setPage(newPage);
    }
  }, [totalPages]);

  const nextPage = useCallback(() => {
    goToPage(page + 1);
  }, [page, goToPage]);

  const previousPage = useCallback(() => {
    goToPage(page - 1);
  }, [page, goToPage]);

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['folios-count', hospitalBudgetCode] });
    queryClient.invalidateQueries({ queryKey: ['folios-paginated', hospitalBudgetCode] });
  }, [queryClient, hospitalBudgetCode]);

  return {
    data: dataQuery.data || [],
    isLoading: dataQuery.isLoading || countQuery.isLoading,
    error: dataQuery.error || countQuery.error,
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    goToPage,
    nextPage,
    previousPage,
    refetch,
  };
}
