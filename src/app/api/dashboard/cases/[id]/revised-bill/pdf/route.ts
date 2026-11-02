import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRevisedBillPdf } from "@/lib/automation-engine";
import { isBackendConfigured } from "@/lib/aiStack";

// Streams the hospital's revised bill PDF to the customer who owns the
// case. The engine holds the file and will not release it until the
// completion fee is paid, so this route does not re-implement that
// paywall — it passes the engine's 402 straight through.
//
// The engine trusts whoever holds the API key, so the ownership check
// here is the only thing standing between one customer and another
// customer's bill. INTEGRATION.md calls this out specifically: "Check
// that the signed-in user owns the case before calling it, including the
// PDF route."
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, user_id, negotiation_id")
    .eq("id", id)
    .single();
  // Same answer for "no such case" and "not yours".
  if (!caseRow || caseRow.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!caseRow.negotiation_id) {
    return NextResponse.json({ error: "There is no revised bill for this case." }, { status: 404 });
  }
  if (!isBackendConfigured("automation-engine")) {
    return NextResponse.json({ error: "The negotiation service is unavailable." }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await fetchRevisedBillPdf(caseRow.negotiation_id);
  } catch (err) {
    console.error("Could not reach the engine for the revised bill of case", id, err);
    return NextResponse.json({ error: "The negotiation service is unavailable." }, { status: 502 });
  }

  // 402 (fee unpaid) and 404 (the hospital sent no PDF) are both real
  // answers the customer should see, but the engine's body may name
  // internal paths, so only the status crosses over.
  if (upstream.status === 402) {
    return NextResponse.json({ error: "The revised bill unlocks once the fee is paid." }, { status: 402 });
  }
  if (!upstream.ok) {
    if (upstream.status !== 404) {
      console.error("Engine returned", upstream.status, "for the revised bill of case", id);
    }
    return NextResponse.json({ error: "The revised bill isn't available yet." }, { status: 404 });
  }

  // Streamed rather than buffered: this is a scan from a hospital and can
  // be large. inline, not attachment — an active case is view-only, and
  // the filename never comes from the engine's headers.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="revised-bill-${id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
