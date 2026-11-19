import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/html";
import { emailCopy, greeting, type EmailMessage, type MessageId } from "@/lib/emailCopy";
import { customerLanguage, type Language } from "@/lib/language";

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
//
// "paid" is deliberately NOT on this list: it is the one status that
// represents money having changed hands, so letting the case's own owner
// set it here was a straight payment bypass — anyone could skip the fee
// from dev tools. It is written in exactly two places, both server-side
// and both behind a real Stripe result: the webhook's handleSucceeded,
// and create-intent's zero-fee branch (where the amount owed is under
// Stripe's minimum charge, so no PaymentIntent exists to fire a webhook).
// Nothing in the UI ever requested it through this route.
//
// `response_received` was removed from this list on 2026-11-05. It was
// reachable from the "(dev) simulate provider response" button, which
// meant the only thing that ever marked a provider as having replied was
// the customer saying so. The engine reads the provider's actual email,
// so that status is now written server-side from the engine's own view —
// see src/lib/caseStatusSync.ts. What was left here was the post-scan
// transition in the upload flow, and as of 2026-11-06 that has a real
// trigger too: the scan starts the negotiation and the engine's own send
// moves the case to `letter_sent` (see src/lib/startNegotiation.ts). No
// caller in the app reaches this route any more — it is kept as a manual
// lever, not because anything depends on it.
const ALLOWED_STATUSES = new Set(["awaiting_response"]);

// Which statuses tell the customer anything. The copy itself lives in
// src/lib/emailCopy.ts, in both languages -- it used to be an English
// literal here, which is why a customer registered in Spanish was told in
// English that their letter had gone.
const STATUS_EMAIL_COPY: Record<string, MessageId> = {
  awaiting_response: "letterSent",
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, communication_language")
    .eq("id", user.id)
    .single();
  const copyId = STATUS_EMAIL_COPY[toStatus];
  if (profile?.email && copyId) {
    const language = customerLanguage(profile);
    const content = emailCopy(copyId, language);
    try {
      await sendEmail({
        to: profile.email,
        subject: content.subject,
        html: caseStatusEmailHtml({ name: profile.name, language, copy: content }),
      });
    } catch (err) {
      // Best-effort — the status change itself already succeeded.
      console.error("Case status email failed for", caseId, err);
    }
  }

  return NextResponse.json({ ok: true });
}

function caseStatusEmailHtml({
  name,
  language,
  copy,
}: {
  name: string | null | undefined;
  language: Language;
  copy: EmailMessage;
}) {
  return renderEmailCard({
    title: copy.heading,
    heading: copy.heading,
    language,
    bodyHtml: emailParagraph(`${escapeHtml(greeting(name, language))} ${escapeHtml(copy.body)}`),
    cta: { text: copy.cta, href: "https://billfixr.com/dashboard/case" },
  });
}
