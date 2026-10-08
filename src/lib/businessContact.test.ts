import { describe, expect, it } from "vitest";
import {
  BUSINESS_PHONE,
  BUSINESS_PHONE_HREF,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_HREF,
  BUSINESS_ADDRESS_LINES,
} from "./businessContact";

// These are published for card-processor review, so the failure that
// matters is a link that looks right but does not dial or mail the real
// contact.
describe("businessContact", () => {
  it("dials the number it displays", () => {
    const displayedDigits = BUSINESS_PHONE.replace(/\D/g, "");
    const hrefDigits = BUSINESS_PHONE_HREF.replace(/\D/g, "");
    // The href carries the country code in front of the displayed digits.
    expect(hrefDigits.endsWith(displayedDigits)).toBe(true);
    expect(BUSINESS_PHONE_HREF.startsWith("tel:+")).toBe(true);
  });

  it("mails the address it displays", () => {
    expect(SUPPORT_EMAIL_HREF).toBe(`mailto:${SUPPORT_EMAIL}`);
    expect(SUPPORT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });

  it("gives a full postal address, not a fragment", () => {
    expect(BUSINESS_ADDRESS_LINES.length).toBeGreaterThanOrEqual(3);
    for (const line of BUSINESS_ADDRESS_LINES) {
      expect(line.trim()).not.toBe("");
    }
    // Country and a postcode are the two a reviewer looks for.
    expect(BUSINESS_ADDRESS_LINES.join(" ")).toMatch(/\b\d{5}\b/);
    expect(BUSINESS_ADDRESS_LINES.at(-1)).toBe("United States");
  });
});
