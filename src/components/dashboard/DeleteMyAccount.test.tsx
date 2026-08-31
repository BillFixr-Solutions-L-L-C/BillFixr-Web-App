import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeleteMyAccount from "./DeleteMyAccount";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
}));

const signOut = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut } }),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("DeleteMyAccount", () => {
  it("does not show the confirmation modal until the button is clicked", () => {
    render(<DeleteMyAccount />);
    expect(screen.queryByRole("button", { name: "Yes, Delete Account" })).not.toBeInTheDocument();
  });

  it("opens a confirmation modal, and does nothing if cancelled", async () => {
    global.fetch = vi.fn();
    const user = userEvent.setup();
    render(<DeleteMyAccount />);

    await user.click(screen.getByRole("button", { name: "Delete My Account" }));
    expect(screen.getByText(/This permanently deletes your BillFixr account/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("deletes the account, signs out, and redirects home on confirm", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    signOut.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<DeleteMyAccount />);

    await user.click(screen.getByRole("button", { name: "Delete My Account" }));
    await user.click(screen.getByRole("button", { name: "Yes, Delete Account" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(global.fetch).toHaveBeenCalledWith("/api/account/delete", expect.objectContaining({ method: "POST" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("shows the server error and does not sign out or redirect when delete fails", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "something broke" }), { status: 500 }));
    const user = userEvent.setup();
    render(<DeleteMyAccount />);

    await user.click(screen.getByRole("button", { name: "Delete My Account" }));
    await user.click(screen.getByRole("button", { name: "Yes, Delete Account" }));

    await waitFor(() => expect(screen.getByText("something broke")).toBeInTheDocument());
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
