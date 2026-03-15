import { vi } from "vitest";

type QueryResponse = { data: unknown; error: unknown };

/**
 * Chainable Supabase query mock builder.
 *
 * Usage:
 *   const supabase = createMockSupabase({
 *     eckcm_refunds: {
 *       select: { data: [...], error: null },
 *       insert: { data: { id: "r1" }, error: null },
 *     },
 *   });
 */
export function createMockSupabase(
  tableResponses: Record<string, Record<string, QueryResponse>> = {}
) {
  function createChain(tableName: string) {
    const responses = tableResponses[tableName] ?? {};

    // Track the last operation (select/insert/update/delete) to determine response
    let lastOp = "select";

    const chain: Record<string, ReturnType<typeof vi.fn>> = {};

    // Operation starters — set lastOp
    for (const op of ["select", "insert", "update", "delete"] as const) {
      chain[op] = vi.fn((..._args: unknown[]) => {
        lastOp = op;
        return makeTerminal();
      });
    }

    function makeTerminal() {
      const terminal: Record<string, ReturnType<typeof vi.fn>> = {};

      // Filter/modifier methods — return self
      for (const m of [
        "eq", "neq", "in", "gt", "lt", "gte", "lte",
        "ilike", "like", "is", "order", "limit", "range",
        "not", "or", "match", "filter",
      ] as const) {
        terminal[m] = vi.fn(() => terminal);
      }

      // Re-chain select/insert after modifiers (e.g. .delete().eq().select())
      terminal.select = vi.fn((..._args: unknown[]) => {
        lastOp = "select";
        return terminal;
      });

      // Terminal methods — return response
      terminal.single = vi.fn(() => {
        return responses[lastOp] ?? responses.select ?? { data: null, error: null };
      });
      terminal.maybeSingle = vi.fn(() => {
        return responses[lastOp] ?? responses.select ?? { data: null, error: null };
      });

      // If called without .single(), return the response directly via .then()
      // This makes `await supabase.from("t").select("*").eq(...)` work
      const defaultResponse = () =>
        responses[lastOp] ?? responses.select ?? { data: [], error: null };

      terminal.then = vi.fn((resolve: (val: unknown) => void) => {
        resolve(defaultResponse());
      });

      // Allow direct destructuring: const { data, error } = await ...
      Object.defineProperty(terminal, Symbol.iterator, {
        value: function* () {
          const resp = defaultResponse();
          yield resp;
        },
      });

      return terminal;
    }

    return chain;
  }

  return {
    from: vi.fn((table: string) => createChain(table)),
    auth: {
      getUser: vi.fn(() => ({ data: { user: null }, error: null })),
    },
    rpc: vi.fn(() => ({ data: null, error: null })),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

/**
 * Create a mock Supabase client with per-call response sequences.
 * Each from(table).method() call pops the next response from the queue.
 */
export function createSequentialMockSupabase(
  callSequence: Array<{ table: string; op: string; response: QueryResponse }>
) {
  const queue = [...callSequence];

  function createChain(tableName: string) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    let currentOp = "select";

    for (const op of ["select", "insert", "update", "delete"] as const) {
      chain[op] = vi.fn((..._args: unknown[]) => {
        currentOp = op;
        return makeTerminal();
      });
    }

    function findResponse() {
      const idx = queue.findIndex(
        (q) => q.table === tableName && q.op === currentOp
      );
      if (idx !== -1) {
        return queue.splice(idx, 1)[0].response;
      }
      return { data: null, error: null };
    }

    function makeTerminal() {
      const terminal: Record<string, ReturnType<typeof vi.fn>> = {};

      for (const m of [
        "eq", "neq", "in", "gt", "lt", "gte", "lte",
        "ilike", "like", "is", "order", "limit", "range",
        "not", "or", "match", "filter",
      ] as const) {
        terminal[m] = vi.fn(() => terminal);
      }

      terminal.select = vi.fn((..._args: unknown[]) => {
        currentOp = "select";
        return terminal;
      });

      terminal.single = vi.fn(() => findResponse());
      terminal.maybeSingle = vi.fn(() => findResponse());

      terminal.then = vi.fn((resolve: (val: unknown) => void) => {
        resolve(findResponse());
      });

      return terminal;
    }

    return chain;
  }

  return {
    from: vi.fn((table: string) => createChain(table)),
    auth: {
      getUser: vi.fn(() => ({ data: { user: null }, error: null })),
    },
    rpc: vi.fn(() => ({ data: null, error: null })),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}
