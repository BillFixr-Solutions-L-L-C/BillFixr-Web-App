import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { letterToHtml } from "@/lib/letterFormat";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LETTER_LENGTH = 20000;

// Sends the customer's appeal letter to the provider address they enter.
// Guardrails, because this emails an arbitrary third party from BillFixr's
// domain: caller must own the case, the commitment fee must be paid, and a
// case can only be sent once (the conditional update below closes the
// double-click race).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { providerEmail, text } = await request.json();

  const email = typeof providerEmail === "string" ? providerEmail.trim() : "";
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Enter a valid provider email address." }, { status: 400 });
  }
  if (text !== undefined && (typeof text !== "string" || text.length > MAX_LETTER_LENGTH)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, user_id, bill_id, status, appeal_letter_text, letter_sent_at")
    .eq("id", id)
    .single();
  if (!caseRow || caseRow.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (caseRow.letter_sent_at) {
    return NextResponse.json({ error: "This letter has already been sent." }, { status: 409 });
  }

  const letter = (typeof text === "string" && text.trim() ? text : caseRow.appeal_letter_text) ?? "";
  if (!letter.trim()) {
    return NextResponse.json({ error: "There's no letter to send yet." }, { status: 409 });
  }

  const { data: paidFee } = await supabase
    .from("payment_records")
    .select("id")
    .eq("bill_id", caseRow.bill_id)
    .eq("type", "commitment_fee")
    .eq("status", "paid")
    .maybeSingle();
  if (!paidFee) {
    return NextResponse.json({ error: "The commitment fee must be paid before sending." }, { status: 402 });
  }

  const { data: profile } = await supabase.from("profiles").select("name, email").eq("id", user.id).single();

  const admin = createAdminClient();
  const { data: claimed, error: claimError } = await admin
    .from("cases")
    .update({
      appeal_letter_text: letter,
      provider_email: email,
      letter_sent_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("letter_sent_at", null)
    .select("id");
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: "This letter has already been sent." }, { status: 409 });
  }

  const senderName = profile?.name ?? "a BillFixr customer";
  try {
    await sendEmail({
      to: email,
      subject: `Billing review request from ${senderName}`,
      replyTo: profile?.email ?? undefined,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">${letterToHtml(
        letter,
      )}<p style="margin-top:24px;font-size:12px;color:#666">Sent on behalf of ${escapeHtml(
        senderName,
      )} through BillFixr. Reply directly to this email to respond.</p></div>`,
    });
  } catch (err) {
    // Roll the claim back so the customer can retry instead of being told
    // the letter was sent when it wasn't.
    await admin.from("cases").update({ letter_sent_at: null, provider_email: null }).eq("id", id);
    console.error("Appeal letter email failed for", id, err);
    return NextResponse.json({ error: "We couldn't send the letter. Please try again." }, { status: 502 });
  }

  // Only once the email has actually gone out: a case still at
  // scanning/analyzed moves to awaiting_response, which is what starts the
  // follow-up scheduler. Anything further along is left alone.
  if (caseRow.status === "scanning" || caseRow.status === "analyzed") {
    await admin.from("cases").update({ status: "awaiting_response" }).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
