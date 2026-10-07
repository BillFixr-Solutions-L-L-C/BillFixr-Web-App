import { describe, expect, it } from "vitest";
import { missingProfileFields, describeMissingProfile, PROFILE_LABELS } from "./requiredProfile";

const COMPLETE = {
  name: "Jane Doe",
  address: "1 Main St",
  city: "Springfield",
  postalCode: "11111",
  country: "USA",
  avatarUrl: "https://example.com/a.png",
};

describe("requiredProfile", () => {
  it("reports nothing missing for a complete profile", () => {
    expect(missingProfileFields(COMPLETE)).toEqual([]);
    expect(describeMissingProfile([])).toBe("");
  });

  it("names the one field that is missing", () => {
    const missing = missingProfileFields({ ...COMPLETE, avatarUrl: null });
    expect(missing).toEqual(["Profile photo"]);
    expect(describeMissingProfile(missing)).toBe("Still to add: Profile photo.");
  });

  it("names several, reading the way the form does", () => {
    const missing = missingProfileFields({ ...COMPLETE, city: "", country: "", avatarUrl: null });
    // Declaration order, so it matches the order on screen.
    expect(missing).toEqual(["City", "Country", "Profile photo"]);
    expect(describeMissingProfile(missing)).toBe("Still to add: City, Country and Profile photo.");
  });

  it("treats whitespace as unfilled", () => {
    expect(missingProfileFields({ ...COMPLETE, city: "   " })).toEqual(["City"]);
  });

  it("lists everything for a brand-new profile", () => {
    expect(missingProfileFields({})).toEqual(Object.values(PROFILE_LABELS));
  });

  it("never collapses into a count — knowing which ones is the point", () => {
    const all = missingProfileFields({});
    const text = describeMissingProfile(all);
    for (const label of Object.values(PROFILE_LABELS)) {
      expect(text).toContain(label);
    }
  });
});
