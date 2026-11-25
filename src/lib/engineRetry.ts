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
