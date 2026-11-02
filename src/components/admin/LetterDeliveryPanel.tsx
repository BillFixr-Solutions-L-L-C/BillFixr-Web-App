import { type LetterTracking, type ProviderEngagement } from "@/lib/letterTracking";

const TONE_DOT: Record<ProviderEngagement["tone"], string> = {
  done: "bg-primary-500",
  waiting: "bg-accent-500",
  failed: "bg-danger",
};

// A reply is dated by `case_documents.received_on`, which is a date with
// no time — rendering it through toLocaleString invented a "1:00 AM" that
// nobody recorded, and parsing it as a Date would shift it a day in any
// timezone behind UTC. Date-only values are formatted as dates.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function formatMoment(value: string | null) {
  if (!value) return null;
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Whether the provider has engaged with the appeal letter, which is the
// question staff ask of a case in progress. Every line is something that
// was observed; see describeProviderEngagement for why "read" is not a
// state this can claim.
export default function LetterDeliveryPanel({
  engagement,
  tracking,
  sentAt,
  repliedAt,
  hasEvents,
}: {
  engagement: ProviderEngagement;
  tracking: LetterTracking;
  sentAt: string | null;
  repliedAt: string | null;
  /** Whether any delivery event was ever recorded for this letter. */
  hasEvents: boolean;
}) {
  const rows: { label: string; value: string }[] = [];
  const sent = formatMoment(sentAt);
  if (sent) rows.push({ label: "Letter sent", value: sent });
  if (tracking.delivered) rows.push({ label: "Delivered", value: "Accepted by the provider's server" });
  const lastOpened = formatMoment(tracking.lastOpenedAt);
  if (lastOpened) rows.push({ label: "Last opened", value: lastOpened });
  const replied = formatMoment(repliedAt);
  if (replied) rows.push({ label: "Reply logged", value: replied });

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Did the provider read it?</h2>

      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[engagement.tone]}`} />
        <div>
          <p className="text-sm font-semibold text-gray-900">{engagement.headline}</p>
          <p className="mt-0.5 text-xs text-gray-500">{engagement.caveat}</p>
        </div>
      </div>

      {rows.length > 0 && (
        <dl className="mt-4 space-y-1.5 border-t border-gray-50 pt-3">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-3 text-xs">
              <dt className="shrink-0 text-gray-400">{r.label}</dt>
              <dd className="text-right text-gray-700">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* The gap that will bite once the automation engine is live: it
          sends from its own mailbox over SMTP, which produces no Resend
          webhook, so a letter it sent has no delivery events at all. Said
          here rather than left to look like a provider who ignored us. */}
      {sentAt && !hasEvents && (
        <p className="mt-3 border-t border-gray-50 pt-3 text-xs text-gray-400">
          No delivery events were recorded for this letter. Letters sent outside the app&apos;s own mail provider are
          not tracked.
        </p>
      )}
    </div>
  );
}
