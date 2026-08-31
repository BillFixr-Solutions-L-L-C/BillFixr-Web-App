import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountActions from "./AccountActions";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
}));

const update = vi.fn();
const eq = vi.fn(() => ({ then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ update: (...args: unknown[]) => (update(...args), { eq }) }),
  }),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("AccountActions", () => {
  it("shows Suspend for an active account and Delete when canDelete is true", () => {
    render(<AccountActions userId="u1" initialStatus="active" canDelete />);
    expect(screen.getByRole("button", { name: "Suspend account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Account" })).toBeInTheDocument();
  });

  it("hides the Delete button when canDelete is false", () => {
    render(<AccountActions userId="u1" initialStatus="active" canDelete={false} />);
    expect(screen.queryByRole("button", { name: "Delete Account" })).not.toBeInTheDocument();
  });

  it("shows Reactivate for a suspended account", () => {
    render(<AccountActions userId="u1" initialStatus="suspended" canDelete={false} />);
    expect(screen.getByRole("button", { name: "Reactivate account" })).toBeInTheDocument();
  });

  it("toggles to Reactivate after a successful suspend, and refreshes the router", async () => {
    const user = userEvent.setup();
    render(<AccountActions userId="u1" initialStatus="active" canDelete={false} />);

    await user.click(screen.getByRole("button", { name: "Suspend account" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Reactivate account" })).toBeInTheDocument());
    expect(update).toHaveBeenCalledWith({ status: "suspended" });
    expect(refresh).toHaveBeenCalled();
  });

  it("does not show the confirmation modal until Delete Account is clicked", () => {
    render(<AccountActions userId="u1" initialStatus="active" canDelete />);
    expect(screen.queryByRole("button", { name: "Yes, Delete Account" })).not.toBeInTheDocument();
  });

  it("opens a confirmation modal, and does nothing if cancelled", async () => {
    global.fetch = vi.fn();
    const user = userEvent.setup();
    render(<AccountActions userId="u1" initialStatus="active" canDelete />);

    await user.click(screen.getByRole("button", { name: "Delete Account" }));
    expect(screen.getByText(/This permanently deletes the account/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Yes, Delete Account" })).not.toBeInTheDocument();
  });

  it("deletes the account and redirects to the customer list on confirm", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<AccountActions userId="u1" initialStatus="active" canDelete />);

    await user.click(screen.getByRole("button", { name: "Delete Account" }));
    await user.click(screen.getByRole("button", { name: "Yes, Delete Account" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/users"));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/delete-account",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows the server error message and does not redirect when delete fails", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
    const user = userEvent.setup();
    render(<AccountActions userId="u1" initialStatus="active" canDelete />);

    await user.click(screen.getByRole("button", { name: "Delete Account" }));
    await user.click(screen.getByRole("button", { name: "Yes, Delete Account" }));

    await waitFor(() => expect(screen.getByText("forbidden")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
