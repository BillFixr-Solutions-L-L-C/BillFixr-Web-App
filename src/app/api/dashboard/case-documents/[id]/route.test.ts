import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => serverMock.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminMock.client }));

const { GET } = await import("./route");

const USER = { id: "user-1" };
const PARAMS = { params: Promise.resolve({ id: "doc-1" }) };

function makeRequest(download = false) {
  return new Request(`http://localhost:3000/api/dashboard/case-documents/doc-1${download ? "?download=1" : ""}`);
}

async function pdfBlob(pages = 1) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([400, 600]);
  const bytes = await pdf.save();
  return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

function queueDoc(status: string) {
  serverMock.queueResult("case_documents", {
    data: {
      id: "doc-1",
      filename: "letter.pdf",
      storage_url: "user-1/case-documents/case-1/letter.pdf",
      user_id: USER.id,
      cases: { status },
    },
    error: null,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
  serverMock.getUser.mockResolvedValue({ data: { user: USER } });
  adminMock.storageDownload.mockResolvedValue({ data: await pdfBlob(), error: null });
});

describe("GET /api/dashboard/case-documents/[id]", () => {
  it("refuses an unauthenticated request", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest(), PARAMS);
    expect(res.status).toBe(401);
  });

  it("refuses a document belonging to someone else", async () => {
    serverMock.queueResult("case_documents", {
      data: { id: "doc-1", filename: "x.pdf", storage_url: "p", user_id: "someone-else", cases: { status: "paid" } },
      error: null,
    });
    const res = await GET(makeRequest(), PARAMS);
    expect(res.status).toBe(404);
  });

  it("watermarks the file while the case is still in progress", async () => {
    queueDoc("scanning");
    const plain = await (await pdfBlob()).arrayBuffer();

    const res = await GET(makeRequest(), PARAMS);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const served = await res.arrayBuffer();
    // The mark is inside the bytes, not an overlay on the page.
    expect(served.byteLength).toBeGreaterThan(plain.byteLength);
  });

  it("serves the untouched file once the case is completed", async () => {
    queueDoc("paid");
    const plain = await (await pdfBlob()).arrayBuffer();

    const res = await GET(makeRequest(), PARAMS);

    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(plain.byteLength);
  });

  it("serves inline by default and as an attachment on request", async () => {
    queueDoc("paid");
    const inline = await GET(makeRequest(), PARAMS);
    expect(inline.headers.get("content-disposition")).toContain("inline");

    queueDoc("paid");
    adminMock.storageDownload.mockResolvedValue({ data: await pdfBlob(), error: null });
    const attached = await GET(makeRequest(true), PARAMS);
    expect(attached.headers.get("content-disposition")).toContain('attachment; filename="letter.pdf"');
  });

  it("never lets a shared cache hold the watermarked copy", async () => {
    queueDoc("scanning");
    const res = await GET(makeRequest(), PARAMS);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("404s when the stored file is gone", async () => {
    queueDoc("scanning");
    adminMock.storageDownload.mockResolvedValue({ data: null, error: { message: "not found" } });
    const res = await GET(makeRequest(), PARAMS);
    expect(res.status).toBe(404);
  });
});
