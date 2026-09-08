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

// Two signed URLs per file: one plain (inline view — browsers render PDFs/images
// natively when opened directly) and one with `download` set, since the
// `download` attribute on an <a> tag is ignored for cross-origin links (the
// signed URL points at the Supabase storage domain) — forcing a real
// Content-Disposition: attachment server-side is the only way to make
// "Download" actually download rather than just open the same result as "View".
async function signDocumentUrls(supabase: SupabaseClient, bucket: string, storagePath: string, filename: string) {
  const [{ data: preview }, { data: download }] = await Promise.all([
    supabase.storage.from(bucket).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS),
    supabase.storage.from(bucket).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, { download: filename }),
  ]);
  return { previewUrl: preview?.signedUrl ?? null, downloadUrl: download?.signedUrl ?? null };
}

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

      const { previewUrl, downloadUrl } = await signDocumentUrls(supabase, "bills", bill.storage_url, bill.filename);

      return {
        id: bill.id,
        filename: bill.filename,
        status: bill.status,
        uploadedAt: bill.uploaded_at,
        isImage: isImageFilename(bill.filename),
        previewUrl,
        downloadUrl,
      };
    }),
  );
}

export type ApplicationDocument = {
  id: string;
  filename: string;
  previewUrl: string | null;
  downloadUrl: string | null;
};

// job_applications.cv_storage_url holds a storage path shaped
// `${jobId}/${Date.now()}-${originalFilename}` (see ApplyForm.tsx) — there's
// no separate filename column, so the original name is recovered by
// stripping the job-id folder and the leading timestamp back off.
function filenameFromCvPath(storagePath: string): string {
  const base = storagePath.split("/").pop() ?? storagePath;
  return base.replace(/^\d+-/, "");
}

export async function getApplicationDocuments(
  supabase: SupabaseClient,
  applications: { id: string; cv_storage_url: string | null }[],
): Promise<ApplicationDocument[]> {
  return Promise.all(
    applications.map(async (application) => {
      if (!application.cv_storage_url) {
        return { id: application.id, filename: "", previewUrl: null, downloadUrl: null };
      }

      const filename = filenameFromCvPath(application.cv_storage_url);
      const { previewUrl, downloadUrl } = await signDocumentUrls(supabase, "cvs", application.cv_storage_url, filename);

      return { id: application.id, filename, previewUrl, downloadUrl };
    }),
  );
}
