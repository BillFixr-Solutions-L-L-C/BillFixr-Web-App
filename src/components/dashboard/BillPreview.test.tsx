import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import BillPreview from "@/components/dashboard/BillPreview";

// Until 2026-11-11 this component took no props and rendered a fabricated
// bill: patient "Dave J. Collins", dates "07/11-07/14", ten line items of
// "$2,345". It appeared on the dashboard's View modal and twice on Active
// Case, so a customer who had paid and had their own bill analysed could
// open it and be shown someone else's invented statement under their own
// case.
//
// Every test here fails against that version.
describe("BillPreview", () => {
  it("shows the customer's own document when there is one", () => {
    render(<BillPreview src="blob:http://localhost/abc" fileName="my-bill.png" />);

    const img = screen.getByRole("img", { name: /my-bill\.png/i });
    expect(img).toHaveAttribute("src", "blob:http://localhost/abc");
  });

  it("invents nothing when there is no document", () => {
    render(<BillPreview src={null} fileName="my-bill.pdf" />);

    expect(screen.getByText(/No preview available/i)).toBeInTheDocument();
    // The specific fabrications that used to render here.
    expect(screen.queryByText(/Dave J\. Collins/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$2,345/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Line item/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/07\/11-07\/14/)).not.toBeInTheDocument();
  });

  it("invents nothing when it is given nothing at all", () => {
    // The adjusted-bill placeholder on Active Case renders it bare.
    render(<BillPreview />);

    expect(screen.getByText(/No preview available/i)).toBeInTheDocument();
    expect(screen.queryByText(/Dave J\. Collins/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$2,345/)).not.toBeInTheDocument();
  });

  it("names the file it could not open, so the message is about their bill", () => {
    render(<BillPreview src={null} fileName="scan-of-my-bill.jpg" />);
    expect(screen.getByText(/scan-of-my-bill\.jpg/)).toBeInTheDocument();
  });

  it("embeds a PDF rather than trying to show it as an image", () => {
    const { container } = render(
      <BillPreview src="https://example.test/bill.pdf" isImage={false} fileName="bill.pdf" />,
    );

    const object = container.querySelector("object");
    expect(object).toHaveAttribute("type", "application/pdf");
    expect(object).toHaveAttribute("data", "https://example.test/bill.pdf");
    expect(container.querySelector("img")).toBeNull();
  });

  it("offers a way to open a PDF the browser will not inline", () => {
    render(<BillPreview src="https://example.test/bill.pdf" isImage={false} fileName="bill.pdf" />);
    expect(screen.getByRole("link", { name: /Open bill\.pdf/i })).toHaveAttribute(
      "href",
      "https://example.test/bill.pdf",
    );
  });
});
