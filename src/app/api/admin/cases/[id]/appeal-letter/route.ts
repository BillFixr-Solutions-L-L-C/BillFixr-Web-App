import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDomainAccess, hasDomainAccess } from "@/lib/domainAccess";
import { buildLetterPdf } from "@/lib/letterPdf";

// The appeal letter is the one document on a case that was never a file:
// it lives as text on `cases.appeal_letter_text`, the customer reads it on
// their Active Case screen, and staff could not see it at all — the single
// most important document in the process was the one missing from the
// admin's view of it.
//
// Rendered here with the same builder the customer's download uses, and
// deliberately WITHOUT a watermark: the mark exists to deter a customer
// walking off with a document before paying, which has no meaning for the
// team working the case.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  // Read access is enough to look at a letter — the gate that matters for
  // writing documents is full access, and nothing here writes.
  if (!hasDomainAccess(await getDomainAccess(supabase, "client_data"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, appeal_letter_text")
    .eq("id", id)
    .single();

  if (!caseRow?.appeal_letter_text) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const bytes = await buildLetterPdf(caseRow.appeal_letter_text, null);
  const asAttachment = new URL(request.url).searchParams.get("download") === "1";

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${asAttachment ? "attachment" : "inline"}; filename="appeal-letter-${id.slice(0, 8)}.pdf"`,
      // The letter is editable until it is sent, so a cached copy could
      // show a version that was never the one posted.
      "Cache-Control": "private, no-store",
    },
  });
}
