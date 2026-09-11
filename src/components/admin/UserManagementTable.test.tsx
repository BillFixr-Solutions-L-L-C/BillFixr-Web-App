import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserManagementTable, { type AccountRow, type RoleOption } from "./UserManagementTable";

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

const ROLES: RoleOption[] = [
  { id: "role-1", name: "Support Admin" },
  { id: "role-2", name: "Super Admin" },
];

const INVITED: AccountRow[] = [
  { id: "acct-1", name: "Pending Admin", email: "pending@example.com", roleName: "Support Admin", lastLogin: "—", status: "Invited" },
];

const MIXED: AccountRow[] = [
  { id: "acct-1", name: "Alice Active", email: "alice@example.com", roleName: "Support Admin", lastLogin: "Jan 1, 2026", status: "Active" },
  { id: "acct-2", name: "Bob Suspended", email: "bob@example.com", roleName: "Finance Admin", lastLogin: "Jan 2, 2026", status: "Suspended" },
  { id: "acct-3", name: "Carol Invited", email: "carol@example.com", roleName: "Support Admin", lastLogin: "—", status: "Invited" },
];

describe("UserManagementTable", () => {
  it("asks for confirmation via a modal, not a native dialog, before revoking access", async () => {
    global.fetch = vi.fn();
    const user = userEvent.setup();
    render(<UserManagementTable accounts={INVITED} roles={ROLES} canDelete currentUserId="someone-else" />);

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
    render(<UserManagementTable accounts={INVITED} roles={ROLES} canDelete currentUserId="someone-else" />);

    await user.click(screen.getByRole("button", { name: "Revoke Access" }));
    await user.click(screen.getByRole("button", { name: "Yes, Revoke Access" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/delete-account",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ userId: "acct-1" }) }),
    );
  });

  it("hides Revoke Access when canDelete is false", () => {
    render(<UserManagementTable accounts={INVITED} roles={ROLES} canDelete={false} currentUserId="someone-else" />);
    expect(screen.queryByRole("button", { name: "Revoke Access" })).not.toBeInTheDocument();
  });

  it("filters by search text across name and email", async () => {
    const user = userEvent.setup();
    render(<UserManagementTable accounts={MIXED} roles={ROLES} canDelete={false} currentUserId="someone-else" />);

    await user.type(screen.getByPlaceholderText("Search by name or email"), "bob@example.com");

    expect(screen.getByText("Bob Suspended")).toBeInTheDocument();
    expect(screen.queryByText("Alice Active")).not.toBeInTheDocument();
    expect(screen.queryByText("Carol Invited")).not.toBeInTheDocument();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    render(<UserManagementTable accounts={MIXED} roles={ROLES} canDelete={false} currentUserId="someone-else" />);

    await user.selectOptions(screen.getByDisplayValue("All statuses"), "Suspended");

    expect(screen.getByText("Bob Suspended")).toBeInTheDocument();
    expect(screen.queryByText("Alice Active")).not.toBeInTheDocument();
    expect(screen.queryByText("Carol Invited")).not.toBeInTheDocument();
  });

  it("shows an empty state when the search/filter matches nothing", async () => {
    const user = userEvent.setup();
    render(<UserManagementTable accounts={MIXED} roles={ROLES} canDelete={false} currentUserId="someone-else" />);

    await user.type(screen.getByPlaceholderText("Search by name or email"), "nobody-matches-this");

    expect(screen.getByText("No accounts match your search.")).toBeInTheDocument();
  });

  it("opens the add-admin modal and submits an invite", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<UserManagementTable accounts={INVITED} roles={ROLES} canDelete={false} currentUserId="someone-else" />);

    await user.click(screen.getByRole("button", { name: "Add new admin +" }));
    await user.type(screen.getByLabelText("Full name"), "Brand New Admin");
    await user.type(screen.getByLabelText("Email"), "brand.new@example.com");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/invite-admin",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Brand New Admin", email: "brand.new@example.com", roleId: "role-1" }),
      }),
    );
  });

  it("shows the server error and keeps the modal open when the invite fails", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "email already invited" }), { status: 500 }));
    const user = userEvent.setup();
    render(<UserManagementTable accounts={INVITED} roles={ROLES} canDelete={false} currentUserId="someone-else" />);

    await user.click(screen.getByRole("button", { name: "Add new admin +" }));
    await user.type(screen.getByLabelText("Full name"), "Brand New Admin");
    await user.type(screen.getByLabelText("Email"), "brand.new@example.com");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(screen.getByText("email already invited")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Send invite" })).toBeInTheDocument();
  });
});
