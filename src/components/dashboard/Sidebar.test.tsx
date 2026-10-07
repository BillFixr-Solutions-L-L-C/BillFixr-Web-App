import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
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
    for (const label of ["Facebook", "Instagram", "LinkedIn", "TikTok"]) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("href")).toMatch(/^https:\/\//);
    }
    // X has no account set up yet, so it isn't shown here
    expect(screen.queryByRole("link", { name: "X" })).not.toBeInTheDocument();
  });

  it("does not confuse Active Case with Completed Case", () => {
    pathname = "/dashboard/completed/case-1";
    render(<Sidebar user={USER} />);
    expect(activeLabel()).not.toContain("Active Case");
  });
});
