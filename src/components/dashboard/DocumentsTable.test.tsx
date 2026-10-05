import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DocumentsTable, { type DocumentRow } from "./DocumentsTable";

const ROW: DocumentRow = {
  key: "c1-appeal",
  label: "Appeal Letter",
  provider: "Crown Med Hospital",
  date: "2026-07-14T00:00:00Z",
  previewUrl: "https://signed/doc",
  href: null,
};

describe("DocumentsTable", () => {
  it("shows an empty state before anything has been produced", () => {
    render(<DocumentsTable rows={[]} />);
    expect(screen.getByText(/Your documents will appear here/)).toBeInTheDocument();
  });

  it("shows only Document, Provider and Date", () => {
    render(<DocumentsTable rows={[ROW]} />);
    for (const header of ["Document", "Provider", "Date"]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
    for (const gone of ["Status", "Provider Response", "Savings"]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
  });

  it("links a file row straight to the file", () => {
    render(<DocumentsTable rows={[ROW]} />);
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("href", "https://signed/doc");
  });

  it("links the analysis row to its page instead", () => {
    render(<DocumentsTable rows={[{ ...ROW, label: "Analysis Generated", href: "/dashboard/documents/bill-1", previewUrl: null }]} />);
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("href", "/dashboard/documents/bill-1");
  });

  it("shows View as unavailable when there's nothing to open", () => {
    render(<DocumentsTable rows={[{ ...ROW, previewUrl: null, href: null }]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("View")).toBeInTheDocument();
  });
});
