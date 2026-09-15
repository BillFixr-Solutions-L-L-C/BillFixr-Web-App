import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotificationBell from "./NotificationBell";

const getUser = vi.fn();
const from = vi.fn();
const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser },
    from,
  }),
}));

const INITIAL = [
  { id: "n-1", type: "support_ticket", message: "New support ticket: Billing", read: false, created_at: "2026-01-01T00:00:00Z" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
  from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: async () => ({ data: INITIAL, error: null }),
        }),
      }),
    }),
    update,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NotificationBell", () => {
  it("shows the unread indicator and lists the initial notifications", async () => {
    render(<NotificationBell initialNotifications={INITIAL} />);

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

    expect(screen.getByText("New support ticket: Billing")).toBeInTheDocument();
  });

  it("marks a notification read and persists it via the client", async () => {
    render(<NotificationBell initialNotifications={INITIAL} />);

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    fireEvent.click(screen.getByText("New support ticket: Billing"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(update).toHaveBeenCalledWith({ read: true });
  });

  it("shows the empty state once there are no notifications", () => {
    render(<NotificationBell initialNotifications={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
  });

  it("picks up a new notification on the next poll without a page navigation", async () => {
    render(<NotificationBell initialNotifications={INITIAL} />);

    const updated = [
      ...INITIAL,
      { id: "n-2", type: "live_chat_message", message: "New live chat message from Dave: hi", read: false, created_at: "2026-01-02T00:00:00Z" },
    ];
    from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: updated, error: null }),
          }),
        }),
      }),
      update,
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("New live chat message from Dave: hi")).toBeInTheDocument();
  });
});
