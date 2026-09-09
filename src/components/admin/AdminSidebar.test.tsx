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
});
