import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LanguageProvider } from "@/lib/i18n/client";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import WhyChooseUs from "@/components/landing/WhyChooseUs";
import CTABanner from "@/components/landing/CTABanner";
import DocumentsTable from "@/components/dashboard/DocumentsTable";
import CompletedCasesTable from "@/components/dashboard/CompletedCasesTable";
import DashboardStats from "@/components/dashboard/DashboardStats";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import type { Language } from "@/lib/language";

// Proof that the switch actually reaches the screen.
//
// The type checker confirms every key exists; it cannot confirm a
// component reads the dictionary at all. A component that kept its
// literals would pass tsc and render English forever, which is precisely
// the bug this whole change exists to prevent -- so each of these asserts
// the Spanish words are really there.

function inLanguage(language: Language, node: React.ReactNode) {
  return render(<LanguageProvider language={language}>{node}</LanguageProvider>);
}

const STATS = {
  billsAnalyzed: "1",
  savingsFound: "$0",
  errorsDetected: "2",
  appealsGenerated: "1",
};

describe("the landing page follows the language", () => {
  it("renders the hero in English", () => {
    inLanguage("en", <Hero />);
    expect(screen.getByText(/Take Control of Your Medical Bills/i)).toBeInTheDocument();
  });

  it("renders the hero in Spanish", () => {
    inLanguage("es", <Hero />);
    expect(screen.getByText(/Tome el control de sus facturas médicas/i)).toBeInTheDocument();
    expect(screen.queryByText(/Take Control of Your Medical Bills/i)).not.toBeInTheDocument();
  });

  it("renders the how-it-works steps in Spanish", () => {
    // These live in a module-level constant, which is evaluated once at
    // import -- the shape most likely to freeze in one language.
    inLanguage("es", <HowItWorks />);
    expect(screen.getByText("Negociamos por usted")).toBeInTheDocument();
    expect(screen.getByText("Usted ahorra")).toBeInTheDocument();
    expect(screen.queryByText("We Negotiate For You")).not.toBeInTheDocument();
  });
});

describe("the dashboard follows the language", () => {
  it("renders the stat labels in Spanish", () => {
    // Also a module-level constant.
    inLanguage("es", <DashboardStats values={STATS} />);
    expect(screen.getByText("Ahorro encontrado")).toBeInTheDocument();
    expect(screen.getByText("Errores detectados")).toBeInTheDocument();
    expect(screen.queryByText("SAVINGS FOUND")).not.toBeInTheDocument();
  });

  it("renders the welcome banner's defaults in Spanish", () => {
    // These were default parameter values, which are bound at module load
    // even though the component re-renders. Resolved at render now.
    inLanguage("es", <WelcomeBanner />);
    expect(screen.getByText("Bienvenido")).toBeInTheDocument();
    expect(screen.queryByText("Welcome")).not.toBeInTheDocument();
  });

  it("still lets a caller pass its own title", () => {
    inLanguage("es", <WelcomeBanner title="Un título propio" />);
    expect(screen.getByText("Un título propio")).toBeInTheDocument();
  });
});

describe("the rest of the landing page follows the language", () => {
  it("renders why-choose-us in Spanish", () => {
    inLanguage("es", <WhyChooseUs />);
    expect(screen.getByText("Por qué elegirnos")).toBeInTheDocument();
    expect(screen.getByText(/pueden ser abrumadoras/i)).toBeInTheDocument();
    expect(screen.queryByText("Why choose us")).not.toBeInTheDocument();
  });

  it("renders the closing banner in Spanish", () => {
    inLanguage("es", <CTABanner />);
    expect(screen.getByText(/La facturación como alivio/i)).toBeInTheDocument();
    expect(screen.queryByText(/Billing as relief/i)).not.toBeInTheDocument();
  });
});

describe("the dashboard tables follow the language", () => {
  it("renders the documents table headers in Spanish", () => {
    // One row, because an empty list renders the empty state instead of
    // the headers -- the first attempt at this asserted against a table
    // that was not on screen.
    inLanguage(
      "es",
      <DocumentsTable
        rows={[
          { key: "d1", label: "bill.pdf", provider: "North Valley", date: null, previewUrl: null, href: null },
        ]}
      />,
    );
    expect(screen.getByText("Documento")).toBeInTheDocument();
    expect(screen.getByText("Proveedor")).toBeInTheDocument();
    expect(screen.queryByText("Document")).not.toBeInTheDocument();
  });

  it("renders the completed-cases headers in Spanish", () => {
    inLanguage(
      "es",
      <CompletedCasesTable
        rows={[
          { id: "c1", filename: "bill.pdf", provider: "North Valley", uploadedAt: null, appealLetterSent: true, savings: null },
        ]}
      />,
    );
    expect(screen.getByText("Carta de reclamación")).toBeInTheDocument();
    expect(screen.getByText("Ahorro propuesto")).toBeInTheDocument();
    expect(screen.queryByText("Appeal Letter")).not.toBeInTheDocument();
  });
});
