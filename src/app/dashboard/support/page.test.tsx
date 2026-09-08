import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupportPage from "./page";

const getUser = vi.fn();
const insert = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => getUser(...args) },
    from: () => ({ insert: (...args: unknown[]) => insert(...args) }),
  }),
}));

async function fillComplaintForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByRole("combobox"), "Payment issue");
  await user.type(screen.getByRole("textbox"), "My bill still shows the wrong amount.");
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("SupportPage complaint form", () => {
  it("shows a validation error and never inserts when topic and message are missing", async () => {
    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Please select a topic and enter a message.")).toBeInTheDocument();
    expect(insert).not.toHaveBeenCalled();
  });

  it("shows a login-required error when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const user = userEvent.setup();
    render(<SupportPage />);

    await fillComplaintForm(user);
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("You need to be logged in to send a message.")).toBeInTheDocument());
    expect(insert).not.toHaveBeenCalled();
  });

  it("shows the server error and does not clear the form when the insert fails", async () => {
    insert.mockResolvedValue({ error: { message: "connection refused" } });
    const user = userEvent.setup();
    render(<SupportPage />);

    await fillComplaintForm(user);
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("connection refused")).toBeInTheDocument());
    expect(screen.getByRole("textbox")).toHaveValue("My bill still shows the wrong amount.");
  });

  it("submits the ticket and shows the sent confirmation on success", async () => {
    insert.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<SupportPage />);

    await fillComplaintForm(user);
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText(/Your message has been sent/)).toBeInTheDocument());
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      subject: "Payment issue",
      message: "My bill still shows the wrong amount.",
      status: "open",
    });
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});
