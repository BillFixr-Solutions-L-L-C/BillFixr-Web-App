import { render, screen, within, fireEvent } from "@testing-library/react";
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

// Asked for on 2026-11-19: the language switch has to be on screen, not
// behind the hamburger.
//
// It used to be `hidden sm:flex` in the header with a second copy inside
// the mobile menu -- so on a phone the one control that changes the
// site's language was the one you had to open a menu to find. jsdom does
// not apply media queries, so these assert the structure that decides it:
// one switcher, in the header, with nothing hiding it.
describe("the language switch on a phone", () => {
  function switchers() {
    return screen.getAllByRole("group", { name: "Language" });
  }

  function classesOf(el: HTMLElement): string {
    // The switcher itself, plus whatever wraps it -- which is where the
    // breakpoint lives for the phone copy.
    return `${el.className} ${el.parentElement?.className ?? ""}`;
  }

  it("has one copy for each breakpoint, and both outside the menu", () => {
    // One `hidden sm:flex` in the header row, one in an `sm:hidden` strip
    // beneath it. Exactly one of them is on screen at any width.
    const { container } = render(<Navbar dashboardHref={null} />);

    expect(switchers()).toHaveLength(2);
    // The menu nav only exists once the hamburger is pressed.
    expect(container.querySelector("nav")).not.toBeNull();
    for (const el of switchers()) {
      expect(el.closest("nav")).toBeNull();
    }
  });

  it("puts a copy where a phone can see it without opening anything", () => {
    render(<Navbar dashboardHref={null} />);

    const phoneCopy = switchers().find((el) => classesOf(el).includes("sm:hidden"));
    expect(phoneCopy).toBeDefined();
    // Not itself hidden: `hidden sm:flex` on the phone copy would be the
    // original bug wearing a different hat.
    expect(phoneCopy!.className).not.toMatch(/hidden/);
  });

  it("keeps the header copy for wider screens", () => {
    render(<Navbar dashboardHref={null} />);

    const headerCopy = switchers().find((el) => el.className.includes("sm:flex"));
    expect(headerCopy).toBeDefined();
    expect(headerCopy!.className).toContain("hidden");
  });

  it("offers both languages as buttons", () => {
    render(<Navbar dashboardHref={null} />);

    const buttons = within(switchers()[0]).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    // Short on a phone, full from sm up -- both are in the DOM and CSS
    // picks, so the text carries both forms.
    expect(buttons[0].textContent).toContain("EN");
    expect(buttons[0].textContent).toContain("English");
    expect(buttons[1].textContent).toContain("ES");
  });

  it("does not add a third copy when the menu opens", () => {
    render(<Navbar dashboardHref={null} />);

    fireEvent.click(screen.getByRole("button", { name: /menu/i }));

    expect(switchers()).toHaveLength(2);
  });
});
