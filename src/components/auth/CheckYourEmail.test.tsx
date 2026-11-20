import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CheckYourEmail from "./CheckYourEmail";

// Resend goes through our own route now, not supabase.auth.resend():
// that one makes GoTrue send its template, which is the
// English-for-everyone email this change exists to stop.
const resend = vi.fn();

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  // Two different callers share global.fetch here. The pairing-poll
  // effect's calls are not under test and only need to not hang; the
  // resend button's call to /api/auth/resend-confirmation is, so it is
  // routed to the `resend` mock by URL.
  global.fetch = vi.fn(async (url: unknown, init?: unknown) => {
    if (String(url).includes("resend-confirmation")) {
      const { ok } = await resend(JSON.parse((init as { body: string }).body));
      return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 500 });
    }
    return new Response(JSON.stringify({}), { status: 500 });
  }) as unknown as typeof fetch;
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
    resend.mockResolvedValue({ ok: true });
    render(<CheckYourEmail email="jane@example.org" userId="user-1" />);

    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resend confirmation email" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resend).toHaveBeenCalledWith({ email: "jane@example.org", language: "en" });
    expect(screen.getByText("Confirmation email resent.")).toBeInTheDocument();
    expect(screen.getByText("Didn't get it? You can resend in 90s")).toBeInTheDocument();
  });

  it("shows the error message when resend fails", async () => {
    vi.useFakeTimers();
    resend.mockResolvedValue({ ok: false });
    render(<CheckYourEmail email="jane@example.org" userId="user-1" />);

    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resend confirmation email" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("We couldn't resend it. Please try again in a moment.")).toBeInTheDocument();
  });
});
