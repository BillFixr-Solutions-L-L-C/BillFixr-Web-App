import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiServiceConfig, processCase } from "@/lib/ai-service";
import { guessContentType } from "@/lib/contentType";
import type { AiCaseProcessingResponse } from "@/types/ai";

// Reads the identifying fields off the uploaded bill so the information
// step can fill itself in.
//
// Only the identifying fields are ever returned or persisted here. The
// audit findings, savings and drafted letter in the same AI response are
// parked in bill_extractions (service-role only) and stay behind the
// commitment fee — process-with-ai reuses them afterwards rather than
// paying for a second call.
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
  if (!getAiServiceConfig()) {
    // The step still works by hand; it just can't prefill.
    return NextResponse.json({ error: "AI service is not configured.", fields: null }, { status: 503 });
  }

  const admin = createAdminClient();

  // Reuse an earlier reading of the same document rather than re-paying.
  const { data: cached } = await admin.from("bill_extractions").select("result").eq("bill_id", id).maybeSingle();
  let result = cached?.result as AiCaseProcessingResponse | undefined;

  if (!result) {
    const { data: fileBlob, error: downloadError } = await admin.storage.from("bills").download(bill.storage_url);
    if (downloadError || !fileBlob) {
      return NextResponse.json({ error: "failed to load the stored bill file" }, { status: 500 });
    }
    try {
      result = await processCase(id, {
        filename: bill.filename,
        bytes: new Blob([await fileBlob.arrayBuffer()], { type: guessContentType(bill.filename) }),
      });
    } catch (err) {
      console.error("AI extraction failed for bill", id, err);
      return NextResponse.json({ error: "We couldn't read this document.", fields: null }, { status: 502 });
    }
    await admin.from("bill_extractions").upsert({ bill_id: id, result });
  }

  const extraction = result.processed_documents[0]?.extraction;
  if (!extraction) {
    return NextResponse.json({ error: "We couldn't read this document.", fields: null }, { status: 502 });
  }

  // Never overwrite something the customer has already typed.
  const merged = {
    provider_name: bill.provider_name ?? extraction.provider.name,
    provider_email: bill.provider_email ?? extraction.provider.email,
    provider_phone: bill.provider_phone ?? extraction.provider.phone,
    provider_address: bill.provider_address ?? extraction.provider.address,
    service_date: bill.service_date ?? extraction.date_of_service_start,
    statement_date: bill.statement_date ?? extraction.statement_date,
  };
  const { error: updateError } = await admin.from("bills").update(merged).eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    fields: {
      hospitalName: merged.provider_name ?? "",
      billingManagerEmail: merged.provider_email ?? "",
      hospitalAddress: merged.provider_address ?? "",
      billingPhone: merged.provider_phone ?? "",
    },
  });
}
