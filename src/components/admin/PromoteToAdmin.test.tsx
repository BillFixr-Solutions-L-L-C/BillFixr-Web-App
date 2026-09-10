import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PromoteToAdmin, { type RoleOption } from "./PromoteToAdmin";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
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

describe("PromoteToAdmin", () => {
  it("shows the role picker after clicking Promote to Admin", async () => {
    const user = userEvent.setup();
    render(<PromoteToAdmin userId="user-1" roles={ROLES} />);

    await user.click(screen.getByRole("button", { name: "Promote to Admin" }));
    expect(screen.getByRole("button", { name: "Confirm Promotion" })).toBeInTheDocument();
  });

  it("asks for confirmation via a modal, not a native dialog", async () => {
    global.fetch = vi.fn();
    const user = userEvent.setup();
    render(<PromoteToAdmin userId="user-1" roles={ROLES} />);

    await user.click(screen.getByRole("button", { name: "Promote to Admin" }));
    await user.click(screen.getByRole("button", { name: "Confirm Promotion" }));

    expect(screen.getByText("This grants admin access immediately.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    // Two "Cancel" buttons exist once the modal is open: the inline panel's
    // own Cancel (closes the whole panel) and the modal's own Cancel — the
    // modal's is the one rendered last.
    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    await user.click(cancelButtons[cancelButtons.length - 1]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("promotes the user and redirects once the modal is confirmed", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<PromoteToAdmin userId="user-1" roles={ROLES} />);

    await user.click(screen.getByRole("button", { name: "Promote to Admin" }));
    await user.click(screen.getByRole("button", { name: "Confirm Promotion" }));
    await user.click(screen.getByRole("button", { name: "Yes, Promote" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/users"));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/promote-to-admin",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ userId: "user-1", roleId: "role-1" }) }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the server error and does not redirect when promotion fails", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "already an admin" }), { status: 400 }));
    const user = userEvent.setup();
    render(<PromoteToAdmin userId="user-1" roles={ROLES} />);

    await user.click(screen.getByRole("button", { name: "Promote to Admin" }));
    await user.click(screen.getByRole("button", { name: "Confirm Promotion" }));
    await user.click(screen.getByRole("button", { name: "Yes, Promote" }));

    await waitFor(() => expect(screen.getByText("already an admin")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
