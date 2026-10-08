import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
// The page reads with the service role: app_settings is not visible to a
// signed-out visitor under RLS.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => serverMock.client }));

const PricingPage = (await import("./page")).default;

async function renderAt(percentage: number | null) {
  serverMock.queueResult("app_settings", {
    data: percentage === null ? null : { success_fee_percentage: percentage },
    error: null,
  });
  render(await PricingPage());
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
});

describe("Pricing page", () => {
  it("publishes the success fee the account is actually configured with", async () => {
    await renderAt(12);

    // Not hardcoded: an admin changing it in /admin/payments must change
    // what the public page promises, or we advertise the wrong price.
    expect(screen.getByText("12%")).toBeInTheDocument();
  });

  it("follows a change to the configured percentage", async () => {
    await renderAt(25);
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.queryByText("12%")).not.toBeInTheDocument();
  });

  it("states the commitment fee from the same constant checkout charges", async () => {
    await renderAt(12);
    // COMMITMENT_FEE_CENTS is 500.
    expect(screen.getAllByText(/\$5\b/).length).toBeGreaterThan(0);
  });

  it("works the example out from the live percentage", async () => {
    await renderAt(12);
    // 12% of $500 saved = $60, less the $5 already paid = $55.
    expect(screen.getByText("$60")).toBeInTheDocument();
    expect(screen.getByText("$55")).toBeInTheDocument();
  });

  it("says plainly that no reduction means no success fee", async () => {
    await renderAt(12);
    expect(screen.getByText(/No reduction means no\s+success fee/)).toBeInTheDocument();
  });

  it("falls back to the same default as checkout when the setting is missing", async () => {
    await renderAt(null);
    // create-intent falls back to 30, so the page must not claim something
    // cheaper than the customer would be charged.
    expect(screen.getByText("30%")).toBeInTheDocument();
  });
});
