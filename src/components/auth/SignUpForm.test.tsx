import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignUpForm from "./SignUpForm";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const signUp = vi.fn();
vi.mock("@/lib/supabase/authEmailClient", () => ({
  createAuthEmailClient: () => ({ auth: { signUp: (...args: unknown[]) => signUp(...args) } }),
}));

vi.mock("@/components/auth/CheckYourEmail", () => ({
  default: ({ email }: { email: string }) => <div>Check your email stub: {email}</div>,
}));

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, overrides: Partial<Record<string, string>> = {}) {
  await user.type(screen.getByPlaceholderText("Full Name"), overrides.name ?? "Jane Doe");
  await user.type(screen.getByPlaceholderText("Email"), overrides.email ?? "jane@example.com");
  await user.type(screen.getByPlaceholderText("Password"), overrides.password ?? "Password1");
  await user.type(screen.getByPlaceholderText("Confirm Password"), overrides.confirmPassword ?? "Password1");
  await user.click(screen.getByRole("button", { name: "Sign up" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SignUpForm", () => {
  it("shows a mismatch error and never calls signUp when passwords don't match", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await fillAndSubmit(user, { confirmPassword: "Different1" });

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("shows the server error message when signUp fails", async () => {
    signUp.mockResolvedValue({ data: null, error: { message: "User already registered" } });
    const user = userEvent.setup();
    render(<SignUpForm />);

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText("User already registered")).toBeInTheDocument());
  });

  it("shows the check-your-email screen when signUp succeeds without an active session", async () => {
    signUp.mockResolvedValue({ data: { session: null, user: { id: "user-1" } }, error: null });
    const user = userEvent.setup();
    render(<SignUpForm />);

    await fillAndSubmit(user, { email: "jane@example.com" });

    await waitFor(() => expect(screen.getByText(/Check your email stub: jane@example.com/)).toBeInTheDocument());
    expect(signUp).toHaveBeenCalledWith({
      email: "jane@example.com",
      password: "Password1",
      options: { data: { name: "Jane Doe" } },
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects straight to the dashboard when signUp returns an active session", async () => {
    signUp.mockResolvedValue({ data: { session: { access_token: "t" }, user: { id: "user-1" } }, error: null });
    const user = userEvent.setup();
    render(<SignUpForm />);

    await fillAndSubmit(user);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(refresh).toHaveBeenCalled();
  });
});
