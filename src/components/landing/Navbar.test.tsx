import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Navbar from "./Navbar";

describe("Navbar", () => {
  it("shows Sign Up and Log in when no one is logged in", () => {
    render(<Navbar dashboardHref={null} />);

    expect(screen.getByRole("link", { name: "Sign Up" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Go to Dashboard" })).not.toBeInTheDocument();
  });

  it("shows Go to Dashboard instead of the auth buttons when logged in", () => {
    render(<Navbar dashboardHref="/dashboard" />);

    const dashboardLink = screen.getByRole("link", { name: "Go to Dashboard" });
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: "Sign Up" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  });

  it("points Go to Dashboard at /admin for a logged-in admin", () => {
    render(<Navbar dashboardHref="/admin" />);

    expect(screen.getByRole("link", { name: "Go to Dashboard" })).toHaveAttribute("href", "/admin");
  });
});
