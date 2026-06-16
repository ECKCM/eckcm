/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Run a PostgREST `.in(column, ids)` filter in chunks and merge the rows.
 *
 * PostgREST encodes every id of an `.in()` filter into the request URL. A few
 * hundred UUIDs overflow the URL and the request fails outright — "TypeError:
 * fetch failed" or a 400 Bad Request — rather than returning data. Event-wide id
 * lists (registrations, memberships) on the active event already exceed this, so
 * any such filter must be split into chunks and the rows merged.
 *
 * Chunking by id also keeps every chunk's result under PostgREST's default
 * 1000-row response cap. When `order` is given it is applied per chunk; callers
 * that merge "first row per group" must chunk on that grouping key so all of a
 * group's rows land in the same (ordered) chunk.
 *
 * Returns merged rows plus the first chunk error encountered (if any). `data` is
 * always an array, never null.
 */
export async function chunkedIn<T = any>(
  client: SupabaseClient,
  table: string,
  select: string,
  column: string,
  ids: string[],
  opts?: { chunkSize?: number; order?: { column: string; ascending?: boolean } }
): Promise<{ data: T[]; error: { message: string } | null }> {
  if (ids.length === 0) return { data: [], error: null };

  const chunkSize = opts?.chunkSize ?? 100;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  const parts = await Promise.all(
    chunks.map((c) => {
      let q: any = client.from(table).select(select).in(column, c);
      if (opts?.order) {
        q = q.order(opts.order.column, { ascending: opts.order.ascending ?? true });
      }
      return q;
    })
  );

  const error = parts.find((p) => p.error)?.error ?? null;
  return { data: parts.flatMap((p) => (p.data ?? []) as T[]), error };
}
