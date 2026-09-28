import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";
import { isCaseDocumentType } from "@/lib/caseDocuments";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

// Duck-typed rather than `instanceof File`: the File that comes back from
// request.formData() is constructed by undici, which is a different realm
// from any other File the process may hold, so instanceof can be false for
// a perfectly good upload.
function isUploadedFile(value: FormDataEntryValue | null): value is File {
  if (typeof value !== "object" || value === null) return false;
  const f = value as File;
  return typeof f.size === "number" && typeof f.type === "string" && typeof f.name === "string";
}

// Staff upload the documents that arrive from the provider (new bill,
// acknowledgement, provider response, follow-up letter). Files go into the
// customer's own folder in the existing `bills` bucket, so the bucket's
// read policy already lets that customer — and only that customer — see
// them alongside their bill.
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
  if (!hasFullDomainAccess(await getDomainAccess(supabase, "client_data"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const type = form.get("type");
  const file = form.get("file");
  const receivedOn = form.get("receivedOn");

  if (!isCaseDocumentType(type)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  if (!isUploadedFile(file) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large (max 10MB)." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PDF, PNG and JPEG files are supported." }, { status: 400 });
  }
  if (receivedOn !== null && typeof receivedOn === "string" && receivedOn && !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { data: caseRow } = await supabase.from("cases").select("id, user_id").eq("id", id).single();
  if (!caseRow) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
  const path = `${caseRow.user_id}/case-documents/${id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await admin.storage
    .from("bills")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: inserted, error: insertError } = await admin
    .from("case_documents")
    .insert({
      case_id: id,
      user_id: caseRow.user_id,
      type,
      filename: file.name,
      storage_url: path,
      size_bytes: file.size,
      received_on: typeof receivedOn === "string" && receivedOn ? receivedOn : null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insertError) {
    // Don't leave an orphaned object behind if the row didn't land.
    await admin.storage.from("bills").remove([path]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: actor } = await supabase.from("profiles").select("name").eq("id", user.id).single();
  await admin.from("admin_activity_log").insert({
    actor_id: user.id,
    actor_name: actor?.name ?? "Admin",
    action: "uploaded_case_document",
    target_id: id,
    target_name: file.name,
  });

  return NextResponse.json({ ok: true, id: inserted.id });
}
