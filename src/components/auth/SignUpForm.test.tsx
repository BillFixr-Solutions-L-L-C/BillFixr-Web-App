import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignUpForm from "./SignUpForm";

// The form still looks the email's domain up in blocked_email_domains
// before registering, so the client is still needed for from().
type BlockedLookup = { data: { domain: string } | null; error: { message: string } | null };
const blockedDomain = vi.fn<() => Promise<BlockedLookup>>(async () => ({ data: null, error: null }));
vi.mock("@/lib/supabase/authEmailClient", () => ({
  createAuthEmailClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: blockedDomain }) }) }),
  }),
}));

// Registration goes through our own route now, not supabase.auth.signUp.
// The account is created the same way; what changed is who sends the
// confirmation email, because GoTrue's template cannot read a language.
const register = vi.fn();
const originalFetch = global.fetch;

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
  blockedDomain.mockResolvedValue({ data: null, error: null });
  register.mockResolvedValue({ ok: true, body: { ok: true, confirmationSent: true, userId: "user-1" } });
  global.fetch = vi.fn(async (_url: unknown, init: unknown) => {
    const { ok, body } = await register(JSON.parse((init as { body: string }).body));
    return new Response(JSON.stringify(body), { status: ok ? 200 : 400 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

/** What the form sent to /api/auth/register. */
function sentBody(): Record<string, unknown> {
  return register.mock.calls[0][0];
}

describe("SignUpForm", () => {
  it("shows a mismatch error and never registers when passwords don't match", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await fillAndSubmit(user, { confirmPassword: "Different1" });

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("shows the server's message when registration fails", async () => {
    register.mockResolvedValue({ ok: false, body: { error: "User already registered" } });
    const user = userEvent.setup();
    render(<SignUpForm />);

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText("User already registered")).toBeInTheDocument());
  });

  it("shows the check-your-email screen once registration succeeds", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await fillAndSubmit(user, { email: "jane@example.com" });

    await waitFor(() => expect(screen.getByText(/Check your email stub: jane@example.com/)).toBeInTheDocument());
    expect(sentBody()).toMatchObject({
      email: "jane@example.com",
      password: "Password1",
      name: "Jane Doe",
      // The language rides along. The route puts it in the user metadata
      // and the trigger copies it onto the profile, which is what
      // BillFixr writes to this customer in from then on -- whatever the
      // display switcher is later set to.
      language: "en",
    });
  });

  it("shows the same screen when the address is already a confirmed account", async () => {
    // The route answers 200 with no user id, on purpose: a different
    // answer would turn signup into a way of asking who has an account.
    register.mockResolvedValue({ ok: true, body: { ok: true, confirmationSent: true } });
    const user = userEvent.setup();
    render(<SignUpForm />);

    await fillAndSubmit(user, { email: "taken@example.com" });

    expect(await screen.findByText(/Check your email stub: taken@example.com/)).toBeInTheDocument();
  });

  it("registers the language chosen on the first visit, not the one on screen now", async () => {
    // The requirement: someone who arrived in Spanish and later flipped
    // the site to English is still a Spanish speaker for correspondence.
    document.cookie = "bf_lang_chosen=es; path=/";
    document.cookie = "bf_lang_display=en; path=/";
    const user = userEvent.setup();
    render(<SignUpForm />);

    await fillAndSubmit(user, { email: "jane@example.com" });

    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(sentBody().language).toBe("es");

    document.cookie = "bf_lang_chosen=; path=/; max-age=0";
    document.cookie = "bf_lang_display=; path=/; max-age=0";
  });

  it("refuses a throwaway address before it reaches the route", async () => {
    blockedDomain.mockResolvedValue({ data: { domain: "mailinator.com" }, error: null });
    const user = userEvent.setup();
    render(<SignUpForm />);
    await fillAndSubmit(user, { email: "jane@mailinator.com" });

    expect(await screen.findByText(/temporary email address/i)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("explains a rejection that only the database catches", async () => {
    // The lookup fails, so the pre-check lets it through and the trigger
    // rejects it — which surfaces as a bare database error.
    blockedDomain
      .mockResolvedValueOnce({ data: null, error: { message: "offline" } })
      .mockResolvedValueOnce({ data: { domain: "mailinator.com" }, error: null });
    register.mockResolvedValue({ ok: false, body: { error: "Database error creating new user" } });

    const user = userEvent.setup();
    render(<SignUpForm />);
    await fillAndSubmit(user, { email: "jane@mailinator.com" });

    expect(await screen.findByText(/temporary email address/i)).toBeInTheDocument();
    expect(screen.queryByText(/Database error/i)).not.toBeInTheDocument();
  });
});
