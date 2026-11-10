import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findProviderContact, preferredBackend } from "@/lib/aiStack";

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
  // And a name on its own is not a question with a single answer. The
  // registry matches on a name prefix across the whole country, so
  // "Matthew Walker" hits the Nashville campus and the Smyrna clinic
  // alike, and the resolver then has nothing to rank them by -- it
  // answers with the wrong one and looks certain. The address is what
  // carries the town and the state. The form disables the button without
  // one; this is the same rule where it cannot be clicked past.
  if (!searchAddress) {
    return NextResponse.json(
      { error: "Add the hospital's address first, then search.", value: null },
      { status: 400 },
    );
  }
  // Either backend can answer this; the seam picks, preferring the
  // engine, whose lookup is backed by a real provider directory.
  if (!preferredBackend()) {
    console.warn("Provider contact lookup requested but no AI backend base URL is set");
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

  // The engine's whole answer, built once and returned whether or not it
  // also carried an email. The app is a projection of the engine here: the
  // registry record is the useful part of a lookup even when no address is
  // published, and the form fills its boxes from this.
  const record = {
    providerName: contact.provider_name ?? null,
    phone: contact.phone ?? null,
    billingUrl: contact.billing_url ?? null,
    notes: contact.notes ?? "",
    mailingAddress: contact.mailing_address ?? null,
    facilityType: contact.facility_type ?? null,
    npi: contact.npi ?? null,
    // "verified" means a human checked this entry in the curated
    // directory. "listed" means the federal registry matched a name
    // prefix, which is how a Smyrna bill reached the Nashville campus --
    // so the form may fill a blank box from it but must not overwrite
    // something the customer typed.
    verificationStatus: contact.verification_status ?? null,
    // Only the alternatives, so the UI can offer "not this one?"
    // without repeating the facility it already named above.
    otherMatches: (contact.candidates ?? []).slice(1, 4).map((candidate) => ({
      name: candidate.name,
      facilityType: candidate.facility_type,
      mailingAddress: candidate.mailing_address,
      phone: candidate.phone,
      city: candidate.city,
      state: candidate.state,
    })),
  };

  const value = (field === "billingManagerEmail" ? contact.billing_email : contact.support_email)?.trim() || null;
  if (!value) {
    // A miss on the EMAIL is the normal case, not an error, and it is not
    // the same as finding nothing. Hospitals almost never publish a billing
    // email -- 3 of the 16 in the curated directory do, and the federal NPI
    // registry, which covers essentially every US provider, has no email
    // field at all. What it does have is a postal address and a phone
    // number, so that is what comes back here. The customer rings the
    // billing line and types the address in, which is the only thing that
    // actually unblocks a send, since the engine refuses to mail a letter
    // without one.
    return NextResponse.json({ ok: true, value: null, fallback: record });
  }

  // Persist the found address so the letter flow and the scan gate see it
  // even if the customer never edits the field by hand.
  const column = field === "billingManagerEmail" ? "provider_email" : "provider_support_email";
  const existing = field === "billingManagerEmail" ? bill.provider_email : bill.provider_support_email;
  if (!existing?.trim()) {
    const admin = createAdminClient();
    await admin.from("bills").update({ [column]: value }).eq("id", id);
  }

  // Where the address came from, when it was found on the web rather than
  // taken from the curated directory. The form shows the domain, because
  // "an email appeared in the box" is not a reason to trust it.
  let emailSource: string | null = null;
  try {
    emailSource = contact.email_source_url ? new URL(contact.email_source_url).hostname : null;
  } catch {
    emailSource = null;
  }
  return NextResponse.json({
    ok: true,
    value,
    emailSource,
    // Whether the engine could stand behind it. An address it found but
    // could not check is still filled in -- the customer can open the page
    // we could not -- and the form says so instead of pretending.
    emailConfirmed: contact.email_confirmed !== false,
    emailUnconfirmedReason: contact.email_unconfirmed_reason ?? null,
    fallback: record,
  });
}
