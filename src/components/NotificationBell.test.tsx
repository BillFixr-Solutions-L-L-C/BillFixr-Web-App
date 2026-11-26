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


  // Where the panel hangs from decides whether it is readable at all.
  //
  // It is 320px wide. Hung from the right it grows leftwards from the
  // bell, which is right for the two callers whose bell sits near the
  // right edge of a full-width bar -- and wrong for the desktop sidebar,
  // whose bell is at the right edge of a 235px column. Measured against
  // production on 2026-11-25: the panel sat at x=-84, so its heading read
  // "IONS" and every message lost its opening words. The customer's
  // report was "notifications are not fully showing the full things, its
  // cut".
  //
  // Asserted on the class rather than on geometry because jsdom lays
  // nothing out -- every bounding box here is zero, so a position test
  // would pass against the bug.
  describe("where the panel hangs from", () => {
    function panel(): HTMLElement {
      const found = document.querySelector("div.w-80");
      if (!found) throw new Error("the panel is not open");
      return found as HTMLElement;
    }

    it("hangs from the right by default, for a bell near the right edge", () => {
      render(<NotificationBell initialNotifications={INITIAL} />);
      fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

      expect(panel().className).toContain("right-0");
      expect(panel().className).not.toContain("left-0");
    });

    it("hangs from the left when asked, for a bell in a narrow sidebar", () => {
      render(<NotificationBell initialNotifications={INITIAL} align="left" />);
      fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

      expect(panel().className).toContain("left-0");
      expect(panel().className).not.toContain("right-0");
    });

    // A phone narrower than the panel would clip it whichever edge it
    // hangs from, so the width yields to the viewport as well.
    it("never asks for more width than the screen has", () => {
      render(<NotificationBell initialNotifications={INITIAL} />);
      fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

      expect(panel().className).toContain("max-w-[calc(100vw-2rem)]");
    });

    // The whole point: nothing clips the text itself. A truncate or a
    // line-clamp here would hide the ends of messages even once the panel
    // is on screen.
    it("does not truncate or clamp the message text", () => {
      render(<NotificationBell initialNotifications={INITIAL} />);
      fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

      const message = screen.getByText("New support ticket: Billing");
      expect(message.className).not.toMatch(/truncate|line-clamp|text-ellipsis/);
    });
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
