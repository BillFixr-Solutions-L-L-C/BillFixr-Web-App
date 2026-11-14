import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Navbar from "./Navbar";
import { LanguageProvider } from "@/lib/i18n/client";

vi.mock("next/navigation", () => ({
  // The navbar now carries the language switcher, which refreshes the
  // route so server components re-read the language cookie.
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/",
}));

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

  // The nav labels lived in a module-level array of English strings,
  // which is evaluated once at import -- so whichever language rendered
  // first was the one the nav kept, whatever the switcher said. The same
  // mistake has already been made once in this codebase, so it is the
  // behaviour that is tested rather than the shape of the array.
  it("renders its own links in the display language", () => {
    render(
      <LanguageProvider language="es">
        <Navbar dashboardHref={null} />
      </LanguageProvider>,
    );

    expect(screen.getAllByRole("link", { name: "Cómo funciona" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Precios" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Registrarse" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.queryByText("How it works")).not.toBeInTheDocument();
  });

  it("does not keep the first language it was rendered in", () => {
    // Rendered in English first, then Spanish: an array bound at import
    // would still be English on the second render.
    const { unmount } = render(<Navbar dashboardHref={null} />);
    expect(screen.getAllByRole("link", { name: "How it works" }).length).toBeGreaterThan(0);
    unmount();

    render(
      <LanguageProvider language="es">
        <Navbar dashboardHref={null} />
      </LanguageProvider>,
    );
    expect(screen.queryByText("How it works")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Cómo funciona" }).length).toBeGreaterThan(0);
  });
});
