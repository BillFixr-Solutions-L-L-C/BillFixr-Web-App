import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ManageAdmins, { type AdminRow, type RoleOption } from "./ManageAdmins";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
}));

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
beforeEach(() => {
  vi.clearAllMocks();
});

const ROLES: RoleOption[] = [
  { id: "role-1", name: "Support Admin" },
  { id: "role-2", name: "Super Admin" },
];

const ADMINS: AdminRow[] = [
  { id: "admin-1", name: "Existing Admin", email: "existing@example.com", roleId: "role-1", roleName: "Support Admin", domainsGranted: 3 },
];

describe("ManageAdmins", () => {
  it("lists existing admins", () => {
    render(<ManageAdmins admins={ADMINS} roles={ROLES} canDelete={false} currentUserId="admin-1" />);
    expect(screen.getByText("Existing Admin")).toBeInTheDocument();
    expect(screen.getByText("existing@example.com")).toBeInTheDocument();
  });

  it("shows an empty state with no admins", () => {
    render(<ManageAdmins admins={[]} roles={ROLES} canDelete={false} currentUserId="admin-1" />);
    expect(screen.getByText("No admin accounts yet.")).toBeInTheDocument();
  });

  it("never shows a delete button for the current user's own row", () => {
    render(<ManageAdmins admins={ADMINS} roles={ROLES} canDelete currentUserId="admin-1" />);
    expect(screen.queryByRole("button", { name: "Delete admin" })).not.toBeInTheDocument();
  });

  it("shows a delete button for other admins when canDelete is true", () => {
    render(<ManageAdmins admins={ADMINS} roles={ROLES} canDelete currentUserId="someone-else" />);
    expect(screen.getByRole("button", { name: "Delete admin" })).toBeInTheDocument();
  });

  it("opens the add-admin modal and submits an invite", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<ManageAdmins admins={ADMINS} roles={ROLES} canDelete={false} currentUserId="admin-1" />);

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
    render(<ManageAdmins admins={ADMINS} roles={ROLES} canDelete={false} currentUserId="admin-1" />);

    await user.click(screen.getByRole("button", { name: "Add new admin +" }));
    await user.type(screen.getByLabelText("Full name"), "Brand New Admin");
    await user.type(screen.getByLabelText("Email"), "brand.new@example.com");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(screen.getByText("email already invited")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Send invite" })).toBeInTheDocument();
  });
});
