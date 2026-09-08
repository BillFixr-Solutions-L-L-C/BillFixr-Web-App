import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/html";

// Case status updates are deliberately not writable directly by
// customers via RLS (see cases_admin_write in the schema) — otherwise
// anyone could open dev tools and set their own case straight to
// "paid". This route stands in for what will eventually be real
// triggers (AI analysis completing, a provider-response webhook, a
// payment webhook): it validates the caller actually owns the case,
// only allows a fixed allowlist of "safe to self-advance" statuses,
// then performs the write with the service role. Whatever eventually
// replaces this route with a real trigger should keep the same
// case-status-change email below.
const ALLOWED_STATUSES = new Set(["awaiting_response", "response_received", "paid"]);

const STATUS_EMAIL_CONTENT: Record<string, { subject: string; heading: string; body: string }> = {
  awaiting_response: {
    subject: "Your appeal letter has been sent",
    heading: "Your appeal letter is on its way",
    body: "We've sent your appeal letter to your provider on your behalf. We'll keep following up automatically and let you know as soon as there's a response.",
  },
  response_received: {
    subject: "Your provider responded",
    heading: "Your provider responded",
    body: "Good news - your provider has responded to your case. Review the details and next steps from your dashboard.",
  },
  paid: {
    subject: "Payment received",
    heading: "Payment received",
    body: "We've received your payment for this case. Thanks for using BillFixr.",
  },
};

export async function POST(request: Request) {
  const { caseId, toStatus } = await request.json();

  if (typeof caseId !== "string" || !ALLOWED_STATUSES.has(toStatus)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: caseRow } = await supabase.from("cases").select("id, user_id").eq("id", caseId).single();
  if (!caseRow || caseRow.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("cases").update({ status: toStatus }).eq("id", caseId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: profile } = await supabase.from("profiles").select("name, email").eq("id", user.id).single();
  const content = STATUS_EMAIL_CONTENT[toStatus];
  if (profile?.email && content) {
    try {
      await sendEmail({
        to: profile.email,
        subject: content.subject,
        html: caseStatusEmailHtml({ name: profile.name ?? "there", heading: content.heading, body: content.body }),
      });
    } catch (err) {
      // Best-effort — the status change itself already succeeded.
      console.error("Case status email failed for", caseId, err);
    }
  }

  return NextResponse.json({ ok: true });
}

function caseStatusEmailHtml({ name, heading, body }: { name: string; heading: string; body: string }) {
  return renderEmailCard({
    title: heading,
    heading,
    bodyHtml: emailParagraph(`Hi ${escapeHtml(name)}, ${escapeHtml(body)}`),
    cta: { text: "View Your Case", href: "https://billfixr.com/dashboard/case" },
  });
}
