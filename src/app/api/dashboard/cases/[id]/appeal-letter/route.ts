import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildLetterPdf } from "@/lib/letterPdf";
import { isCaseCompleted } from "@/lib/caseStatus";

export const MAX_LETTER_LENGTH = 20000;

// Opening the letter as a document.
//
// Until 2026-11-18 this route only had PATCH, so a customer could edit
// their appeal letter but never open it. The admin side has had a GET all
// along. The Active Case document list therefore had an "Appeal Letter"
// row with no link on it, and the only way to read the letter was to open
// the analysis -- the AI-generated document -- and find it as a card
// inside. Reported by Segun: "appeal letter is under AI generated docs
// instead of appeal letter."
//
// Watermarked while the case is still running, for the same reason the
// rest of the customer's documents are: the mark deters walking off with
// a document before the work is paid for. Once the case is completed it
// comes off, exactly as it does everywhere else.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    .select("id, user_id, status, appeal_letter_text")
    .eq("id", id)
    .single();

  // One answer for "no such case" and "not yours", as everywhere else:
  // an id that is not yours should not be distinguishable from one that
  // does not exist.
  if (!caseRow || caseRow.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!caseRow.appeal_letter_text) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const bytes = await buildLetterPdf(
    caseRow.appeal_letter_text,
    isCaseCompleted(caseRow.status) ? null : "BillFixr",
  );
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

// Customers have no UPDATE path on cases under RLS (status and the AI
// columns must stay server-controlled), so saving an edited letter goes
// through here: ownership is checked with the session client, then only
// this one column is written with the service role.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text } = await request.json();

  if (typeof text !== "string" || !text.trim() || text.length > MAX_LETTER_LENGTH) {
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
    .select("id, user_id, letter_sent_at")
    .eq("id", id)
    .single();
  if (!caseRow || caseRow.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (caseRow.letter_sent_at) {
    return NextResponse.json({ error: "letter already sent" }, { status: 409 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("cases").update({ appeal_letter_text: text }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
