import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TableScroller from "./TableScroller";

// jsdom gives every element zero size, so overflow has to be faked. These
// define the two widths the component reads and nothing else.
function sizeTo(scrollWidth: number, clientWidth: number, scrollLeft = 0) {
  const region = document.querySelector(".overflow-x-auto") as HTMLElement;
  Object.defineProperty(region, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(region, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(region, "scrollLeft", { value: scrollLeft, writable: true, configurable: true });
  return region;
}

function table() {
  return (
    <TableScroller className="rounded-2xl bg-white">
      <table>
        <tbody>
          <tr>
            <td>Ascension Saint Thomas</td>
          </tr>
        </tbody>
      </table>
    </TableScroller>
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a table wider than the screen", () => {
  // This is the whole point. The columns were always reachable; nothing
  // said so, so on a phone the Active Case screen looked like it simply
  // had no status column.
  it("tells the reader there is more to the right", () => {
    const { rerender } = render(table());
    const region = sizeTo(720, 390);
    fireEvent.scroll(region);
    rerender(table());

    expect(screen.getByText(/Swipe to see more/)).toBeInTheDocument();
  });

  it("marks the scrolling area as a region a screen reader can reach", () => {
    const { rerender } = render(table());
    const region = sizeTo(720, 390);
    fireEvent.scroll(region);
    rerender(table());

    const found = screen.getByRole("region");
    expect(found).toHaveAttribute("tabindex", "0");
  });

  it("drops the hint once the reader has scrolled", () => {
    const { rerender } = render(table());
    const region = sizeTo(720, 390);
    fireEvent.scroll(region);
    rerender(table());
    expect(screen.getByText(/Swipe to see more/)).toBeInTheDocument();

    (region as unknown as { scrollLeft: number }).scrollLeft = 120;
    fireEvent.scroll(region);
    expect(screen.queryByText(/Swipe to see more/)).not.toBeInTheDocument();
  });
});

describe("a table that fits", () => {
  // Desktop must be untouched: no hint, no fades, no extra region. The
  // tables this wraps are Figma-verified at full width.
  it("adds nothing at all", () => {
    const { container, rerender } = render(table());
    const region = sizeTo(390, 390);
    fireEvent.scroll(region);
    rerender(table());

    expect(screen.queryByText(/Swipe to see more/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(0);
  });

  it("is not fooled by a sub-pixel rounding difference", () => {
    const { rerender } = render(table());
    const region = sizeTo(390.4, 390);
    fireEvent.scroll(region);
    rerender(table());

    expect(screen.queryByText(/Swipe to see more/)).not.toBeInTheDocument();
  });
});

describe("the layout it wraps", () => {
  it("keeps the card classes it was given, so the table still looks like a card", () => {
    const { container } = render(table());
    const region = container.querySelector(".overflow-x-auto") as HTMLElement;

    expect(region.className).toContain("rounded-2xl");
    expect(region.className).toContain("bg-white");
    expect(region.className).toContain("overflow-x-auto");
  });

  it("still renders the table itself", () => {
    render(table());
    expect(screen.getByText("Ascension Saint Thomas")).toBeInTheDocument();
  });
});
