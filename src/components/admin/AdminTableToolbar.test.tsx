import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminTableToolbar from "./AdminTableToolbar";

const push = vi.fn();
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/users",
  useSearchParams: () => params,
}));

beforeEach(() => {
  vi.clearAllMocks();
  params = new URLSearchParams();
});

describe("AdminTableToolbar", () => {
  it("debounces search input and pushes a URL with the q param, resetting page", async () => {
    params = new URLSearchParams("page=3");
    const user = userEvent.setup();
    render(<AdminTableToolbar searchPlaceholder="Search" />);

    await user.type(screen.getByPlaceholderText("Search"), "jane");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/users?q=jane"), { timeout: 1000 });
  });

  it("clears the q param when the search is emptied", async () => {
    params = new URLSearchParams("q=old");
    const user = userEvent.setup();
    render(<AdminTableToolbar searchPlaceholder="Search" />);

    await user.clear(screen.getByPlaceholderText("Search"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/users?"), { timeout: 1000 });
  });

  it("does not render a status select when statusOptions is omitted", () => {
    render(<AdminTableToolbar searchPlaceholder="Search" />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("navigates immediately on status change, preserving q and resetting page", async () => {
    params = new URLSearchParams("q=jane&page=2");
    const user = userEvent.setup();
    render(
      <AdminTableToolbar
        searchPlaceholder="Search"
        statusOptions={[
          { value: "all", label: "All statuses" },
          { value: "active", label: "Active" },
        ]}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "active");

    expect(push).toHaveBeenCalledWith("/admin/users?q=jane&status=active");
  });

  it("removes the status param when 'all' is selected again", async () => {
    params = new URLSearchParams("status=active");
    const user = userEvent.setup();
    render(
      <AdminTableToolbar
        searchPlaceholder="Search"
        statusOptions={[
          { value: "all", label: "All statuses" },
          { value: "active", label: "Active" },
        ]}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "all");

    expect(push).toHaveBeenCalledWith("/admin/users?");
  });
});
