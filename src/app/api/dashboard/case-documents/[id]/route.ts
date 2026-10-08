import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCaseCompleted } from "@/lib/caseStatus";
import { watermarkDocument } from "@/lib/watermarkDocument";

// Case documents used to be handed out as signed storage URLs, which meant
// the bytes never passed through us and could not carry a watermark — the
// only mark was WatermarkOverlay, which is CSS on the screen and survives
// neither a download nor a screenshot. Serving them here lets a document
// taken away before the case completes carry the mark inside the file.
//
// The customer's own uploaded bill is deliberately NOT routed through
// here: it is their document, they already have it, and stamping it would
// protect nothing.

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function contentTypeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Read as the user, so RLS decides whether this document is theirs
  // rather than this route trying to remember the rule.
  const { data: doc } = await supabase
    .from("case_documents")
    .select("id, filename, storage_url, user_id, cases(status)")
    .eq("id", id)
    .single();

  if (!doc || doc.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const caseRow = Array.isArray(doc.cases) ? doc.cases[0] : doc.cases;
  const inProgress = !caseRow || !isCaseCompleted(caseRow.status);

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from("bills").download(doc.storage_url);
  if (error || !blob) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const original = new Uint8Array(await blob.arrayBuffer());
  const sourceType = contentTypeFor(doc.filename);

  const file = inProgress
    ? await watermarkDocument(original, sourceType, doc.filename)
    : { bytes: original, contentType: sourceType, filename: doc.filename };

  const asAttachment = new URL(request.url).searchParams.get("download") === "1";
  const disposition = asAttachment ? "attachment" : "inline";

  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${disposition}; filename="${file.filename.replace(/"/g, "")}"`,
      // Watermarking depends on case status, which changes — never let a
      // shared cache keep serving the marked copy after completion.
      "Cache-Control": "private, no-store",
    },
  });
}
