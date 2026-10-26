// Supabase's raw auth error messages are technical/verbose in places —
// map the ones that reach end users to copy matching the site's tone.
// Anything not listed here passes through unchanged.
const FRIENDLY_MESSAGES: Record<string, string> = {
  "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.":
    "Password must include a lowercase letter, an uppercase letter, and a number.",
};

export const DISPOSABLE_EMAIL_MESSAGE =
  "That looks like a temporary email address. Please sign up with a permanent one — we send your case updates and appeal letters there.";

export function friendlyAuthError(message: string): string {
  // Supabase normally swallows the trigger's own wording and reports
  // "Database error creating new user", so the caller re-checks the domain
  // and substitutes this message itself rather than guessing from a
  // generic error. Kept for the cases where the raw text does come
  // through. See 20261026000000_block_disposable_email.sql.
  if (message.includes("disposable_email_not_allowed")) {
    return DISPOSABLE_EMAIL_MESSAGE;
  }
  return FRIENDLY_MESSAGES[message] ?? message;
}
