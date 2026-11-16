// Trims the quoted history off an email reply.
//
// The provider's reply is shown to the customer on the Active Case
// screen, and a reply sent from a mail client carries our own dispute
// letter quoted underneath it. In production that turned a one-line
// answer ("Dispute accepted, new bill will be sent") into three thousand
// characters, most of them our own words read back — which buries the
// only sentence the customer needs.
//
// Deliberately conservative. Every rule here cuts at a marker a mail
// client writes itself, and anything that would leave nothing behind is
// treated as a failed guess and the whole text is kept: showing too much
// of a provider's reply is a nuisance, showing none of it is a lie about
// what they said.

/** `On <date>, <someone> wrote:` — the attribution line Gmail, Apple Mail
 *  and Outlook all write. It wraps, so "wrote:" can be on the next line
 *  (which is exactly how the first real one arrived). */
const ATTRIBUTION_START = /^(On|El|Le|Am)\b.*\d/;

/** Outlook's divider, and the one Thunderbird and older clients use. */
const DIVIDERS = [/^-{2,}\s*Original Message\s*-{2,}$/i, /^_{10,}$/, /^-{5,}$/, /^From:\s/i, /^De:\s/i];

/** How many lines after an attribution line "wrote:" may appear on. */
const WRAP_LOOKAHEAD = 2;

export function stripQuotedTail(body: string): string {
  const lines = body.split(/\r?\n/);

  let cut = -1;
  for (let i = 0; i < lines.length && cut === -1; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith(">")) {
      cut = i;
      break;
    }
    if (DIVIDERS.some((d) => d.test(line))) {
      cut = i;
      break;
    }
    if (ATTRIBUTION_START.test(line)) {
      // Only a cut if it really is an attribution: the giveaway is
      // "wrote:" on this line or the next one or two it wrapped onto.
      // Without that check, a reply opening "On 12 January we were
      // charged twice" would take its own body off.
      const window = lines
        .slice(i, i + 1 + WRAP_LOOKAHEAD)
        .join(" ")
        .toLowerCase();
      if (/\bwrote:|\bescribió:|\ba écrit\s*:|\bschrieb:/.test(window)) {
        cut = i;
      }
    }
  }

  if (cut === -1) return body.trim();

  const kept = lines.slice(0, cut).join("\n").trim();
  // A reply that is nothing but quoted text — "see below", or a provider
  // who answered inline — keeps everything rather than showing a blank
  // card.
  return kept.length > 0 ? kept : body.trim();
}

/** True when trimming actually removed something, so the screen can offer
 *  the full text rather than silently hiding part of a reply. */
export function hasQuotedTail(body: string): boolean {
  return stripQuotedTail(body).length < body.trim().length;
}
