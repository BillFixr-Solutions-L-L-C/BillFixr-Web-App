import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CaseDocumentList from "./CaseDocumentList";
import type { CaseDocumentRow } from "@/lib/caseDocuments";

const AVAILABLE: CaseDocumentRow = {
  id: "d1",
  label: "Provider Responses",
  status: "Sent",
  date: "2026-08-02",
  sizeLabel: "205kb",
  previewUrl: "https://signed/doc",
  downloadUrl: "https://signed/doc?dl",
  available: true,
};
const PENDING: CaseDocumentRow = {
  id: "d2",
  label: "Follow Up Letter",
  status: "Sent",
  date: null,
  sizeLabel: null,
  previewUrl: null,
  downloadUrl: null,
  available: false,
};

describe("CaseDocumentList", () => {
  it("links View for an available document and shows its size and status", () => {
    render(<CaseDocumentList documents={[AVAILABLE]} />);
    expect(screen.getByRole("link", { name: /View/ })).toHaveAttribute("href", "https://signed/doc");
    expect(screen.getByText("205kb")).toBeInTheDocument();
    expect(screen.getByText("✓ Sent")).toBeInTheDocument();
  });

  it("shows a document that doesn't exist yet as not available, with no link", () => {
    render(<CaseDocumentList documents={[PENDING]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Not available yet")).toBeInTheDocument();
    expect(screen.getByText("Follow Up Letter")).toBeInTheDocument();
  });

  it("offers a download for every available document", () => {
    // A completed case has been paid for, so the documents are no longer
    // view-only the way they are on Active Case.
    render(<CaseDocumentList documents={[AVAILABLE]} />);
    const download = screen.getByRole("link", { name: /Download/ });
    expect(download).toHaveAttribute("href", AVAILABLE.downloadUrl!);
  });

  it("shows download as inert for a document that does not exist yet", () => {
    render(<CaseDocumentList documents={[PENDING]} />);
    expect(screen.queryByRole("link", { name: /Download/ })).not.toBeInTheDocument();
  });
});
