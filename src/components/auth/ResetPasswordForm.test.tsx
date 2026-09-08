import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordForm from "./ResetPasswordForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const updateUser = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser: (...args: unknown[]) => updateUser(...args) } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResetPasswordForm", () => {
  it("shows an error and does not call updateUser when the passwords don't match", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await user.type(screen.getByPlaceholderText("New password"), "Password1");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "Password2");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("shows the friendly auth error and does not redirect when updateUser fails", async () => {
    updateUser.mockResolvedValue({
      error: {
        message:
          "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.",
      },
    });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await user.type(screen.getByPlaceholderText("New password"), "password1");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "password1");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    await waitFor(() =>
      expect(
        screen.getByText("Password must include a lowercase letter, an uppercase letter, and a number."),
      ).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("calls updateUser with the new password and redirects to /login on success", async () => {
    updateUser.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await user.type(screen.getByPlaceholderText("New password"), "Password1");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "Password1");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(updateUser).toHaveBeenCalledWith({ password: "Password1" });
  });
});
