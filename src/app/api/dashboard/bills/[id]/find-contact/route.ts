import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findProviderContact, getAiServiceConfig } from "@/lib/ai-service";

const FIELDS = ["billingManagerEmail", "supportEmail"] as const;
type ContactField = (typeof FIELDS)[number];

function isContactField(value: unknown): value is ContactField {
  return typeof value === "string" && (FIELDS as readonly string[]).includes(value);
}

// Backs the two "Search by AI" buttons. These addresses aren't printed on
// a bill, so this looks the hospital up rather than reading the document —
// which is why it's a separate route from /extract.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { field, hospitalName, hospitalAddress } = await request.json();

  if (!isContactField(field)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  // The customer may have just typed the hospital name and not saved yet,
  // so the form sends what's on screen; it's only ever used as the search
  // term. Falls back to whatever is stored.
  for (const v of [hospitalName, hospitalAddress]) {
    if (v !== undefined && (typeof v !== "string" || v.length > 200)) {
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: bill } = await supabase
    .from("bills")
    .select("id, user_id, provider_name, provider_address, provider_email, provider_support_email")
    .eq("id", id)
    .single();
  if (!bill || bill.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const searchName = (typeof hospitalName === "string" ? hospitalName : bill.provider_name)?.trim();
  const searchAddress = (typeof hospitalAddress === "string" ? hospitalAddress : bill.provider_address)?.trim() || null;

  // The lookup is by hospital, so there's nothing to search on without one.
  if (!searchName) {
    return NextResponse.json({ error: "Add the hospital name first, then search.", value: null }, { status: 400 });
  }
  if (!getAiServiceConfig()) {
    console.warn("Provider contact lookup requested but AI_SERVICE_BASE_URL is not set");
    return NextResponse.json(
      { error: "Automatic search isn't available right now — please type it in.", value: null },
      { status: 503 },
    );
  }

  let contact;
  try {
    contact = await findProviderContact({ name: searchName, address: searchAddress });
  } catch (err) {
    console.error("Provider contact lookup failed for bill", id, err);
    return NextResponse.json(
      { error: "We couldn't find this automatically — please type it in.", value: null },
      { status: 502 },
    );
  }

  const value = (field === "billingManagerEmail" ? contact.billing_email : contact.support_email)?.trim() || null;
  if (!value) {
    return NextResponse.json({ ok: true, value: null });
  }

  // Persist the found address so the letter flow and the scan gate see it
  // even if the customer never edits the field by hand.
  const column = field === "billingManagerEmail" ? "provider_email" : "provider_support_email";
  const existing = field === "billingManagerEmail" ? bill.provider_email : bill.provider_support_email;
  if (!existing?.trim()) {
    const admin = createAdminClient();
    await admin.from("bills").update({ [column]: value }).eq("id", id);
  }

  return NextResponse.json({ ok: true, value });
}
