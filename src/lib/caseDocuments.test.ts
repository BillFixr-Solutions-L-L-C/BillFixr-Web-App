import { describe, expect, it, vi } from "vitest";
import { buildCaseDocumentRows, formatFileSize, isCaseDocumentType } from "./caseDocuments";
import type { SupabaseClient } from "@supabase/supabase-js";

function supabaseWithSignedUrls(): SupabaseClient {
  return {
    storage: {
      from: () => ({
        createSignedUrl: vi.fn(async (path: string, _ttl: number, opts?: { download?: string }) => ({
          data: { signedUrl: `https://signed/${path}${opts?.download ? "?dl" : ""}` },
        })),
      }),
    },
  } as unknown as SupabaseClient;
}

const BASE = {
  bill: { filename: "bill.pdf", storage_url: "u/bill.pdf", uploaded_at: "2026-07-14T00:00:00Z" },
  appealLetterText: "Dear Billing,",
  letterSentAt: "2026-07-20T00:00:00Z",
  hasAnalysis: true,
  analysisDate: "2026-07-15T00:00:00Z",
  stored: [],
};

describe("isCaseDocumentType", () => {
  it("accepts only the four provider document types", () => {
    expect(isCaseDocumentType("new_bill")).toBe(true);
    expect(isCaseDocumentType("follow_up_letter")).toBe(true);
    expect(isCaseDocumentType("original_bill")).toBe(false);
    expect(isCaseDocumentType(7)).toBe(false);
  });
});

describe("formatFileSize", () => {
  it("formats bytes, kb and mb, and returns null when unknown", () => {
    expect(formatFileSize(512)).toBe("512b");
    expect(formatFileSize(210_000)).toBe("205kb");
    expect(formatFileSize(2_500_000)).toBe("2.4mb");
    expect(formatFileSize(null)).toBeNull();
    expect(formatFileSize(0)).toBeNull();
  });
});

describe("buildCaseDocumentRows", () => {
  it("lists every row from the design, in order", async () => {
    const rows = await buildCaseDocumentRows(supabaseWithSignedUrls(), BASE);
    // Chronological: the analysis produces the letter, the provider
    // responds to it, and the corrected bill arrives last.
    expect(rows.map((r) => r.label)).toEqual([
      "bill.pdf",
      "Analysis Generated",
      "Appeal Letter",
      "Provider Responses",
      "Acknowledgement Letter",
      "Follow Up Letter",
      "New Bill",
    ]);
  });

  it("marks documents that don't exist yet as unavailable with no link", async () => {
    const rows = await buildCaseDocumentRows(supabaseWithSignedUrls(), BASE);
    const newBill = rows.find((r) => r.label === "New Bill")!;
    expect(newBill.available).toBe(false);
    expect(newBill.previewUrl).toBeNull();
    expect(newBill.date).toBeNull();
  });

  it("serves uploaded provider documents through our own route, so they can be watermarked", async () => {
    const rows = await buildCaseDocumentRows(supabaseWithSignedUrls(), {
      ...BASE,
      stored: [
        {
          id: "doc-1",
          type: "provider_response",
          filename: "response.pdf",
          storage_url: "u/case-documents/c1/response.pdf",
          size_bytes: 210_000,
          received_on: "2026-08-02",
          created_at: "2026-08-03T00:00:00Z",
        },
      ],
    });
    const row = rows.find((r) => r.label === "Provider Responses")!;
    expect(row.available).toBe(true);
    // Not a signed storage URL any more: the bytes have to pass through
    // us to carry a watermark while the case is in progress.
    expect(row.previewUrl).toBe("/api/dashboard/case-documents/doc-1");
    expect(row.downloadUrl).toBe("/api/dashboard/case-documents/doc-1?download=1");
    expect(row.sizeLabel).toBe("205kb");
    expect(row.date).toBe("2026-08-02");
  });

  it("marks the appeal letter and analysis unavailable when the case has neither", async () => {
    const rows = await buildCaseDocumentRows(supabaseWithSignedUrls(), {
      ...BASE,
      appealLetterText: null,
      hasAnalysis: false,
    });
    expect(rows.find((r) => r.label === "Appeal Letter")!.available).toBe(false);
    expect(rows.find((r) => r.label === "Analysis Generated")!.available).toBe(false);
  });

  it("omits the bill row entirely when the case has no bill", async () => {
    const rows = await buildCaseDocumentRows(supabaseWithSignedUrls(), { ...BASE, bill: null });
    expect(rows.some((r) => r.label === "bill.pdf")).toBe(false);
    expect(rows[0].label).toBe("Analysis Generated");
  });
});

describe("buildCaseDocumentRows for staff", () => {
  const STORED = {
    id: "doc-1",
    type: "provider_response",
    filename: "response.pdf",
    storage_url: "u/case-documents/c1/response.pdf",
    size_bytes: 2048,
    received_on: null,
    created_at: "2026-07-25T00:00:00Z",
  };

  it("signs stored documents instead of routing them through the customer's watermarker", async () => {
    // The customer's route stamps anything taken before the case is paid
    // for. Staff reading the file they were sent must not get that mark.
    const rows = await buildCaseDocumentRows(supabaseWithSignedUrls(), {
      ...BASE,
      stored: [STORED],
      signStored: true,
    });
    const row = rows.find((r) => r.id === "doc-1")!;
    expect(row.previewUrl).toBe(`https://signed/${STORED.storage_url}`);
    expect(row.downloadUrl).toBe(`https://signed/${STORED.storage_url}?dl`);
  });

  it("still uses the watermarking route for the customer", async () => {
    const rows = await buildCaseDocumentRows(supabaseWithSignedUrls(), { ...BASE, stored: [STORED] });
    const row = rows.find((r) => r.id === "doc-1")!;
    expect(row.previewUrl).toBe("/api/dashboard/case-documents/doc-1");
  });

  it("makes the appeal letter openable when given somewhere to serve it from", async () => {
    const rows = await buildCaseDocumentRows(supabaseWithSignedUrls(), {
      ...BASE,
      appealLetterUrl: "/api/admin/cases/c1/appeal-letter",
    });
    const row = rows.find((r) => r.id === "appeal-letter")!;
    expect(row.previewUrl).toBe("/api/admin/cases/c1/appeal-letter");
    expect(row.downloadUrl).toBe("/api/admin/cases/c1/appeal-letter?download=1");
  });

  it("does not link an appeal letter that has not been written", async () => {
    // A link here would open a 404 and read as a missing file rather than
    // a letter that does not exist yet.
    const rows = await buildCaseDocumentRows(supabaseWithSignedUrls(), {
      ...BASE,
      appealLetterText: null,
      appealLetterUrl: "/api/admin/cases/c1/appeal-letter",
    });
    const row = rows.find((r) => r.id === "appeal-letter")!;
    expect(row.available).toBe(false);
    expect(row.previewUrl).toBeNull();
    expect(row.downloadUrl).toBeNull();
  });

  it("shows the real filename to staff and not to the customer", async () => {
    const forStaff = await buildCaseDocumentRows(supabaseWithSignedUrls(), {
      ...BASE,
      stored: [STORED],
      signStored: true,
      showFilenames: true,
    });
    expect(forStaff.find((r) => r.id === "doc-1")!.sublabel).toBe("response.pdf");

    const forCustomer = await buildCaseDocumentRows(supabaseWithSignedUrls(), { ...BASE, stored: [STORED] });
    expect(forCustomer.find((r) => r.id === "doc-1")!.sublabel).toBeNull();
  });
});
