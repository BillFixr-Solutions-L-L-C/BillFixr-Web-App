// The information a case genuinely cannot proceed without: who the appeal
// is from, who it goes to, and where it gets sent. Everything else on the
// step is optional.
//
// One definition shared by the form and by the payment route, so the
// button and the server can never disagree about whether a bill is ready
// to scan.

export type RequiredInformation = {
  clientName: string | null;
  hospitalName: string | null;
  billingManagerEmail: string | null;
};

export const REQUIRED_LABELS: Record<keyof RequiredInformation, string> = {
  clientName: "Client Name",
  hospitalName: "Hospital Name",
  billingManagerEmail: "Billing Manager Email",
};

export function missingRequiredInformation(values: Partial<RequiredInformation>): string[] {
  return (Object.keys(REQUIRED_LABELS) as (keyof RequiredInformation)[])
    .filter((key) => !values[key]?.trim())
    .map((key) => REQUIRED_LABELS[key]);
}

export function describeMissing(missing: string[]): string {
  if (missing.length === 0) return "";
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Add ${list} before scanning this bill.`;
}
