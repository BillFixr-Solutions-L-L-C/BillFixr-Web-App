import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminSidebar from "./AdminSidebar";

let mockPathname = "/admin";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));

describe("AdminSidebar", () => {
  it("marks Dashboard active on /admin itself", () => {
    mockPathname = "/admin";
    render(<AdminSidebar />);
    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveClass("text-gray-900");
  });

  it("does not mark Dashboard active on another admin page", () => {
    mockPathname = "/admin/users";
    render(<AdminSidebar />);
    expect(screen.getByRole("link", { name: /Dashboard/ })).not.toHaveClass("text-gray-900");
    expect(screen.getByRole("link", { name: /Users/ })).toHaveClass("text-gray-900");
  });

  it("does not mark Dashboard active on a nested admin detail page", () => {
    mockPathname = "/admin/users/abc-123";
    render(<AdminSidebar />);
    expect(screen.getByRole("link", { name: /Dashboard/ })).not.toHaveClass("text-gray-900");
    expect(screen.getByRole("link", { name: /Users/ })).toHaveClass("text-gray-900");
  });

  it("links the logo to the admin dashboard home, not the landing page", () => {
    render(<AdminSidebar />);
    const logoLinks = screen.getAllByRole("link", { name: /BillFixr/ });
    expect(logoLinks.length).toBeGreaterThan(0);
    for (const link of logoLinks) {
      expect(link).toHaveAttribute("href", "/admin");
    }
  });

  it("has the Completed Case and Case Detail items from the design", () => {
    mockPathname = "/admin";
    render(<AdminSidebar />);
    expect(screen.getByRole("link", { name: /Completed Case/ })).toHaveAttribute("href", "/admin/completed");
    expect(screen.getByRole("link", { name: /Case Detail/ })).toHaveAttribute("href", "/admin/cases");
  });

  it("keeps Case Detail highlighted inside a case's detail page", () => {
    mockPathname = "/admin/cases/abc-123";
    render(<AdminSidebar />);
    expect(screen.getByRole("link", { name: /Case Detail/ })).toHaveClass("text-gray-900");
    expect(screen.getByRole("link", { name: /Dashboard/ })).not.toHaveClass("text-gray-900");
  });

  it("does not confuse Completed Case with Case Detail", () => {
    mockPathname = "/admin/completed";
    render(<AdminSidebar />);
    expect(screen.getByRole("link", { name: /Completed Case/ })).toHaveClass("text-gray-900");
    expect(screen.getByRole("link", { name: /Case Detail/ })).not.toHaveClass("text-gray-900");
  });

  it("orders the nav the way the design does", () => {
    mockPathname = "/admin";
    render(<AdminSidebar />);
    const labels = screen
      .getAllByRole("link")
      .map((l) => l.textContent?.trim())
      .filter((t): t is string => Boolean(t));
    const order = [
      "Dashboard",
      "Users",
      "Careers",
      "Testimonials",
      "Completed Case",
      "Payments",
      "Uploads",
      "Case Detail",
      "User Management",
      "Automation Monitoring",
      "Support",
    ];
    const seen = order.map((o) => labels.findIndex((l) => l.startsWith(o)));
    expect(seen.every((i) => i >= 0)).toBe(true);
    expect([...seen]).toEqual([...seen].sort((a, b) => a - b));
  });
});
