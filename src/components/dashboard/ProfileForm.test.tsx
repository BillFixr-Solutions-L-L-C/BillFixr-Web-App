import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfileForm from "./ProfileForm";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const COMPLETE = {
  name: "Jane Doe",
  email: "jane@example.com",
  address: "1 Main St",
  city: "Springfield",
  postalCode: "11111",
  country: "USA",
  avatarUrl: "https://example.com/a.png",
};

const assign = vi.fn();
const originalLocation = window.location;

const originalFetch = global.fetch;
beforeEach(() => {
  vi.clearAllMocks();
  // Completing a profile leaves via a real navigation, not the router —
  // see the comment in ProfileForm. jsdom can't navigate, so stub it.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, assign },
  });
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
});
afterEach(() => {
  global.fetch = originalFetch;
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

async function save() {
  await userEvent.setup().click(screen.getByRole("button", { name: /Save/ }));
}

describe("ProfileForm", () => {
  it("takes a new customer to the dashboard once their profile is complete", async () => {
    render(<ProfileForm profile={COMPLETE} completingProfile />);
    await save();
    // A real navigation, so the proxy re-checks the now-complete profile
    // instead of the router serving a stale prefetch of /dashboard.
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/dashboard"));
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps them on settings if something required is still missing", async () => {
    render(<ProfileForm profile={{ ...COMPLETE, avatarUrl: null }} completingProfile />);
    await save();
    // Must not navigate at all: leaving the URL alone keeps the
    // ?complete_profile=1 signal that the next save depends on.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("stays on settings for an ordinary edit, not a first-time setup", async () => {
    render(<ProfileForm profile={COMPLETE} />);
    await save();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard/settings"));
  });

  it("attaches every label to its own input", () => {
    render(<ProfileForm profile={COMPLETE} />);
    for (const label of ["Your Name", "Email", "Address", "City", "Postal Code", "Country"]) {
      expect(screen.getByLabelText(label).tagName).toBe("INPUT");
    }
    // Each field gets its own id, so no label points at another's input.
    const ids = ["Your Name", "Address", "City", "Postal Code", "Country"].map(
      (l) => screen.getByLabelText(l).id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not navigate when saving fails", async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: "Address is required." }), { status: 400 }),
    );
    render(<ProfileForm profile={COMPLETE} completingProfile />);
    await save();

    expect(await screen.findByText("Address is required.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
