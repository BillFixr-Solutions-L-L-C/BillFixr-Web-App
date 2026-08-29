// Supabase's raw auth error messages are technical/verbose in places —
// map the ones that reach end users to copy matching the site's tone.
// Anything not listed here passes through unchanged.
const FRIENDLY_MESSAGES: Record<string, string> = {
  "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.":
    "Password must include a lowercase letter, an uppercase letter, and a number.",
};

export function friendlyAuthError(message: string): string {
  return FRIENDLY_MESSAGES[message] ?? message;
}
