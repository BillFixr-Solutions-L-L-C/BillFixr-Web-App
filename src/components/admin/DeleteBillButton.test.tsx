import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeleteBillButton from "./DeleteBillButton";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("DeleteBillButton", () => {
  it("renders nothing when canDelete is false", () => {
    render(<DeleteBillButton billId="b1" filename="bill.pdf" canDelete={false} />);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("shows the Delete button when canDelete is true, with no modal until clicked", () => {
    render(<DeleteBillButton billId="b1" filename="bill.pdf" canDelete />);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yes, Delete Bill" })).not.toBeInTheDocument();
  });

  it("does nothing on cancel", async () => {
    global.fetch = vi.fn();
    const user = userEvent.setup();
    render(<DeleteBillButton billId="b1" filename="bill.pdf" canDelete />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText(/permanently deletes "bill.pdf"/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Yes, Delete Bill" })).not.toBeInTheDocument();
  });

  it("deletes the bill, calls onDeleted, and refreshes on confirm", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    render(<DeleteBillButton billId="b1" filename="bill.pdf" canDelete onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Yes, Delete Bill" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith("/api/admin/bills/b1", expect.objectContaining({ method: "DELETE" }));
  });

  it("shows the server error and does not call onDeleted when delete fails", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "This bill has an active case and can't be deleted." }), { status: 409 }));
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    render(<DeleteBillButton billId="b1" filename="bill.pdf" canDelete onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Yes, Delete Bill" }));

    await waitFor(() => expect(screen.getByText("This bill has an active case and can't be deleted.")).toBeInTheDocument());
    expect(onDeleted).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
