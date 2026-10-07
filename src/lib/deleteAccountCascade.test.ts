import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseMock } from "@/test/supabaseMock";

const adminMock = createSupabaseMock();
const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (...args: unknown[]) => sendEmail(...args) }));

const { deleteAccountCascade } = await import("./deleteAccountCascade");

const USER_ID = "user-1";

function run() {
  return deleteAccountCascade(adminMock.client as unknown as SupabaseClient, USER_ID);
}

// Queues the reads the cascade performs up front, in order.
function queueReads({ bills = [], docs = [] }: { bills?: string[]; docs?: string[] } = {}) {
  adminMock.queueResult("profiles", { data: { name: "Jane", email: "jane@example.com" }, error: null });
  adminMock.queueResult("cases", { data: [{ id: "case-1" }], error: null });
  adminMock.queueResult("support_tickets", { data: [{ id: "ticket-1" }], error: null });
  adminMock.queueResult("bills", { data: bills.map((storage_url) => ({ storage_url })), error: null });
  adminMock.queueResult("case_documents", { data: docs.map((storage_url) => ({ storage_url })), error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  adminMock.reset();
  adminMock.deleteUser.mockResolvedValue({ error: null });
  adminMock.storageList.mockResolvedValue({ data: [], error: null });
  adminMock.storageRemove.mockResolvedValue({ data: null, error: null });
  sendEmail.mockResolvedValue({ id: "email-1" });
});

describe("deleteAccountCascade", () => {
  it("removes the stored bill and case-document files, not just their rows", async () => {
    queueReads({
      bills: [`${USER_ID}/1-bill.pdf`],
      docs: [`${USER_ID}/case-documents/case-1/2-letter.pdf`],
    });

    await run();

    // Deleting the rows never removed the objects, so every bill and
    // letter survived deletion — while the confirmation email claimed
    // otherwise.
    expect(adminMock.storageRemove).toHaveBeenCalledWith(
      expect.arrayContaining([`${USER_ID}/1-bill.pdf`, `${USER_ID}/case-documents/case-1/2-letter.pdf`]),
    );
  });

  it("sweeps stored files whose row was never written", async () => {
    queueReads();
    // A successful upload whose insert failed leaves a file with nothing
    // pointing at it.
    adminMock.storageList.mockImplementation(async (prefix?: string) => {
      if (prefix === USER_ID) return { data: [{ name: "orphan.pdf", id: "f1" }], error: null };
      return { data: [], error: null };
    });

    await run();

    expect(adminMock.storageRemove).toHaveBeenCalledWith(expect.arrayContaining([`${USER_ID}/orphan.pdf`]));
  });

  it("walks nested storage folders", async () => {
    queueReads();
    adminMock.storageList.mockImplementation(async (prefix?: string) => {
      if (prefix === USER_ID) return { data: [{ name: "case-documents", id: null }], error: null };
      if (prefix === `${USER_ID}/case-documents`) return { data: [{ name: "deep.pdf", id: "f2" }], error: null };
      return { data: [], error: null };
    });

    await run();

    expect(adminMock.storageRemove).toHaveBeenCalledWith(
      expect.arrayContaining([`${USER_ID}/case-documents/deep.pdf`]),
    );
  });

  it("clears the audit pointers that would otherwise block the delete", async () => {
    queueReads();

    await run();

    // cases.manual_review_by and case_documents.created_by have no
    // on-delete rule, so leaving them set made deleteUser fail outright
    // with "Database error deleting user".
    const updates = adminMock.from.mock.results
      .map((r) => r.value.update as ReturnType<typeof vi.fn>)
      .filter((u) => u.mock.calls.length > 0)
      .flatMap((u) => u.mock.calls.map((c) => c[0]));

    expect(updates).toContainEqual({ manual_review_by: null });
    expect(updates).toContainEqual({ created_by: null });
  });

  it("deletes the auth user and confirms by email", async () => {
    queueReads();

    const result = await run();

    expect(adminMock.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "jane@example.com" }));
    expect(result.profileName).toBe("Jane");
  });

  it("does not report a failure when only the confirmation email fails", async () => {
    queueReads();
    sendEmail.mockRejectedValue(new Error("resend down"));

    const result = await run();

    expect(result.error).toBeNull();
  });
});
