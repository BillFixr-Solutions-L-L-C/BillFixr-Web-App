import { vi } from "vitest";

type QueryResult = { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null };

const CHAIN_METHODS = [
  "select",
  "eq",
  "neq",
  "in",
  "or",
  "order",
  "limit",
  "update",
  "delete",
  "insert",
  "single",
  "lt",
  "lte",
  "gt",
  "gte",
  "ilike",
  "like",
  "is",
];

function createQueryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (
    onFulfilled?: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

/**
 * Minimal fake Supabase client for route-handler unit tests. Each table
 * gets a queue of canned results — `.from(table)` in the code under test
 * consumes them in call order, so a route that does e.g. a select then a
 * later update on the same table gets the right result for each.
 */
export function createSupabaseMock() {
  const queues = new Map<string, QueryResult[]>();

  const from = vi.fn((table: string) => {
    const queue = queues.get(table);
    const result = queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
    return createQueryBuilder(result);
  });

  function queueResult(table: string, result: QueryResult) {
    const queue = queues.get(table) ?? [];
    queue.push(result);
    queues.set(table, queue);
  }

  const getUser = vi.fn();
  const rpc = vi.fn();
  const deleteUser = vi.fn();
  const inviteUserByEmail = vi.fn();
  const verifyOtp = vi.fn();
  const getUserById = vi.fn();
  const generateLink = vi.fn();

  const client = {
    auth: {
      getUser,
      verifyOtp,
      admin: { deleteUser, inviteUserByEmail, getUserById, generateLink },
    },
    from,
    rpc,
  };

  return {
    client,
    queueResult,
    getUser,
    rpc,
    deleteUser,
    inviteUserByEmail,
    verifyOtp,
    getUserById,
    generateLink,
    from,
  };
}
