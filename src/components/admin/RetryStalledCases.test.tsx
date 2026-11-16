import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RetryStalledCases from "./RetryStalledCases";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

// An earlier version of this button removed the row from local state, so
// the task appeared to clear while nothing had been retried. It was then
// made deliberately inert, because no route existed an admin could call.
// Now it does the thing it is named after, and these tests are about it
// actually calling something.
describe("Retry", () => {
  it("starts the analysis for each stalled case", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    render(<RetryStalledCases caseIds={["case-1", "case-2"]} label="Retry ALL" />);

    await user.click(screen.getByRole("button", { name: /Retry ALL/ }));

    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe("/api/dev/process-with-ai");
    expect(JSON.parse(calls[0][1].body)).toEqual({ caseId: "case-1" });
    expect(JSON.parse(calls[1][1].body)).toEqual({ caseId: "case-2" });
  });

  it("never forces a re-scan, which would spend the customer's allowance", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    render(<RetryStalledCases caseIds={["case-1"]} label="Retry" />);

    await user.click(screen.getByRole("button", { name: /Retry/ }));

    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body).force).toBeUndefined();
  });

  it("reports how many actually started, and how many did not", async () => {
    const user = userEvent.setup();
    let call = 0;
    global.fetch = vi.fn(async () => {
      call += 1;
      return new Response("{}", { status: call === 1 ? 200 : 500 });
    }) as typeof fetch;
    render(<RetryStalledCases caseIds={["case-1", "case-2"]} label="Retry ALL" />);

    await user.click(screen.getByRole("button", { name: /Retry ALL/ }));

    expect(await screen.findByText(/1 started, 1 still stuck/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("does not claim success when nothing started", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as typeof fetch;
    render(<RetryStalledCases caseIds={["case-1"]} label="Retry" />);

    await user.click(screen.getByRole("button", { name: /Retry/ }));

    expect(await screen.findByText(/0 started, 1 still stuck/)).toBeInTheDocument();
  });

  it("is disabled when nothing is stalled", () => {
    render(<RetryStalledCases caseIds={[]} label="Retry ALL" />);

    expect(screen.getByRole("button", { name: /Retry ALL/ })).toBeDisabled();
  });

  it("is disabled without full access to the AI pipeline domain", () => {
    render(<RetryStalledCases caseIds={["case-1"]} label="Retry" canRetry={false} />);

    expect(screen.getByRole("button", { name: /Retry/ })).toBeDisabled();
  });
});
