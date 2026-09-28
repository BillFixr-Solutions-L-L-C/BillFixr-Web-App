import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FIELD = 200;
const MAX_ADDRESS = 500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Payload = Record<string, unknown>;

function text(body: Payload, key: string, max = MAX_FIELD): string | null | false {
  const raw = body[key];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return false;
  const value = raw.trim();
  if (value.length > max) return false;
  return value === "" ? null : value;
}

// Saves the "Personal Information" + "Hospital Information" step of the
// upload flow. Personal fields belong to the profile; hospital fields
// belong to the bill the AI read them from. Customers can't update bills
// directly under RLS, so the bill half goes through the service role after
// an ownership check.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as Payload;

  const fields = {
    clientName: text(body, "clientName"),
    address: text(body, "address", MAX_ADDRESS),
    clientHospitalNumber: text(body, "clientHospitalNumber"),
    hospitalName: text(body, "hospitalName"),
    billingManagerEmail: text(body, "billingManagerEmail"),
    hospitalAddress: text(body, "hospitalAddress", MAX_ADDRESS),
    supportEmail: text(body, "supportEmail"),
    billingPhone: text(body, "billingPhone"),
  };
  if (Object.values(fields).some((v) => v === false)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  if (fields.billingManagerEmail && !EMAIL_PATTERN.test(fields.billingManagerEmail as string)) {
    return NextResponse.json({ error: "Enter a valid billing manager email." }, { status: 400 });
  }
  if (fields.supportEmail && !EMAIL_PATTERN.test(fields.supportEmail as string)) {
    return NextResponse.json({ error: "Enter a valid support email." }, { status: 400 });
  }
  if (!fields.clientName) {
    return NextResponse.json({ error: "Your name is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: bill } = await supabase.from("bills").select("id, user_id").eq("id", id).single();
  if (!bill || bill.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // The profile half goes through the caller's own session, so RLS is the
  // one deciding what they may change about themselves.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      name: fields.clientName,
      address: fields.address,
      client_hospital_number: fields.clientHospitalNumber,
    })
    .eq("id", user.id);
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const admin = createAdminClient();
  const { error: billError } = await admin
    .from("bills")
    .update({
      provider_name: fields.hospitalName,
      provider_email: fields.billingManagerEmail,
      provider_address: fields.hospitalAddress,
      provider_support_email: fields.supportEmail,
      provider_phone: fields.billingPhone,
    })
    .eq("id", id);
  if (billError) {
    return NextResponse.json({ error: billError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
