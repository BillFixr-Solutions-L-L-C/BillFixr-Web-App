import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AutomationEngineError,
  AutomationEngineTimeoutError,
  extractBill,
  getAutomationEngineConfig,
  wakeAutomationEngine,
} from "@/lib/automation-engine";
import { isEngineExtraction } from "@/lib/engineBillData";
import { engineRetryDelayMs } from "@/lib/engineRetry";
import { guessContentType } from "@/lib/contentType";
import type { EngineExtraction } from "@/types/automation-engine";

// Reads the identifying fields off the uploaded bill so the information
// step can fill itself in.
//
// The automation engine reads the bill, as of 2026-11-10. It used to be the
// ai-service, which ran the page through tesseract and sent only the
// resulting *text* to a model — so a photographed bill arrived as garbled
// characters, and in one production case as an empty string, and the form
// came back blank. The engine sends the page images to a vision model and
// has done all along; it was simply never asked. See
// src/lib/automation-engine.ts extractBill().
//
// Only the identifying fields are ever returned from here. The full
// reading, including the line items and CPT codes behind the audit, is
// parked in bill_extractions.engine_result (service-role only) and stays
// behind the commitment fee — the negotiation start reuses it rather than
// paying for a second reading.
//
// Same reason as the analysis route: a vision-model call behind a free-tier
// cold start. Stated here rather than inherited from a platform default
// that is invisible from the repo.
//
// 300 is the Hobby maximum as well as its default, so this is the whole
// budget the plan allows, not an aspiration.
export const maxDuration = 300;

// What this handler may spend in total, kept under maxDuration so the
// last thing to happen is our own answer rather than the platform killing
// the request without one.
const BUDGET_MS = 280_000;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: bill } = await supabase
    .from("bills")
    .select("id, user_id, filename, storage_url, provider_name, provider_email, provider_phone, provider_address, service_date, statement_date")
    .eq("id", id)
    .single();
  if (!bill || bill.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!bill.storage_url) {
    return NextResponse.json({ error: "This bill has no stored file." }, { status: 400 });
  }
  if (!getAutomationEngineConfig()) {
    // Customer-facing wording: "not configured" is our problem, not
    // something they can act on. The step still works by hand.
    console.warn("Bill extraction requested but AUTOMATION_ENGINE_BASE_URL is not set");
    return NextResponse.json(
      { error: "Automatic reading isn't available right now — please fill these in yourself.", fields: null },
      { status: 503 },
    );
  }

  const admin = createAdminClient();

  // Reuse an earlier reading of the same document rather than re-paying.
  // Only the engine's own reading counts as a hit: a row holding just the
  // ai-service's older reading is the blank-form case this route was
  // changed to fix, so it is re-read rather than served again.
  const { data: cached } = await admin
    .from("bill_extractions")
    .select("engine_result")
    .eq("bill_id", id)
    .maybeSingle();

  let extraction: EngineExtraction | undefined = isEngineExtraction(cached?.engine_result)
    ? (cached.engine_result as EngineExtraction)
    : undefined;

  if (!extraction) {
    // Nudge the engine, but do not let its answer decide anything.
    //
    // On Render's free tier it spins down when idle, so the first read
    // after a quiet spell finds it asleep and this call is what starts
    // the boot. Waiting for that here is worth it: by the time we read,
    // the engine is usually up.
    //
    // What this must NOT do is refuse to read when the health check
    // fails. It used to, and that was the second version of the same
    // mistake. The host in front of the engine sheds requests
    // independently of whether the engine can work, so a shed health
    // check says nothing about the document -- and a run against
    // production on 2026-11-25 produced three shed health checks in a
    // row, each answered in about a second, so the step gave up without
    // ever asking the engine to read a bill it would very likely have
    // read. The read is the only authoritative test, it already retries
    // a shed, and it is what the customer is waiting for.
    //
    // The verdict is logged because a persistently cold engine is worth
    // seeing in the logs, not because it changes what happens next.
    if (!(await wakeAutomationEngine())) {
      console.warn(`Engine health check did not answer before reading bill ${id}; reading anyway`);
    }

    const { data: fileBlob, error: downloadError } = await admin.storage.from("bills").download(bill.storage_url);
    if (downloadError || !fileBlob) {
      console.error("bill download failed for bill", id, downloadError);
      return NextResponse.json(
        { error: "failed to load the stored bill file", fields: null, stage: "bill_download" },
        { status: 500 },
      );
    }
    // Read the bytes once: the retry loop below may send them more than
    // once, and re-downloading each time would charge the customer's wait
    // for a file we already hold.
    const bytes = await fileBlob.arrayBuffer();
    const contentType = guessContentType(bill.filename);

    // Retried, because the common failure here is not the document.
    //
    // The engine runs as a single worker on a free instance, and the host
    // in front of it sheds a request with a 503 and an empty body when
    // that worker is already busy. Measured against production on
    // 2026-11-25: roughly one read in five came back that way, after
    // which this route told the customer "We couldn't read this
    // document" -- about a document the engine reads correctly every
    // other time -- and the information step gave up and showed a blank
    // form. That is the intermittent autofill failure as reported.
    //
    // The shed arrives in about a second, so a couple of retries are
    // cheap and the customer never learns it happened. A document we
    // genuinely cannot read fails differently and is not retried.
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Every attempt is bounded by what is left of the request, not by
      // the engine client's own timeout. Waiting for the boot above can
      // eat 30s, and a read that starts with its full 240s budget at
      // that point would be killed by the platform mid-call -- which is
      // the failure mode that leaves no answer at all, just a dead
      // screen. Short of room for a read, stop and say so instead.
      const remaining = BUDGET_MS - (Date.now() - startedAt);
      if (remaining < 20_000) {
        lastError ??= new AutomationEngineTimeoutError("/api/extract", 0);
        break;
      }
      try {
        extraction = await extractBill({
          filename: bill.filename,
          bytes: new Blob([bytes], { type: contentType }),
          timeoutMs: remaining,
        });
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        if (!isEngineUnavailable(err)) break;
        console.warn(`Engine shed the read for bill ${id} (attempt ${attempt + 1}), retrying`);
        await new Promise((resolve) => setTimeout(resolve, engineRetryDelayMs(attempt)));
      }
    }

    if (lastError) {
      console.error("Engine extraction failed for bill", id, lastError);
      // A timeout is worth saying out loud: the customer is waiting on this
      // one, and "try again" is genuinely the right advice for it, which it
      // is not for a document we cannot read.
      if (lastError instanceof AutomationEngineTimeoutError) {
        return NextResponse.json(
          {
            error: "Reading this document took too long and was stopped. Please try again.",
            fields: null,
            stage: "extract_timeout",
          },
          { status: 504 },
        );
      }
      // Still unavailable after the retries. "We couldn't read this
      // document" would be a lie about the document, and it is the lie
      // that made this look like a parsing problem for days.
      if (isEngineUnavailable(lastError)) {
        return NextResponse.json(
          {
            error: "The reader is busy right now. Give it a moment and we'll try again.",
            fields: null,
            stage: "engine_busy",
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: "We couldn't read this document.", fields: null, stage: "extract_failed" },
        { status: 502 },
      );
    }

    // A 200 carrying something that is not a reading is still a failure,
    // and one that must not be cached — otherwise every later attempt is
    // served the same empty answer without re-reading the document.
    if (!isEngineExtraction(extraction)) {
      console.error("Engine returned no usable extraction for bill", id);
      return NextResponse.json(
        { error: "We couldn't read this document.", fields: null, stage: "extract_empty" },
        { status: 502 },
      );
    }

    // Merged into the row rather than replacing it: `result` may hold the
    // ai-service reading that /api/dev/process-with-ai reads its analysis
    // and draft out of, and that is not ours to discard.
    const { error: cacheError } = await admin
      .from("bill_extractions")
      .upsert({ bill_id: id, engine_result: extraction }, { onConflict: "bill_id" });
    if (cacheError) {
      // Not fatal: the customer gets their fields, we just pay to read it
      // again later. Worth a log line, because paying twice is the symptom.
      console.error("Could not cache the engine reading for bill", id, cacheError);
    }
  }

  const found = {
    provider_name: str(extraction.provider_name),
    provider_email: str(extraction.provider_email),
    provider_phone: str(extraction.provider_phone),
    provider_address: str(extraction.provider_address),
    service_date: str(extraction.date_of_service),
    statement_date: str(extraction.statement_date),
  };

  // Never overwrite something the customer has already typed.
  const merged = {
    provider_name: bill.provider_name ?? found.provider_name,
    provider_email: bill.provider_email ?? found.provider_email,
    provider_phone: bill.provider_phone ?? found.provider_phone,
    provider_address: bill.provider_address ?? found.provider_address,
    service_date: bill.service_date ?? found.service_date,
    statement_date: bill.statement_date ?? found.statement_date,
  };
  const { error: updateError } = await admin.from("bills").update(merged).eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Keyed by the form's own field names so a single field's "Search by AI"
  // can pick out just the one it needs.
  //
  // Patient details are handed back for the form but not persisted here —
  // the account's own name/address shouldn't be silently rewritten from a
  // document; that only happens when the customer saves the step.
  //
  // supportEmail has no counterpart in the reading (a bill carries one
  // provider contact), so it stays empty here and is filled by the
  // hospital lookup instead.
  return NextResponse.json({
    ok: true,
    fields: {
      clientName: str(extraction.patient_name) ?? "",
      address: str(extraction.patient_address) ?? "",
      hospitalName: merged.provider_name ?? "",
      billingManagerEmail: merged.provider_email ?? "",
      hospitalAddress: merged.provider_address ?? "",
      supportEmail: "",
      billingPhone: merged.provider_phone ?? "",
    },
  });
}

// The engine's reading is a vision model filling a shape described in a
// prompt, so a field it did not find can come back absent, null, or as the
// prompt's own "string" placeholder. All three mean the same thing, and
// none of them should reach a form field or a bills column.
//
// Null rather than "" on the way into `bills`: the columns are nullable and
// `bill.provider_name ?? found.provider_name` has to be able to tell "not
// found" from a value, or an empty string would count as something typed
// and block the next reading from filling it.
const PLACEHOLDERS = new Set(["string", "null", "n/a", "na", "none", "unknown", "yyyy-mm-dd"]);

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || PLACEHOLDERS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

// Whether a failed engine call means "the engine is not serving right now"
// rather than "this document cannot be read".
//
// 5xx and 429 are the engine or the host in front of it, not the file. The
// 503-with-an-empty-body shed by a busy free-tier worker is the one that
// matters in practice; 429 is the same host's rate limit under a burst.
// Anything else -- a 400 about the upload, a 422 about the shape -- is
// about the request and will fail again identically.
function isEngineUnavailable(err: unknown): boolean {
  return err instanceof AutomationEngineError && (err.status === 429 || err.status >= 500);
}

