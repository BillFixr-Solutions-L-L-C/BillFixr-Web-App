import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AutomationEngineError, uploadHospitalReply } from "@/lib/automation-engine";
import { getDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";
import { isBackendConfigured } from "@/lib/aiStack";
import { syncCaseFromNegotiation } from "@/lib/caseStatusSync";

// A hospital reply that did not arrive in the engine's inbox.
//
// Providers answer disputes on headed paper and by fax, and some ring the
// patient's advocate instead of writing at all. None of that reaches an
// IMAP poller. The engine has had the endpoint for this since 2026-11-10
// — it transcribes the document and runs the same analysis an emailed
// reply gets — and nothing in the web app called it, so a reply on paper
// could not enter the system by any route.
//
// Admin-only: this puts words in the provider's mouth as far as the
// negotiation is concerned, and the engine will act on them.

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"];

type UploadedFile = { name: string; size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> };

function isUploadedFile(value: unknown): value is UploadedFile & Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as UploadedFile).arrayBuffer === "function" &&
    typeof (value as UploadedFile).name === "string" &&
    typeof (value as UploadedFile).size === "number"
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  if (!hasFullDomainAccess(await getDomainAccess(supabase, "negotiation"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isBackendConfigured("automation-engine")) {
    return NextResponse.json({ error: "The negotiation service is unavailable." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Attach the reply as a file, or paste its text." }, { status: 400 });
  }

  const text = String(form.get("text") ?? "").trim();
  const upload = form.get("file");
  // Duck-typed rather than `instanceof File`. The File constructor the
  // request was parsed with is not always the one in this module's scope
  // — different realms give different constructors — and an instanceof
  // that silently answers false here turns every uploaded letter into
  // "nothing was attached".
  const file = isUploadedFile(upload) && upload.size > 0 ? upload : null;

  if (!file && !text) {
    // The engine refuses this too. Checked here as well so the admin gets
    // the answer without a round trip, and because an empty submission
    // used to become an invented sentence the analysis then acted on.
    return NextResponse.json({ error: "Attach the reply as a file, or paste its text." }, { status: 400 });
  }
  if (file && file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is larger than 10MB." }, { status: 413 });
  }
  if (file && !ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "Upload a PDF or a photo of the letter (PNG, JPEG, WEBP or HEIC)." },
      { status: 415 },
    );
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, user_id, status, negotiation_id, savings_found, adjusted_total")
    .eq("id", id)
    .single();
  if (!caseRow) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!caseRow.negotiation_id) {
    return NextResponse.json({ error: "No negotiation has been started for this case." }, { status: 409 });
  }

  let negotiation;
  try {
    negotiation = await uploadHospitalReply(caseRow.negotiation_id, {
      text: text || undefined,
      file: file ? { filename: file.name, bytes: file } : undefined,
    });
  } catch (err) {
    if (err instanceof AutomationEngineError) {
      // The engine's own refusals are the useful answer here: it says
      // when it could not read the document rather than guessing at its
      // contents, and that is exactly what the admin needs to see.
      if (err.status === 404) {
        return NextResponse.json({ error: "The negotiation service has no record of this case." }, { status: 409 });
      }
      if (err.status === 400 || err.status === 502) {
        return NextResponse.json({ error: err.message }, { status: err.status === 400 ? 400 : 502 });
      }
    }
    console.error("Could not submit the hospital reply for case", id, err);
    return NextResponse.json({ error: "We couldn't record the reply. Please try again." }, { status: 502 });
  }

  // The reply may be the thing that moves this case to "the provider
  // responded" — the same reconciliation an emailed reply gets when the
  // case is next read, done now so the customer is told without waiting
  // for the cron.
  try {
    await syncCaseFromNegotiation(createAdminClient(), caseRow, negotiation);
  } catch (err) {
    console.error("Recorded the reply but could not sync case", id, err);
  }

  return NextResponse.json({ status: "success", negotiation });
}
