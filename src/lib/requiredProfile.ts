// What a customer must fill in on Settings before the dashboard will let
// them in. One definition shared by the Settings banner and the profile
// form, so the two can never disagree about what is still missing.
//
// Labels match the on-screen field labels exactly — the whole point is
// that someone can read the message and know which box to go and fill.

export type RequiredProfile = {
  name: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  avatarUrl: string | null;
};

export const PROFILE_LABELS: Record<keyof RequiredProfile, string> = {
  name: "Your Name",
  address: "Address",
  city: "City",
  postalCode: "Postal Code",
  country: "Country",
  avatarUrl: "Profile photo",
};

// Declaration order is the order the fields appear on screen, so the
// message reads top-to-bottom the way the form does.
const ORDER = Object.keys(PROFILE_LABELS) as (keyof RequiredProfile)[];

export function missingProfileFields(values: Partial<RequiredProfile>): string[] {
  return ORDER.filter((key) => !values[key]?.trim()).map((key) => PROFILE_LABELS[key]);
}

// Unlike the bill information step, this list is never longer than six and
// naming every one of them is the entire purpose — someone who filled in
// four of six needs to know exactly which two are left, not a count.
export function describeMissingProfile(missing: string[]): string {
  if (missing.length === 0) return "";
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Still to add: ${list}.`;
}
