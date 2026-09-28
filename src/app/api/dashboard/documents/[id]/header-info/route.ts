import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { EMPTY_VALUE } from "@/lib/headerInfo";

const MAX_FIELD_LENGTH = 200;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Clearing a field restores the AI's own "nothing found" string (see
// headerInfo.ts) rather than storing an empty one.
const JSONB_DEFAULTS = EMPTY_VALUE;

const TEXT_KEYS = ["memberName", "memberId", "group", "claimNumber", "providerName", "accountNumber"] as const;
const DATE_KEYS = ["serviceDate", "statementDate"] as const;

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

// Customers have no UPDATE path on bills under RLS, so the manual edit of
// the AI-filled header details goes through here: ownership is checked with
// the session client, then only these fields are written with the service
// role. The five analysis fields live inside analysis_result (jsonb) and
// are merged in; the other three are real columns.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const values: Record<string, string> = {};
  for (const key of [...TEXT_KEYS, ...DATE_KEYS]) {
    const raw = body?.[key];
    if (typeof raw !== "string") {
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }
    values[key] = raw.trim();
    if (values[key].length > MAX_FIELD_LENGTH) {
      return NextResponse.json({ error: "One of the fields is too long." }, { status: 400 });
    }
  }
  for (const key of DATE_KEYS) {
    if (values[key] && !isValidDate(values[key])) {
      return NextResponse.json({ error: "Dates must be valid (YYYY-MM-DD)." }, { status: 400 });
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
    .select("id, user_id, analysis_result")
    .eq("id", id)
    .single();
  if (!bill || bill.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!bill.analysis_result) {
    return NextResponse.json({ error: "This bill hasn't been analyzed yet." }, { status: 409 });
  }

  const analysis = {
    ...(bill.analysis_result as Record<string, unknown>),
    memberName: values.memberName || JSONB_DEFAULTS.memberName,
    memberId: values.memberId || JSONB_DEFAULTS.memberId,
    group: values.group || JSONB_DEFAULTS.group,
    claimNumber: values.claimNumber || JSONB_DEFAULTS.claimNumber,
    accountNumber: values.accountNumber || JSONB_DEFAULTS.accountNumber,
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("bills")
    .update({
      provider_name: values.providerName || null,
      service_date: values.serviceDate || null,
      statement_date: values.statementDate || null,
      analysis_result: analysis,
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
