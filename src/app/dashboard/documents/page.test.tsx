import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import MyDocumentsPage from "./page";

const mock = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mock.client,
}));
vi.mock("@/lib/billDocuments", () => ({
  getBillDocuments: async (_client: unknown, bills: { id: string }[]) =>
    bills.map((b) => ({ id: b.id, previewUrl: `https://signed/${b.id}`, downloadUrl: null })),
}));

const BILL = {
  id: "bill-1",
  filename: "scan-of-my-bill.png",
  provider_name: "Matthew Walker Comprehensive Health Center",
  storage_url: "u/bill-1.png",
  status: "analyzed",
  uploaded_at: "2026-11-13T20:44:29Z",
};

beforeEach(() => {
  mock.reset();
  mock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

// Asked for on 2026-11-13: "Under my documents should be only the hospital
// bill they uploaded. But now the Analysis is there and Appeal is there."
//
// The analysis and the appeal letter belong to a case and are read from
// it — on Active Case, where they sit beside the case they concern.
describe("My Documents", () => {
  it("lists the bill the customer uploaded", async () => {
    mock.queueResult("bills", { data: [BILL], error: null });

    render(await MyDocumentsPage());

    expect(screen.getByText("Hospital Bill")).toBeInTheDocument();
    // Which file it is, since a customer can upload more than one.
    expect(screen.getByText("scan-of-my-bill.png")).toBeInTheDocument();
    expect(screen.getByText("Matthew Walker Comprehensive Health Center")).toBeInTheDocument();
  });

  it("lists nothing the process produced", async () => {
    mock.queueResult("bills", { data: [BILL], error: null });

    render(await MyDocumentsPage());

    expect(screen.queryByText(/Analysis/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Appeal Letter/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Provider Response/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/New Bill/i)).not.toBeInTheDocument();
  });

  it("reads the customer's own bills rather than walking their cases", async () => {
    // A bill uploaded a moment ago has no case yet. Built off cases, it
    // was invisible until one existed; this is the only screen that can
    // show it in the meantime.
    mock.queueResult("bills", { data: [{ ...BILL, provider_name: null }], error: null });

    render(await MyDocumentsPage());

    expect(screen.getByText("Hospital Bill")).toBeInTheDocument();
    expect(mock.from).toHaveBeenCalledWith("bills");
    expect(mock.from).not.toHaveBeenCalledWith("cases");
    expect(mock.from).not.toHaveBeenCalledWith("case_documents");
  });

  it("says so when there is nothing uploaded", async () => {
    mock.queueResult("bills", { data: [], error: null });

    render(await MyDocumentsPage());

    expect(screen.getByText(/Your documents will appear here/i)).toBeInTheDocument();
  });
});
