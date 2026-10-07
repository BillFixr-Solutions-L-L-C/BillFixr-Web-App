// The app's social accounts, shared by the landing footer and the
// dashboard sidebar so there's one place to update a handle.
//
// Icons are drawn in currentColor, so each surface sets its own colour.
// An account with no href yet renders as a non-link (X isn't set up).

export function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13 3h3v4h-3c-.6 0-1 .6-1 1.3V10h4l-.6 4H12v7H8v-7H5v-4h3V8c0-2.5 1.5-5 5-5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm5.3-.8a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function LinkedInIcon() {
  return <span className="text-sm font-bold leading-none">in</span>;
}

export function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m3 3 18 18M21 3 3 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function TikTokIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 3h3a5 5 0 0 0 5 5v3a8 8 0 0 1-5-1.7V15a6 6 0 1 1-6-6c.3 0 .7 0 1 .1V12a3 3 0 1 0 2 2.8V3Z"
        fill="currentColor"
      />
    </svg>
  );
}

export type SocialLink = { label: string; href: string | null; icon: React.ReactNode };

export const SOCIAL_LINKS: SocialLink[] = [
  { label: "Facebook", href: "https://www.facebook.com/BillFixrSolutions", icon: <FacebookIcon /> },
  { label: "Instagram", href: "https://www.instagram.com/billfixrsolutions", icon: <InstagramIcon /> },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/billfixr-solutions-llc/", icon: <LinkedInIcon /> },
  { label: "X", href: null, icon: <XIcon /> },
  { label: "TikTok", href: "https://www.tiktok.com/@billfixr", icon: <TikTokIcon /> },
];
