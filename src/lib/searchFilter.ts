// Shared by every admin list page that does a real server-side search —
// PostgREST's `.or()` filter expressions use `,` and `()` as structural
// syntax (to separate/group clauses), so user-supplied search text is
// stripped of them rather than rejected — a search for "Smith, John" just
// becomes "Smith John", which still matches sensibly.
export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()]/g, "").trim();
}

export const ADMIN_PAGE_SIZE = 20;
