import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Tiny helper to prevent "silent" Supabase failures.
 * Use it after every insert/update/delete/rpc call.
 */
export function assertSupabaseOk<T>(
  result: { data: T; error: PostgrestError | null },
  context: string
): T {
  if (result.error) {
    // Keep logs consistent for fast debugging.
    // eslint-disable-next-line no-console
    console.error(`[SUPABASE ERROR] ${context}`, result.error);
    throw result.error;
  }
  return result.data;
}

export function collectSupabaseErrors(
  results: Array<{ error: PostgrestError | null }>,
  context: string
): void {
  const first = results.find(r => r.error)?.error;
  if (first) {
    // eslint-disable-next-line no-console
    console.error(`[SUPABASE ERROR] ${context}`, first);
    throw first;
  }
}
