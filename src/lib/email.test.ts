import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
    constructor(public key: string) {}
  },
}));

// Covers the lazy Resend client: importing this module must not need the
// key (that is what broke `next build` in CI), but sending must.
describe("lib/email", () => {
  const realKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    send.mockReset();
    send.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  afterEach(() => {
    if (realKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = realKey;
  });

  it("does not need the key just to import the module", async () => {
    delete process.env.RESEND_API_KEY;
    const mod = await import("./email");
    expect(typeof mod.sendEmail).toBe("function");
    expect(send).not.toHaveBeenCalled();
  });

  it("fails with a clear error when sending without a key", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = await import("./email");
    await expect(
      sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" }),
    ).rejects.toThrow("RESEND_API_KEY is not set");
  });

  it("sends once a key is present", async () => {
    process.env.RESEND_API_KEY = "re_dummy_key_for_unit_test";
    const { sendEmail } = await import("./email");
    await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@example.com", subject: "Hi" }),
    );
  });

  it("surfaces a Resend-reported failure", async () => {
    process.env.RESEND_API_KEY = "re_dummy_key_for_unit_test";
    send.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    const { sendEmail } = await import("./email");
    await expect(
      sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" }),
    ).rejects.toThrow("Resend send failed: domain not verified");
  });
});
