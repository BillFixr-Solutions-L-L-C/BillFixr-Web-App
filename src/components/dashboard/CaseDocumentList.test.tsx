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
});
