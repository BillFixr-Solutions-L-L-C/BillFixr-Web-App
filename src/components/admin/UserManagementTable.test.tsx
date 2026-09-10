import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserManagementTable, { type AccountRow } from "./UserManagementTable";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
}));

const originalFetch = global.fetch;
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  global.fetch = originalFetch;
});

const INVITED: AccountRow[] = [
  { id: "acct-1", name: "Pending Admin", email: "pending@example.com", roleName: "Support Admin", lastLogin: "—", status: "Invited" },
];

describe("UserManagementTable", () => {
  it("asks for confirmation via a modal, not a native dialog, before revoking access", async () => {
    global.fetch = vi.fn();
    const user = userEvent.setup();
    render(<UserManagementTable accounts={INVITED} canDelete currentUserId="someone-else" />);

    await user.click(screen.getByRole("button", { name: "Revoke Access" }));

    expect(screen.getByText(/permanently deletes this pending admin account/)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Yes, Revoke Access" })).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("revokes access and refreshes once the modal is confirmed", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<UserManagementTable accounts={INVITED} canDelete currentUserId="someone-else" />);

    await user.click(screen.getByRole("button", { name: "Revoke Access" }));
    await user.click(screen.getByRole("button", { name: "Yes, Revoke Access" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/delete-account",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ userId: "acct-1" }) }),
    );
  });

  it("hides Revoke Access when canDelete is false", () => {
    render(<UserManagementTable accounts={INVITED} canDelete={false} currentUserId="someone-else" />);
    expect(screen.queryByRole("button", { name: "Revoke Access" })).not.toBeInTheDocument();
  });
});
