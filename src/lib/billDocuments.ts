import type { SupabaseClient } from "@supabase/supabase-js";

const SIGNED_URL_TTL_SECONDS = 3600;

export type BillDocument = {
  id: string;
  filename: string;
  status: string;
  uploadedAt: string;
  isImage: boolean;
  previewUrl: string | null;
  downloadUrl: string | null;
};

function isImageFilename(filename: string) {
  return /\.(png|jpe?g|gif|webp)$/i.test(filename);
}

// Two signed URLs per bill: one plain (inline view — browsers render PDFs/images
// natively when opened directly) and one with `download` set, since the
// `download` attribute on an <a> tag is ignored for cross-origin links (the
// signed URL points at the Supabase storage domain) — forcing a real
// Content-Disposition: attachment server-side is the only way to make
// "Download" actually download rather than just open the same result as "View".
export async function getBillDocuments(
  supabase: SupabaseClient,
  bills: { id: string; filename: string; storage_url: string | null; status: string; uploaded_at: string }[],
): Promise<BillDocument[]> {
  return Promise.all(
    bills.map(async (bill) => {
      if (!bill.storage_url) {
        return {
          id: bill.id,
          filename: bill.filename,
          status: bill.status,
          uploadedAt: bill.uploaded_at,
          isImage: false,
          previewUrl: null,
          downloadUrl: null,
        };
      }

      const [{ data: preview }, { data: download }] = await Promise.all([
        supabase.storage.from("bills").createSignedUrl(bill.storage_url, SIGNED_URL_TTL_SECONDS),
        supabase.storage.from("bills").createSignedUrl(bill.storage_url, SIGNED_URL_TTL_SECONDS, {
          download: bill.filename,
        }),
      ]);

      return {
        id: bill.id,
        filename: bill.filename,
        status: bill.status,
        uploadedAt: bill.uploaded_at,
        isImage: isImageFilename(bill.filename),
        previewUrl: preview?.signedUrl ?? null,
        downloadUrl: download?.signedUrl ?? null,
      };
    }),
  );
}
