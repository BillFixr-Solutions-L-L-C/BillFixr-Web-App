import { providerHasResponded } from "@/lib/negotiationStatus";
import type { AutomationNegotiation } from "@/types/automation-engine";

// Decides whether a negotiation is due its next 72-hour follow-up.
//
// Why this lives here and not in the engine: the engine has two halves and
// only one of them checks the clock.
//
//   - `autopilot_loop()` in server.py runs every 60s, calls `_cadence_due()`
//     to check the 72-hour gap, and ticks when it has elapsed.
//   - `POST /api/negotiations/{id}/cadence/tick`, the public endpoint, checks
//     the status and the review hold but **not the clock**. It increments
//     and sends.
//
// So anything calling that endpoint on a schedule must bring its own gap
// check, or a daily cron sends a follow-up every day instead of every three.
// This is that check, kept deliberately identical in rule to `_cadence_due`.
//
// Why the endpoint has to be called at all, when the engine already has a
// loop: both of the engine's loops are `asyncio.create_task` in-process, and
// Render's free tier spins the service down after ~15 minutes idle. They die
// with it. A "72-hour follow-up" therefore fires whenever the engine next
// happens to be awake, which is whenever something calls it.

export const CADENCE_HOURS = 72;
export const MAX_FOLLOW_UPS = 3;

export type CadenceDecision =
  | { due: true; nextStep: number }
  | {
      due: false;
      reason:
        | "provider_responded"
        | "follow_ups_exhausted"
        | "nothing_sent_yet"
        | "too_soon";
      /** Whole hours since the last outbound message, when that is why. */
      hoursSinceLastSend?: number;
    };

type CadenceInput = Pick<AutomationNegotiation, "status" | "cadence_step" | "messages">;

/**
 * Whether the provider is due another chase.
 *
 * The gap is measured from the **last outbound message**, not from the case
 * opening, so a counter-offer we sent yesterday resets the clock exactly as
 * the engine's own loop does.
 */
export function followUpDecision(
  negotiation: CadenceInput,
  now: Date = new Date(),
): CadenceDecision {
  // Checked first: chasing a provider that has already written back is the
  // worst of the failure modes, and the cheapest to rule out.
  if (providerHasResponded(negotiation.status)) {
    return { due: false, reason: "provider_responded" };
  }

  const sent = Number(negotiation.cadence_step ?? 0);
  if (sent >= MAX_FOLLOW_UPS) {
    return { due: false, reason: "follow_ups_exhausted" };
  }

  const outbound = (negotiation.messages ?? []).filter((m) => m?.direction === "OUTBOUND");
  if (outbound.length === 0) {
    // Nothing has gone out, so there is nothing to follow up on. A tick
    // here would send "follow-up #1" to a provider that never got the
    // dispute letter.
    return { due: false, reason: "nothing_sent_yet" };
  }

  // Sorted rather than assuming the last element is the newest: this list
  // comes off the wire and its order is not part of the contract.
  const latest = outbound.reduce((newest, message) => {
    const at = Date.parse(message.created_at);
    return Number.isFinite(at) && at > newest ? at : newest;
  }, Number.NEGATIVE_INFINITY);

  if (!Number.isFinite(latest)) {
    // Every timestamp was unreadable. Treated as not due: sending a letter
    // to a hospital off a date we could not parse is not a risk worth
    // taking, and the next run gets another chance.
    return { due: false, reason: "nothing_sent_yet" };
  }

  const hoursSinceLastSend = Math.floor((now.getTime() - latest) / 3_600_000);
  if (hoursSinceLastSend < CADENCE_HOURS) {
    return { due: false, reason: "too_soon", hoursSinceLastSend };
  }

  return { due: true, nextStep: sent + 1 };
}
