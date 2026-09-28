import type { SupabaseClient } from "@supabase/supabase-js";

// The document list on a case (Figma "Completed Case" detail). Three rows
// are derived from data the app already holds — the uploaded bill, the
// appeal letter and the analysis — and the rest are real files staff
// upload into case_documents as the provider sends them.

export const CASE_DOCUMENT_TYPES = [
  "new_bill",
  "acknowledgement_letter",
  "provider_response",
  "follow_up_letter",
] as const;

export type CaseDocumentType = (typeof CASE_DOCUMENT_TYPES)[number];

export const CASE_DOCUMENT_LABELS: Record<CaseDocumentType, string> = {
  new_bill: "New Bill",
  acknowledgement_letter: "Acknowledgement Letter",
  provider_response: "Provider Responses",
  follow_up_letter: "Follow Up Letter",
};

// Order the rows appear in, matching the Figma frame.
const TYPE_ORDER: CaseDocumentType[] = [
  "new_bill",
  "acknowledgement_letter",
  "provider_response",
  "follow_up_letter",
];

export type CaseDocumentRow = {
  id: string;
  label: string;
  status: "Uploaded" | "Sent" | "Generated";
  date: string | null;
  sizeLabel: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
  // Rows the case hasn't produced yet still render, greyed out, so the
  // customer can see what the process will produce.
  available: boolean;
};

export function isCaseDocumentType(value: unknown): value is CaseDocumentType {
  return typeof value === "string" && (CASE_DOCUMENT_TYPES as readonly string[]).includes(value);
}

// Figma shows a size under each document. Only stored files have one —
// derived rows (appeal letter, analysis) aren't files, so they show none
// rather than a made-up number.
export function formatFileSize(bytes: number | null | undefined): string | null {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes}b`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
}

const SIGNED_URL_TTL_SECONDS = 3600;

async function sign(supabase: SupabaseClient, path: string, filename: string) {
  const [{ data: preview }, { data: download }] = await Promise.all([
    supabase.storage.from("bills").createSignedUrl(path, SIGNED_URL_TTL_SECONDS),
    supabase.storage.from("bills").createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: filename }),
  ]);
  return { previewUrl: preview?.signedUrl ?? null, downloadUrl: download?.signedUrl ?? null };
}

export type CaseDocumentSource = {
  bill: { filename: string; storage_url: string | null; uploaded_at: string } | null;
  appealLetterText: string | null;
  letterSentAt: string | null;
  hasAnalysis: boolean;
  analysisDate: string | null;
  stored: {
    id: string;
    type: string;
    filename: string;
    storage_url: string;
    size_bytes: number | null;
    received_on: string | null;
    created_at: string;
  }[];
};

export async function buildCaseDocumentRows(
  supabase: SupabaseClient,
  source: CaseDocumentSource,
): Promise<CaseDocumentRow[]> {
  const rows: CaseDocumentRow[] = [];

  if (source.bill) {
    const signed = source.bill.storage_url
      ? await sign(supabase, source.bill.storage_url, source.bill.filename)
      : { previewUrl: null, downloadUrl: null };
    rows.push({
      id: "original-bill",
      label: source.bill.filename,
      status: "Uploaded",
      date: source.bill.uploaded_at,
      sizeLabel: null,
      ...signed,
      available: Boolean(signed.previewUrl),
    });
  }

  rows.push({
    id: "appeal-letter",
    label: "Appeal Letter",
    status: "Sent",
    date: source.letterSentAt,
    sizeLabel: null,
    previewUrl: null,
    downloadUrl: null,
    available: Boolean(source.appealLetterText),
  });

  rows.push({
    id: "analysis",
    label: "Analysis Generated",
    status: "Generated",
    date: source.analysisDate,
    sizeLabel: null,
    previewUrl: null,
    downloadUrl: null,
    available: source.hasAnalysis,
  });

  for (const type of TYPE_ORDER) {
    const stored = source.stored.find((d) => d.type === type);
    if (!stored) {
      rows.push({
        id: `pending-${type}`,
        label: CASE_DOCUMENT_LABELS[type],
        status: "Sent",
        date: null,
        sizeLabel: null,
        previewUrl: null,
        downloadUrl: null,
        available: false,
      });
      continue;
    }
    const signed = await sign(supabase, stored.storage_url, stored.filename);
    rows.push({
      id: stored.id,
      label: CASE_DOCUMENT_LABELS[type],
      status: "Sent",
      date: stored.received_on ?? stored.created_at,
      sizeLabel: formatFileSize(stored.size_bytes),
      ...signed,
      available: Boolean(signed.previewUrl),
    });
  }

  return rows;
}
