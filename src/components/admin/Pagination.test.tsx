import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Pagination from "./Pagination";

const push = vi.fn();
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/uploads",
  useSearchParams: () => params,
}));

beforeEach(() => {
  vi.clearAllMocks();
  params = new URLSearchParams();
});

describe("Pagination", () => {
  it("renders nothing when there's only one page", () => {
    const { container } = render(<Pagination page={1} totalPages={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("disables Previous on the first page and Next on the last", () => {
    render(<Pagination page={1} totalPages={3} />);
    expect(screen.getByRole("button", { name: "← Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next →" })).not.toBeDisabled();
  });

  it("shows the current page and total", () => {
    render(<Pagination page={2} totalPages={5} />);
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });

  it("navigates to the next page, preserving other params", async () => {
    params = new URLSearchParams("q=jane");
    const user = userEvent.setup();
    render(<Pagination page={2} totalPages={5} />);

    await user.click(screen.getByRole("button", { name: "Next →" }));

    expect(push).toHaveBeenCalledWith("/admin/uploads?q=jane&page=3");
  });

  it("drops the page param entirely when navigating back to page 1", async () => {
    params = new URLSearchParams("page=2");
    const user = userEvent.setup();
    render(<Pagination page={2} totalPages={5} />);

    await user.click(screen.getByRole("button", { name: "← Previous" }));

    expect(push).toHaveBeenCalledWith("/admin/uploads?");
  });
});
