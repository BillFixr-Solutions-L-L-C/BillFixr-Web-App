import { Resend } from "resend";
import { SUPPORT_EMAIL } from "./businessContact";

// Server-only. Do not import from a Client Component.
//
// Built on first send rather than at import time: `next build` imports
// every route module to collect page data, and constructing this at module
// scope failed the whole build wherever RESEND_API_KEY is absent — which
// is the case in CI. Same reasoning as lib/stripe.ts.
let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY is not set");
    }
    resend = new Resend(key);
  }
  return resend;
}

const FROM = "BillFixr <notifications@billfixr.com>";

// Where a reply goes when the caller does not say.
//
// notifications@ is a real mailbox now, which quietly made this worse
// rather than better. Before, a customer hitting Reply on a welcome email
// or a case update bounced, and a bounce at least tells them to find
// another route. An unmonitored inbox tells them nothing: the message
// looks delivered and is never read.
//
// Only 3 of the 11 send sites set a replyTo of their own. The other 8 --
// the welcome email, case status updates, follow-up nudges, account
// deletion, the newsletter, careers applications -- are customer-facing
// and will be replied to. So the default points at the address a human
// actually reads, and any caller with a better answer still wins:
// send-letter sets the patient's own address so a hospital reaches them
// directly, and the support-ticket routes set support@ explicitly.
const DEFAULT_REPLY_TO = SUPPORT_EMAIL;

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  const { data, error } = await getResend().emails.send({
    from: FROM,
    to,
    subject,
    html,
    // ?? not ||, so a caller can still pass "" to mean "no reply-to".
    replyTo: replyTo ?? DEFAULT_REPLY_TO,
  });
  if (error) throw new Error(`Resend send failed: ${error.message}`);
  return data;
}
