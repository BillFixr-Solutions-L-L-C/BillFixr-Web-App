import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IdleTimeout, { ADMIN_IDLE_MS, CUSTOMER_IDLE_MS } from "./IdleTimeout";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut } }),
}));

// The admin window is what every assertion below is written against;
// the customer window gets its own block at the end.
const IDLE_TIMEOUT_MS = ADMIN_IDLE_MS;
const WARNING_MS = 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("IdleTimeout (admin window)", () => {
  it("shows nothing before the idle window elapses", () => {
    render(<IdleTimeout timeoutMs={ADMIN_IDLE_MS} />);
    expect(screen.queryByText("Still there?")).not.toBeInTheDocument();
  });

  it("shows the warning once idle for the full timeout minus the warning window", () => {
    render(<IdleTimeout timeoutMs={ADMIN_IDLE_MS} />);
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - WARNING_MS);
    });
    expect(screen.getByText("Still there?")).toBeInTheDocument();
  });

  it("resets the idle timer on real activity", () => {
    render(<IdleTimeout timeoutMs={ADMIN_IDLE_MS} />);
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - WARNING_MS - 1000);
    });
    fireEvent.mouseMove(window);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText("Still there?")).not.toBeInTheDocument();
  });

  it("signs out automatically once the warning window elapses with no response", async () => {
    render(<IdleTimeout timeoutMs={ADMIN_IDLE_MS} />);
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - WARNING_MS);
    });
    expect(screen.getByText("Still there?")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WARNING_MS);
    });

    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/login?error=inactivity_timeout");
  });

  it("dismisses the warning and resets the timer when Stay Signed In is clicked", () => {
    render(<IdleTimeout timeoutMs={ADMIN_IDLE_MS} />);
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - WARNING_MS);
    });
    fireEvent.click(screen.getByRole("button", { name: "Stay Signed In" }));

    expect(screen.queryByText("Still there?")).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out immediately when Log Out Now is clicked", async () => {
    render(<IdleTimeout timeoutMs={ADMIN_IDLE_MS} />);
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - WARNING_MS);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Log Out Now" }));
      await Promise.resolve();
    });

    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/login?error=inactivity_timeout");
  });

  it("still redirects to login when signOut() fails (e.g. no network)", async () => {
    signOut.mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<IdleTimeout timeoutMs={ADMIN_IDLE_MS} />);
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - WARNING_MS);
    });
    expect(screen.getByText("Still there?")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WARNING_MS);
    });

    expect(push).toHaveBeenCalledWith("/login?error=inactivity_timeout");
    expect(screen.queryByText("Still there?")).not.toBeInTheDocument();
  });

  it("ignores background activity while the warning is already showing", async () => {
    render(<IdleTimeout timeoutMs={ADMIN_IDLE_MS} />);
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - WARNING_MS);
    });
    fireEvent.mouseMove(window); // shouldn't cancel the pending auto-logout

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WARNING_MS);
    });

    expect(signOut).toHaveBeenCalled();
  });
});

describe("IdleTimeout (customer window)", () => {
  it("is 90 minutes, three times the admin window", () => {
    // The durations are the whole point of the component being shared.
    expect(CUSTOMER_IDLE_MS).toBe(90 * 60 * 1000);
    expect(ADMIN_IDLE_MS).toBe(30 * 60 * 1000);
    expect(CUSTOMER_IDLE_MS).toBeGreaterThan(ADMIN_IDLE_MS);
  });

  it("stays quiet through the whole admin window and beyond", async () => {
    // A customer must not be warned or signed out on the admin schedule.
    //
    // Asserting on signOut, not just on the modal: advancing a full
    // ADMIN_IDLE_MS would open the warning AND let its 60s auto-logout
    // fire within the same advance, closing the modal again — so a
    // modal-only assertion passes even when the window is wrong.
    render(<IdleTimeout timeoutMs={CUSTOMER_IDLE_MS} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ADMIN_IDLE_MS);
    });
    expect(screen.queryByText("Still there?")).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("warns one minute before the 90 minutes are up", () => {
    render(<IdleTimeout timeoutMs={CUSTOMER_IDLE_MS} />);
    act(() => {
      vi.advanceTimersByTime(CUSTOMER_IDLE_MS - WARNING_MS - 1000);
    });
    expect(screen.queryByText("Still there?")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Still there?")).toBeInTheDocument();
  });

  it("signs the customer out at 90 minutes, not 91", async () => {
    // The warning is counted inside the window, not added to it.
    render(<IdleTimeout timeoutMs={CUSTOMER_IDLE_MS} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CUSTOMER_IDLE_MS);
    });

    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/login?error=inactivity_timeout");
  });

  it("resets on activity, so an active customer is never signed out", () => {
    render(<IdleTimeout timeoutMs={CUSTOMER_IDLE_MS} />);
    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(CUSTOMER_IDLE_MS - WARNING_MS - 1000);
      });
      fireEvent.keyDown(window);
    }
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText("Still there?")).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });
});
