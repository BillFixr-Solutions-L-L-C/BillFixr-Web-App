import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import SupportPage from "./page";

const mock = createSupabaseMock();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mock.client,
}));

async function fillComplaintForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByRole("combobox"), "Payment issue");
  await user.type(screen.getByRole("textbox"), "My bill still shows the wrong amount.");
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("SupportPage live chat", () => {
  it("shows the voice input control as disabled rather than a dead-looking active button", async () => {
    mock.queueResult("support_tickets", { data: null, error: null }); // no existing "Live Chat" ticket
    mock.queueResult("support_tickets", { data: { id: "ticket-1" }, error: null }); // created one
    mock.queueResult("chat_messages", { data: [], error: null });
    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: "Open live chat" }));

    expect(await screen.findByRole("button", { name: "Voice input" })).toBeDisabled();
  });
});

describe("SupportPage complaint form", () => {
  it("shows a validation error and never inserts when topic and message are missing", async () => {
    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Please select a topic and enter a message.")).toBeInTheDocument();
    expect(mock.from).not.toHaveBeenCalledWith("support_tickets");
  });

  it("shows a login-required error when there is no authenticated user", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    const user = userEvent.setup();
    render(<SupportPage />);

    await fillComplaintForm(user);
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("You need to be logged in to send a message.")).toBeInTheDocument());
    expect(mock.from).not.toHaveBeenCalledWith("support_tickets");
  });

  it("shows the server error and does not clear the form when the insert fails", async () => {
    mock.queueResult("support_tickets", { data: null, error: { message: "connection refused" } });
    const user = userEvent.setup();
    render(<SupportPage />);

    await fillComplaintForm(user);
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("connection refused")).toBeInTheDocument());
    expect(screen.getByRole("textbox")).toHaveValue("My bill still shows the wrong amount.");
  });

  it("submits the ticket and shows the sent confirmation on success", async () => {
    mock.queueResult("support_tickets", { data: null, error: null });
    const user = userEvent.setup();
    render(<SupportPage />);

    await fillComplaintForm(user);
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText(/Your message has been sent/)).toBeInTheDocument());
    const insertCall = mock.from.mock.results.find((r) => typeof r.value.insert === "function")?.value.insert;
    expect(insertCall).toHaveBeenCalledWith({
      user_id: "user-1",
      subject: "Payment issue",
      message: "My bill still shows the wrong amount.",
      status: "open",
    });
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});
