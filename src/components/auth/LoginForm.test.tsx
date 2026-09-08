import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginForm from "./LoginForm";

const push = vi.fn();
const refresh = vi.fn();
let searchParamsValue = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

const signInWithPassword = vi.fn();
const single = vi.fn();
const insert = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signInWithPassword: (...args: unknown[]) => signInWithPassword(...args) },
    from: () => ({
      select: () => ({ eq: () => ({ single }) }),
      insert: (...args: unknown[]) => insert(...args),
    }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockResolvedValue({ error: null });
  searchParamsValue = "";
});

describe("LoginForm", () => {
  it("shows the link-expired message when the URL carries that error", () => {
    searchParamsValue = "error=invalid_or_expired_link";
    render(<LoginForm />);
    expect(screen.getByText(/link is invalid or has expired/)).toBeInTheDocument();
  });

  it("does not show an error banner on a normal load", () => {
    render(<LoginForm />);
    expect(screen.queryByText(/link is invalid or has expired/)).not.toBeInTheDocument();
  });

  it("shows the auth error and does not redirect when sign-in fails", async () => {
    signInWithPassword.mockResolvedValue({ data: null, error: { message: "Invalid login credentials" } });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText("Email"), "jane@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(screen.getByText("Invalid login credentials")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("routes a customer to /dashboard after a successful login, without logging activity", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    single.mockResolvedValue({ data: { role: "customer", name: "Jane" }, error: null });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText("Email"), "jane@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "correctpass");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(refresh).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("routes an admin to /admin and logs the login after a successful login", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    single.mockResolvedValue({ data: { role: "admin", name: "Admin Jane" }, error: null });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText("Email"), "admin@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "correctpass");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
    expect(insert).toHaveBeenCalledWith({ actor_id: "admin-1", actor_name: "Admin Jane", action: "login" });
  });
});
