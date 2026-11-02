import { fireEvent, render, screen } from "@testing-library/react";
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
  it("shows an available document's size and status", () => {
    render(<CaseDocumentList documents={[AVAILABLE]} />);
    expect(screen.getByText("205kb")).toBeInTheDocument();
    expect(screen.getByText("✓ Sent")).toBeInTheDocument();
  });

  it("opens the document over the page rather than navigating to it", () => {
    // The whole point of the change: View used to be a target="_blank"
    // link, which lost the case from view every time a document was
    // opened.
    render(<CaseDocumentList documents={[AVAILABLE]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /View/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByTitle("Provider Responses")).toHaveAttribute("src", "https://signed/doc");
  });

  it("closes the viewer on Escape when the page still has focus", () => {
    // Only when the page has focus. In a real browser an embedded PDF
    // takes focus as it loads, and keys aimed at a cross-origin frame
    // never reach this listener — so the two tests below cover the ways
    // out that always work.
    render(<CaseDocumentList documents={[AVAILABLE]} />);
    fireEvent.click(screen.getByRole("button", { name: /View/ }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on the close button", () => {
    render(<CaseDocumentList documents={[AVAILABLE]} />);
    fireEvent.click(screen.getByRole("button", { name: /View/ }));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on a click outside the document, but not on one inside it", () => {
    render(<CaseDocumentList documents={[AVAILABLE]} />);
    fireEvent.click(screen.getByRole("button", { name: /View/ }));

    // A drag that starts on the document and ends on the backdrop must
    // not be read as a click outside.
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("still offers a way out to a tab, for printing and anything the embed will not do", () => {
    render(<CaseDocumentList documents={[AVAILABLE]} />);
    fireEvent.click(screen.getByRole("button", { name: /View/ }));

    const openInTab = screen.getByRole("link", { name: /Open in new tab/ });
    expect(openInTab).toHaveAttribute("href", "https://signed/doc");
    expect(openInTab).toHaveAttribute("target", "_blank");
  });

  it("renders an image document as an image rather than an embedded frame", () => {
    render(
      <CaseDocumentList
        documents={[{ ...AVAILABLE, label: "Original Bill", sublabel: "bill-scan.JPG" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /View/ }));

    expect(screen.getByRole("img", { name: "Original Bill" })).toHaveAttribute("src", "https://signed/doc");
    expect(screen.queryByTitle("Original Bill")).not.toBeInTheDocument();
  });

  it("shows a document that doesn't exist yet as not available, with nothing to open", () => {
    render(<CaseDocumentList documents={[PENDING]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View/ })).not.toBeInTheDocument();
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
