import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";
import { sendEmail } from "@/lib/email";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/html";

const STATUS_EMAIL_CONTENT: Record<string, { subject: string; heading: string; body: (subject: string) => string }> = {
  in_progress: {
    subject: "We're looking into your support ticket",
    heading: "We're on it",
    body: (subject) => `An agent has picked up your ticket about "${subject}" and is looking into it now.`,
  },
  resolved: {
    subject: "Your support ticket has been resolved",
    heading: "Your ticket has been resolved",
    body: (subject) =>
      `Your ticket about "${subject}" has been marked resolved. If you still need help, just send another message from Support.`,
  },
};

// Admin marking a ticket in-progress/resolved from AdminSupportPage —
// moved from a direct client .update() to a Route Handler so the status
// change can also notify the customer by email (sendEmail is server-only).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status } = await request.json();

  if (!(status in STATUS_EMAIL_CONTENT)) {
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
    .select("subject, profiles(name, email)")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // support_tickets -> profiles is a to-one relationship, so this embed
  // comes back as a plain object at runtime even though supabase-js
  // infers it as an array without generated DB types (see BACKEND-PLAN.md).
  const profile = updated?.profiles as unknown as { name: string; email: string } | null;
  const content = STATUS_EMAIL_CONTENT[status];
  if (profile?.email) {
    try {
      await sendEmail({
        to: profile.email,
        subject: content.subject,
        html: ticketStatusEmailHtml({
          name: profile.name ?? "there",
          heading: content.heading,
          body: content.body(updated?.subject ?? "your ticket"),
        }),
      });
    } catch (err) {
      // Best-effort — the status change itself already succeeded.
      console.error("Ticket status email failed for", id, err);
    }
  }

  return NextResponse.json({ ok: true });
}

function ticketStatusEmailHtml({ name, heading, body }: { name: string; heading: string; body: string }) {
  return renderEmailCard({
    title: heading,
    heading,
    bodyHtml: emailParagraph(`Hi ${escapeHtml(name)}, ${escapeHtml(body)}`),
    cta: { text: "View Support", href: "https://billfixr.com/dashboard/support" },
  });
}
