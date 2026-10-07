import { Resend } from "resend";

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
  const { data, error } = await getResend().emails.send({ from: FROM, to, subject, html, replyTo });
  if (error) throw new Error(`Resend send failed: ${error.message}`);
  return data;
}
