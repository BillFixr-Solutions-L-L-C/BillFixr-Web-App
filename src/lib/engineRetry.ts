import { AutomationEngineError } from "@/lib/automation-engine";

// How long to wait before asking the engine to read a bill again.
//
// The window being ridden out is the free instance being recycled.
// Measured against production on 2026-11-25: a cold boot answers
// /api/health in 29.5s, and until it does every request -- health and
// read alike -- comes back 503 with an empty body. Contention is not the
// cause: three concurrent reads all succeeded and the engine kept
// answering health checks throughout, so a busy worker is not what sheds
// requests.
//
// A flat 3s gap gave three attempts inside 12s, which burns out well
// before a boot finishes. Growing the gap spans the window instead
// without making the common case -- a single shed, answered in about a
// second -- any slower.
//
// Read from the environment per call rather than bound at module load: a
// module-level constant takes whichever value the environment held when
// the module first loaded, which is a bug this codebase has now produced
// five times. Tests set it to 0 so they do not sleep.
export function engineRetryDelayMs(attempt: number): number {
  const base = Number(process.env.AUTOMATION_ENGINE_RETRY_DELAY_MS ?? 3_000);
  // attempt 0 -> 1x, attempt 1 -> 4x. With the 3s default that is 3s then
  // 12s, so three attempts span 15s of waiting plus the reads themselves.
  return base * (attempt + 1) ** 2;
}

// Whether a failed engine call means "the engine is not serving right now"
// rather than "this request is wrong".
//
// 5xx and 429 are the engine or the host in front of it, not the thing we
// asked for. Anything else -- a 400 about the upload, a 404 about an id we
// do not hold -- is about the request and will fail again identically, so
// retrying it only burns the budget.
//
// Lives here rather than beside one caller: the bill read and the
// negotiation sweep face the same free-tier shedding and must agree on
// what counts as it.
export function isEngineUnavailable(err: unknown): boolean {
  return err instanceof AutomationEngineError && (err.status === 429 || err.status >= 500);
}

/**
 * Runs one engine call, riding out the shed requests a free instance
 * throws at us.
 *
 * Measured against production on 2026-11-26: with requests spaced 4s
 * apart the engine answered 12 of 14 negotiation reads and shed the other
 * two -- each hanging about 28s before returning 503 with an empty body.
 * That rate is survivable for a single read and fatal for a sweep: seven
 * sequential reads with no retry is how a run that found seven live
 * negotiations advanced none of them.
 *
 * `deadline` is an absolute timestamp, not a duration, because the caller
 * is spending one shared budget across many calls. Never sleeps past it,
 * and re-throws the last failure so the caller can record which case was
 * lost.
 */
export async function withEngineRetry<T>(
  call: () => Promise<T>,
  { deadline, attempts = 3 }: { deadline: number; attempts?: number },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await call();
    } catch (err) {
      lastError = err;
      // Not the engine being unavailable: fail now, unchanged.
      if (!isEngineUnavailable(err)) throw err;
      if (attempt === attempts - 1) break;
      const delay = engineRetryDelayMs(attempt);
      // Better to report this one as failed than to sleep through the
      // budget the cases after it still need.
      if (Date.now() + delay >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
