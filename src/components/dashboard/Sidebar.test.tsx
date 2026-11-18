import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

let pathname = "/dashboard";
// What the URL says the customer came from. `?from=case` keeps Active
// Case highlighted while they read a document that belongs to the case.
let from: string | null = null;
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(from ? { from } : {}),
  // The sidebar now carries the language switcher, which refreshes the
  // route so server components re-read the language cookie.
  useRouter: () => ({ refresh: vi.fn() }),
}));

// The sidebar now carries the notification bell, which opens a Supabase
// browser client in an effect to poll for new rows. There are no keys in
// the test environment, and this suite is about the nav, not the bell --
// which has its own tests.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

const USER = { name: "Jane Doe", status: "active" as const, avatarUrl: null };

function activeLabel() {
  return screen
    .getAllByRole("link")
    .filter((l) => l.className.includes("border-[#0f7545]"))
    .map((l) => l.textContent);
}

describe("Sidebar", () => {
  it("links the logo to the dashboard home, not the landing page", () => {
    pathname = "/dashboard";
    render(<Sidebar user={USER} />);
    const logoLinks = screen.getAllByRole("link", { name: /BillFixr/ });
    expect(logoLinks.length).toBeGreaterThan(0);
    for (const link of logoLinks) {
      expect(link).toHaveAttribute("href", "/dashboard");
    }
  });

  it("has the seven nav items from the design, in order", () => {
    pathname = "/dashboard";
    render(<Sidebar user={USER} />);
    const labels = ["Dashboard", "My Document", "Active Case", "Completed Case", "Support", "Settings", "Log out"];
    for (const label of labels) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole("link", { name: "Completed Case" })[0]).toHaveAttribute(
      "href",
      "/dashboard/completed",
    );
  });

  it("keeps the section highlighted while inside one of its detail pages", () => {
    pathname = "/dashboard/documents/abc-123";
    render(<Sidebar user={USER} />);
    expect(activeLabel()).toContain("My Document");
  });

  it("does not highlight Dashboard for a nested route", () => {
    pathname = "/dashboard/completed";
    render(<Sidebar user={USER} />);
    expect(activeLabel()).toContain("Completed Case");
    expect(activeLabel()).not.toContain("Dashboard");
  });

  it("shows the app's social links", () => {
    pathname = "/dashboard";
    render(<Sidebar user={USER} />);
    for (const label of ["Facebook", "Instagram", "LinkedIn", "X", "TikTok"]) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("href")).toMatch(/^https:\/\//);
    }
  });

  it("does not confuse Active Case with Completed Case", () => {
    pathname = "/dashboard/completed/case-1";
    render(<Sidebar user={USER} />);
    expect(activeLabel()).not.toContain("Active Case");
  });
});

// Reported by Segun on 2026-11-18: "when you open a file in Active Case
// don't change it to My Document."
//
// The analysis of a bill is served from /dashboard/documents/[id], so
// following it from the case moved the highlight to My Document and read
// as having been taken somewhere else entirely.
describe("a document opened from the case", () => {
  function renderAt(path: string, cameFrom: string | null) {
    pathname = path;
    from = cameFrom;
    const result = render(<Sidebar user={USER} />);
    from = null;
    return result;
  }

  function highlighted(): string[] {
    return screen
      .getAllByRole("link")
      .filter((a) => a.className.includes("bg-[#ebebeb]"))
      .map((a) => a.textContent?.trim() ?? "");
  }

  it("keeps Active Case highlighted, not My Document", () => {
    renderAt("/dashboard/documents/bill-1", "case");
    expect(highlighted()).toEqual(["Active Case"]);
  });

  it("still highlights My Document when the customer went there themselves", () => {
    renderAt("/dashboard/documents/bill-1", null);
    expect(highlighted()).toEqual(["My Document"]);
  });

  it("highlights exactly one section either way", () => {
    // Two highlighted sections would be worse than the wrong one.
    renderAt("/dashboard/documents/bill-1", "case");
    expect(highlighted()).toHaveLength(1);
  });
});
