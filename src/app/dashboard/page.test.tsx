import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import DashboardPage from "./page";

const mock = createSupabaseMock();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mock.client,
}));

beforeEach(() => {
  mock.reset();
  mock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

// Read by label rather than by value: two tiles can legitimately show the
// same number, and `getByText("2")` then matches both.
async function tile(label: string): Promise<string> {
  const heading = await screen.findByText(label);
  const value = heading.parentElement?.textContent?.replace(label, "") ?? "";
  return value.trim();
}

// The four tiles were derived from the upload in front of the customer,
// so they read 0 / $0 / 0 / 0 on every visit that was not mid-scan --
// including for someone with analysed bills and a dispute running. The
// first thing they saw after logging in was a claim that nothing had
// ever happened to them.
describe("the dashboard tiles", () => {
  it("count what the customer has actually been through", async () => {
    mock.queueResult("cases", {
      data: [
        { errors_detected: 2, savings_found: 316.04 },
        { errors_detected: 3, savings_found: 1200 },
      ],
      error: null,
    });
    mock.queueResult("cases", { data: null, count: 1, error: null });

    render(<DashboardPage />);

    await waitFor(async () => expect(await tile("Bill Analyzed")).toBe("2"));
    expect(await tile("Savings Found")).toBe("$1,516.04");
    expect(await tile("Errors Detected")).toBe("5");
    expect(await tile("Appeal Generated")).toBe("1");
  });

  it("says zero when the customer genuinely has no cases", async () => {
    mock.queueResult("cases", { data: [], error: null });
    mock.queueResult("cases", { data: null, count: 0, error: null });

    render(<DashboardPage />);

    await waitFor(async () => expect(await tile("Bill Analyzed")).toBe("0"));
    expect(await tile("Savings Found")).toBe("$0");
  });

  it("does not count a bill that has not been analysed yet", async () => {
    // The case exists but nothing has read the bill. It is not an
    // analysed bill and must not be counted as one.
    mock.queueResult("cases", { data: [{ errors_detected: null, savings_found: null }], error: null });
    mock.queueResult("cases", { data: null, count: 0, error: null });

    render(<DashboardPage />);

    await waitFor(async () => expect(await tile("Bill Analyzed")).toBe("0"));
    expect(await tile("Errors Detected")).toBe("0");
  });

  it("reads the customer's own cases and nobody else's", async () => {
    mock.queueResult("cases", { data: [], error: null });
    mock.queueResult("cases", { data: null, count: 0, error: null });

    render(<DashboardPage />);
    await waitFor(() => expect(mock.from).toHaveBeenCalledWith("cases"));

    const builder = mock.from.mock.results[0].value as { eq: ReturnType<typeof vi.fn> };
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
  });
});
