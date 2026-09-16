import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminIdleTimeout from "./AdminIdleTimeout";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut } }),
}));

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_MS = 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AdminIdleTimeout", () => {
  it("shows nothing before the idle window elapses", () => {
    render(<AdminIdleTimeout />);
    expect(screen.queryByText("Still there?")).not.toBeInTheDocument();
  });

  it("shows the warning once idle for the full timeout minus the warning window", () => {
    render(<AdminIdleTimeout />);
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - WARNING_MS);
    });
    expect(screen.getByText("Still there?")).toBeInTheDocument();
  });

  it("resets the idle timer on real activity", () => {
    render(<AdminIdleTimeout />);
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
    render(<AdminIdleTimeout />);
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
    render(<AdminIdleTimeout />);
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - WARNING_MS);
    });
    fireEvent.click(screen.getByRole("button", { name: "Stay Signed In" }));

    expect(screen.queryByText("Still there?")).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out immediately when Log Out Now is clicked", async () => {
    render(<AdminIdleTimeout />);
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
    render(<AdminIdleTimeout />);
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
    render(<AdminIdleTimeout />);
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
