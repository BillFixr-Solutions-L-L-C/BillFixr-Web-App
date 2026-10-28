import crypto from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Receives Resend's delivery/open events so the Active Case screen can say
// whether the provider actually opened the appeal letter (Figma 815:3326).
//
// Same discipline as the Stripe webhook: verify the signature against the
// RAW body, and never trust the payload otherwise. Resend signs with Svix,
// which is a plain HMAC — verified here rather than pulling in the svix
// package for one function.
//
// Events are keyed on Svix's message id, so a redelivery (which Resend
// does on any non-2xx) cannot double-count an open.

const TRACKED = new Set([
  "email.sent",
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
]);

// Svix tolerates a 5-minute clock skew; anything older is a replay.
const MAX_AGE_SECONDS = 5 * 60;

function verify(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_AGE_SECONDS) return false;

  // whsec_<base64>; the raw secret is what signs the payload.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  // The header carries one or more space-separated "v1,<sig>" entries, so
  // a secret can be rotated without dropping events mid-flight.
  return signatureHeader.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Unconfigured is not the same as forged: say so, and do not pretend
    // the event was accepted.
    console.error("Resend webhook received but RESEND_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verify(rawBody, request.headers, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: { type?: string; created_at?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const messageId = event.data?.email_id;
  if (!event.type || !TRACKED.has(event.type) || !messageId) {
    // An event we don't track, or one with nothing to match on. Accept it
    // so Resend stops retrying.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();
  const { data: caseRow } = await admin
    .from("cases")
    .select("id")
    .eq("letter_message_id", messageId)
    .maybeSingle();

  // Every email we send reaches this endpoint, not just appeal letters, so
  // an unmatched message is ordinary rather than an error.
  if (!caseRow) {
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const eventId = request.headers.get("svix-id")!;
  const { error } = await admin.from("letter_events").upsert(
    {
      id: eventId,
      case_id: caseRow.id,
      message_id: messageId,
      type: event.type,
      occurred_at: event.created_at ?? new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) {
    // Ask for a retry rather than losing the event.
    console.error("Failed to record letter event", eventId, error);
    return NextResponse.json({ error: "could not record event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
