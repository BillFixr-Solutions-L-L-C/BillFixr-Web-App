import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AutomationEngineTimeoutError,
  extractBill,
  getAutomationEngineConfig,
} from "@/lib/automation-engine";
import { isEngineExtraction } from "@/lib/engineBillData";
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
export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const { data: fileBlob, error: downloadError } = await admin.storage.from("bills").download(bill.storage_url);
    if (downloadError || !fileBlob) {
      console.error("bill download failed for bill", id, downloadError);
      return NextResponse.json(
        { error: "failed to load the stored bill file", fields: null, stage: "bill_download" },
        { status: 500 },
      );
    }
    try {
      extraction = await extractBill({
        filename: bill.filename,
        bytes: new Blob([await fileBlob.arrayBuffer()], { type: guessContentType(bill.filename) }),
      });
    } catch (err) {
      console.error("Engine extraction failed for bill", id, err);
      // A timeout is worth saying out loud: the customer is waiting on this
      // one, and "try again" is genuinely the right advice for it, which it
      // is not for a document we cannot read.
      if (err instanceof AutomationEngineTimeoutError) {
        return NextResponse.json(
          {
            error: "Reading this document took too long and was stopped. Please try again.",
            fields: null,
            stage: "extract_timeout",
          },
          { status: 504 },
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
