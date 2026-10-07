import { vi } from "vitest";

type StorageEntry = { name: string; id: string | null };

type StorageList = (
  prefix?: string,
  options?: Record<string, unknown>,
) => Promise<{ data: StorageEntry[] | null; error: { message: string } | null }>;

type QueryResult = { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null };

const CHAIN_METHODS = [
  "select",
  "eq",
  "neq",
  "not",
  "in",
  "or",
  "order",
  "limit",
  "update",
  "delete",
  "insert",
  "upsert",
  "single",
  "maybeSingle",
  "lt",
  "lte",
  "gt",
  "gte",
  "ilike",
  "like",
  "is",
  "range",
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

  // vi.clearAllMocks() only clears call history — queued results survive it,
  // so anything a test queues but doesn't consume leaks into the next test
  // and makes failures land far from their cause. Call this in beforeEach.
  function reset() {
    queues.clear();
  }

  const getUser = vi.fn();
  const rpc = vi.fn();
  const deleteUser = vi.fn();
  const inviteUserByEmail = vi.fn();
  const verifyOtp = vi.fn();
  const getUserById = vi.fn();
  const generateLink = vi.fn();
  const storageDownload = vi.fn();
  const storageCreateSignedUrl = vi.fn();
  const storageRemove = vi.fn();
  const storageUpload = vi.fn();
  // Defaults to an empty listing so a cascade that sweeps storage doesn't
  // blow up in suites that don't care about it. Typed with the prefix
  // argument so a test can vary its answer per folder.
  const storageList = vi.fn<StorageList>(async () => ({ data: [], error: null }));

  const client = {
    auth: {
      getUser,
      verifyOtp,
      admin: { deleteUser, inviteUserByEmail, getUserById, generateLink },
    },
    from,
    rpc,
    storage: {
      from: vi.fn(() => ({
        download: storageDownload,
        createSignedUrl: storageCreateSignedUrl,
        remove: storageRemove,
        upload: storageUpload,
        list: storageList,
      })),
    },
  };

  return {
    client,
    queueResult,
    reset,
    getUser,
    rpc,
    deleteUser,
    inviteUserByEmail,
    verifyOtp,
    getUserById,
    generateLink,
    storageDownload,
    storageCreateSignedUrl,
    storageRemove,
    storageUpload,
    storageList,
    from,
  };
}
