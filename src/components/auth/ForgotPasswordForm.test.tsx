import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordForm from "./ForgotPasswordForm";

const resetPasswordForEmail = vi.fn();
vi.mock("@/lib/supabase/authEmailClient", () => ({
  createAuthEmailClient: () => ({
    auth: { resetPasswordForEmail: (...args: unknown[]) => resetPasswordForEmail(...args) },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ForgotPasswordForm", () => {
  it("shows the server error and stays on the form when the request fails", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: "Rate limit exceeded" } });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByPlaceholderText("Email"), "jane@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(screen.getByText("Rate limit exceeded")).toBeInTheDocument());
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
  });

  it("shows the sent confirmation with the entered email on success", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByPlaceholderText("Email"), "jane@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(screen.getByText(/we've sent a link to reset your password/)).toBeInTheDocument());
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(resetPasswordForEmail).toHaveBeenCalledWith("jane@example.com");
  });
});
