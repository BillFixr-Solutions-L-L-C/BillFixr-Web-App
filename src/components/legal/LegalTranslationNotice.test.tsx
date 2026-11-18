import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/lib/i18n/client";
import { DISPLAY_LANGUAGE_COOKIE, FIRST_VISIT_LANGUAGE_COOKIE, type Language } from "@/lib/language";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const LegalTranslationNotice = (await import("./LegalTranslationNotice")).default;

function inLanguage(language: Language) {
  return render(
    <LanguageProvider language={language}>
      <LegalTranslationNotice />
    </LanguageProvider>,
  );
}

function clearCookies() {
  for (const name of [DISPLAY_LANGUAGE_COOKIE, FIRST_VISIT_LANGUAGE_COOKIE]) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  clearCookies();
});

afterEach(() => {
  clearCookies();
});

describe("the courtesy-translation notice", () => {
  it("says nothing on the English page", () => {
    // There is nothing to disclaim: the reader is on the governing text.
    const { container } = inLanguage("en");
    expect(container).toBeEmptyDOMElement();
  });

  it("says which version governs on the Spanish page", () => {
    inLanguage("es");
    expect(screen.getByText(/La versión en inglés de este documento es la que rige/)).toBeInTheDocument();
  });

  it("offers a way to reach the governing version", () => {
    inLanguage("es");
    fireEvent.click(screen.getByRole("button", { name: "Leerlo en inglés" }));

    expect(document.cookie).toContain(`${DISPLAY_LANGUAGE_COOKIE}=en`);
    // Server components read the cookie, so the route has to re-render.
    expect(refresh).toHaveBeenCalled();
  });

  it("does not change what BillFixr writes to the customer in", () => {
    // The whole point of the two cookies. Reading one page in English is
    // not a decision to receive case correspondence in English, and the
    // first-visit cookie is what becomes
    // profiles.communication_language at registration.
    document.cookie = `${FIRST_VISIT_LANGUAGE_COOKIE}=es; path=/`;

    inLanguage("es");
    fireEvent.click(screen.getByRole("button", { name: "Leerlo en inglés" }));

    expect(document.cookie).toContain(`${FIRST_VISIT_LANGUAGE_COOKIE}=es`);
    expect(document.cookie).not.toContain(`${FIRST_VISIT_LANGUAGE_COOKIE}=en`);
  });
});
