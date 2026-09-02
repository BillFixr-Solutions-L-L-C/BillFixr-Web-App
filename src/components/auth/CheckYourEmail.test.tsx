import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CheckYourEmail from "./CheckYourEmail";

const resend = vi.fn();
vi.mock("@/lib/supabase/authEmailClient", () => ({
  createAuthEmailClient: () => ({ auth: { resend } }),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  // The pairing-poll effect's own fetch calls — not under test here, just
  // kept from rejecting/hanging.
  global.fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 500 }));
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.useRealTimers();
});

describe("CheckYourEmail", () => {
  it("shows a countdown and no resend button initially", () => {
    render(<CheckYourEmail email="jane@example.org" userId="user-1" />);
    expect(screen.getByText("Didn't get it? You can resend in 90s")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend confirmation email" })).not.toBeInTheDocument();
  });

  it("reveals the resend button once the cooldown reaches zero", () => {
    vi.useFakeTimers();
    render(<CheckYourEmail email="jane@example.org" userId="user-1" />);

    act(() => {
      vi.advanceTimersByTime(90_000);
    });

    expect(screen.getByRole("button", { name: "Resend confirmation email" })).toBeInTheDocument();
  });

  it("resends the confirmation email and restarts the cooldown", async () => {
    vi.useFakeTimers();
    resend.mockResolvedValue({ error: null });
    render(<CheckYourEmail email="jane@example.org" userId="user-1" />);

    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resend confirmation email" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resend).toHaveBeenCalledWith({ type: "signup", email: "jane@example.org" });
    expect(screen.getByText("Confirmation email resent.")).toBeInTheDocument();
    expect(screen.getByText("Didn't get it? You can resend in 90s")).toBeInTheDocument();
  });

  it("shows the error message when resend fails", async () => {
    vi.useFakeTimers();
    resend.mockResolvedValue({ error: { message: "Rate limit exceeded" } });
    render(<CheckYourEmail email="jane@example.org" userId="user-1" />);

    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resend confirmation email" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Rate limit exceeded")).toBeInTheDocument();
  });
});
