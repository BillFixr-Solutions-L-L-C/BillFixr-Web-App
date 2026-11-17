import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DISPLAY_LANGUAGE_COOKIE, type Language } from "@/lib/language";

// The four legal pages, in both languages.
//
// The type checker proves every key exists. It cannot prove a page reads
// the dictionary at all: a page that kept its English literals compiles
// and renders English forever. These assert the Spanish words really
// reach the screen, and -- because two of these pages build their jump
// nav from an array -- that the array is built per request rather than
// once at import.

let language: Language = "en";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === DISPLAY_LANGUAGE_COOKIE ? { value: language } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  // The navbar carries the language switcher, which refreshes the route.
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/",
}));

const TermsPage = (await import("./terms/page")).default;
const PrivacyPage = (await import("./privacy/page")).default;
const CompliancePage = (await import("./compliance/page")).default;
const PoliciesPage = (await import("./policies/page")).default;

async function renderIn(lang: Language, Page: () => Promise<React.JSX.Element>) {
  // Explicit, because a couple of these render the same page twice in one
  // test to prove the language actually changes between requests.
  // Automatic cleanup only runs between tests, so without this the first
  // render's English is still in the document for the second's assertions
  // -- which made the freeze this test exists to catch look like a pass.
  cleanup();
  language = lang;
  render(await Page());
}

beforeEach(() => {
  language = "en";
});

describe("the terms of service", () => {
  it("renders in English", async () => {
    await renderIn("en", TermsPage);
    expect(screen.getByRole("heading", { name: "Terms of Service", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/does not provide medical advice/i)).toBeInTheDocument();
  });

  it("renders in Spanish", async () => {
    await renderIn("es", TermsPage);
    expect(screen.getByRole("heading", { name: "Términos del Servicio", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/no brinda asesoramiento médico/i)).toBeInTheDocument();
    expect(screen.queryByText(/does not provide medical advice/i)).not.toBeInTheDocument();
  });

  it("translates the date beside the heading, not just the label", async () => {
    await renderIn("es", TermsPage);
    expect(screen.getByText(/Última actualización: agosto de 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/August 2026/)).not.toBeInTheDocument();
  });
});

describe("the privacy policy", () => {
  it("renders in Spanish, including the sentence that wraps a link", async () => {
    await renderIn("es", PrivacyPage);
    expect(screen.getByRole("heading", { name: "Política de Privacidad", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Nunca vendemos sus datos/)).toBeInTheDocument();
    // The cookie sentence is split into three keys around an anchor; a
    // missed middle piece shows up as an English link in Spanish prose.
    expect(screen.getByRole("link", { name: "Política de cookies" })).toBeInTheDocument();
    expect(screen.queryByText(/We never sell your data/)).not.toBeInTheDocument();
  });
});

describe("the compliance page", () => {
  it("renders in Spanish", async () => {
    await renderIn("es", CompliancePage);
    expect(screen.getByText(/Su información médica se trata con el máximo nivel de cuidado/)).toBeInTheDocument();
  });

  it("translates the jump nav, which is built from an array", async () => {
    // The shape that froze three times before: an array of labels
    // evaluated once at module load would keep the first request's
    // language for every later request.
    await renderIn("en", CompliancePage);
    expect(screen.getByRole("link", { name: "Accessibility (ADA)" })).toBeInTheDocument();

    await renderIn("es", CompliancePage);
    expect(screen.getByRole("link", { name: "Accesibilidad (ADA)" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Accessibility (ADA)" })).not.toBeInTheDocument();
  });

  it("leaves the statute acronyms alone", async () => {
    // HIPAA and DMCA are the names of U.S. laws, not words to translate.
    await renderIn("es", CompliancePage);
    expect(screen.getByRole("link", { name: "HIPAA" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DMCA" })).toBeInTheDocument();
  });
});

describe("the service policies", () => {
  it("renders in Spanish", async () => {
    await renderIn("es", PoliciesPage);
    expect(screen.getByRole("heading", { name: "Políticas del Servicio", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Todos los cargos se realizan en dólares estadounidenses/)).toBeInTheDocument();
  });

  it("translates the jump nav, which is built from an array", async () => {
    await renderIn("es", PoliciesPage);
    expect(screen.getByRole("link", { name: "Política de reembolsos" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Refund Policy" })).not.toBeInTheDocument();
  });

  it("states the success fee is charged on the reduction, not the corrected bill", async () => {
    // docs/FEES.md: the fee is a share of the saving. This page says the
    // customer is charged nothing if the bill is not reduced, which has
    // to stay true in both languages.
    await renderIn("es", PoliciesPage);
    expect(screen.getByText(/Si su factura no se reduce, no se le cobrará/)).toBeInTheDocument();
  });
});
