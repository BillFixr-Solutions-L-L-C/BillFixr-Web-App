import { Resend } from "resend";

// Server-only. Do not import from a Client Component.
const resend = new Resend(process.env.RESEND_API_KEY);

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
  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html, replyTo });
  if (error) throw new Error(`Resend send failed: ${error.message}`);
  return data;
}
