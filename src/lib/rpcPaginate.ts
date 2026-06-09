import { supabase } from '@/integrations/supabase/client';

/**
 * PostgREST caps RPC responses at 1000 rows regardless of .range().
 * This helper paginates the call in PAGE_SIZE blocks until all rows are fetched.
 */
export async function rpcPaginate<T = any>(
  fnName: string,
  params: Record<string, any>,
  opts: { pageSize?: number; maxRows?: number; onProgress?: (loaded: number) => void } = {}
): Promise<T[]> {
  const PAGE_SIZE = opts.pageSize ?? 1000;
  const MAX = opts.maxRows ?? 20000;
  let all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .rpc(fnName, params)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    opts.onProgress?.(all.length);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (offset >= MAX) {
      console.warn(`[rpcPaginate] ${fnName}: límite de ${MAX} filas alcanzado`);
      break;
    }
  }
  return all;
}
