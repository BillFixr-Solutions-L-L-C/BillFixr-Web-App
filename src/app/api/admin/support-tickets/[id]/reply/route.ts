import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";
import { sendEmail } from "@/lib/email";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/html";

const MAX_LENGTH = 5000;
const SUPPORT_INBOX = "support@billfixr.com";

// Lets an agent answer a ticket by email without having to resolve it
// first. Replies land in the customer's inbox and come back to the support
// inbox, so a conversation can carry on there.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { message } = await request.json();

  if (typeof message !== "string" || !message.trim() || message.length > MAX_LENGTH) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: caller } = await supabase.from("profiles").select("role, name").eq("id", user.id).single();
  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!hasFullDomainAccess(await getDomainAccess(supabase, "client_data"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Sending mail from BillFixr's domain to a real customer needs its own
  // permission, not just ticket access (see roles.can_email_customers).
  const { data: canEmail } = await supabase.rpc("can_email_customers");
  if (!canEmail) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, subject, profiles(name, email)")
    .eq("id", id)
    .single();
  if (!ticket) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // support_tickets -> profiles is a to-one relationship, so this embed
  // comes back as a plain object at runtime even though supabase-js infers
  // it as an array without generated DB types.
  const profile = ticket.profiles as unknown as { name: string; email: string } | null;
  if (!profile?.email) {
    return NextResponse.json({ error: "This customer has no email address on file." }, { status: 409 });
  }

  try {
    await sendEmail({
      to: profile.email,
      subject: `Re: ${ticket.subject}`,
      replyTo: SUPPORT_INBOX,
      html: renderEmailCard({
        title: "A reply from BillFixr Support",
        heading: "A reply from BillFixr Support",
        bodyHtml:
          emailParagraph(`Hi ${escapeHtml(profile.name ?? "there")},`) +
          emailParagraph(escapeHtml(message.trim()).replace(/\n/g, "<br>")) +
          emailParagraph("You can reply straight to this email and it will reach us."),
        cta: { text: "View Support", href: "https://billfixr.com/dashboard/support" },
      }),
    });
  } catch (err) {
    console.error("Support reply email failed for ticket", id, err);
    return NextResponse.json({ error: "We couldn't send that reply. Please try again." }, { status: 502 });
  }

  await supabase.from("admin_activity_log").insert({
    actor_id: user.id,
    actor_name: caller.name ?? "Admin",
    action: "emailed_customer",
    target_id: id,
    target_name: profile.name ?? profile.email,
  });

  return NextResponse.json({ ok: true });
}
