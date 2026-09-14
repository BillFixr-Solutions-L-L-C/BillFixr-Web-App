import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

const USER = { name: "Jane Doe", status: "active" as const, avatarUrl: null };

describe("Sidebar", () => {
  it("links the logo to the dashboard home, not the landing page", () => {
    render(<Sidebar user={USER} />);
    const logoLinks = screen.getAllByRole("link", { name: /BillFixr/ });
    expect(logoLinks.length).toBeGreaterThan(0);
    for (const link of logoLinks) {
      expect(link).toHaveAttribute("href", "/dashboard");
    }
  });
});
