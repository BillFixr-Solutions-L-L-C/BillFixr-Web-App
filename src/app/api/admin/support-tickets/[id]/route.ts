import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";
import { sendEmail } from "@/lib/email";
import { SUPPORT_EMAIL } from "@/lib/businessContact";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/html";
import { emailCopy, fillCopy, greeting, type EmailMessage, type MessageId } from "@/lib/emailCopy";
import { customerLanguage, type Language } from "@/lib/language";

// Which status change tells the customer anything, and which copy says
// it. The sentences themselves live in src/lib/emailCopy.ts, in both
// languages -- they used to be English literals here, which is why a
// customer registered in Spanish was told in English that an agent had
// picked up their ticket.
const STATUS_EMAIL_COPY: Record<string, MessageId> = {
  in_progress: "supportInProgress",
  resolved: "supportResolved",
};

// Admin marking a ticket in-progress/resolved from AdminSupportPage —
// moved from a direct client .update() to a Route Handler so the status
// change can also notify the customer by email (sendEmail is server-only).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, note } = await request.json();

  if (!(status in STATUS_EMAIL_COPY)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  if (note !== undefined && typeof note !== "string") {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!hasFullDomainAccess(await getDomainAccess(supabase, "client_data"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: updated, error } = await supabase
    .from("support_tickets")
    .update({ status })
    .eq("id", id)
    .select("subject, profiles(name, email, communication_language)")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // support_tickets -> profiles is a to-one relationship, so this embed
  // comes back as a plain object at runtime even though supabase-js
  // infers it as an array without generated DB types (see BACKEND-PLAN.md).
  const profile = updated?.profiles as unknown as
    | { name: string; email: string; communication_language: string | null }
    | null;
  const copyId = STATUS_EMAIL_COPY[status];
  if (profile?.email && copyId) {
    const language = customerLanguage(profile);
    const content = emailCopy(copyId, language);
    try {
      await sendEmail({
        to: profile.email,
        subject: content.subject,
        // These carry an agent's note, so they invite a response — without
        // this, hitting Reply mails notifications@, not support.
        replyTo: SUPPORT_EMAIL,
        html: ticketStatusEmailHtml({
          name: profile.name,
          language,
          copy: content,
          // An admin-written note replaces the generic line, so the
          // customer sees what was actually fixed. It is sent as typed:
          // a human wrote it to this person.
          body:
            note?.trim() || fillCopy(content.body, { subject: updated?.subject ?? "" }),
        }),
      });
    } catch (err) {
      // Best-effort — the status change itself already succeeded.
      console.error("Ticket status email failed for", id, err);
    }
  }

  return NextResponse.json({ ok: true });
}

function ticketStatusEmailHtml({
  name,
  language,
  copy,
  body,
}: {
  name: string | null | undefined;
  language: Language;
  copy: EmailMessage;
  body: string;
}) {
  return renderEmailCard({
    title: copy.heading,
    heading: copy.heading,
    language,
    bodyHtml: emailParagraph(`${escapeHtml(greeting(name, language))} ${escapeHtml(body)}`),
    cta: { text: copy.cta, href: "https://billfixr.com/dashboard/support" },
  });
}
