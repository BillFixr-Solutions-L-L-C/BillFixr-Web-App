import Logo from "@/components/Logo";

const linkColumns = [
  { label: "Terms of Use", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Govt. Compliance", href: "/compliance" },
  { label: "Service Policies", href: "/policies" },
  { label: "Contact Support", href: "#contact" },
];

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13 3h3v4h-3c-.6 0-1 .6-1 1.3V10h4l-.6 4H12v7H8v-7H5v-4h3V8c0-2.5 1.5-5 5-5Z"
        fill="var(--color-primary-600)"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm5.3-.8a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
        stroke="var(--color-primary-600)"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <span className="text-sm font-bold leading-none text-primary-600">in</span>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m3 3 18 18M21 3 3 21" stroke="var(--color-primary-600)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 3h3a5 5 0 0 0 5 5v3a8 8 0 0 1-5-1.7V15a6 6 0 1 1-6-6c.3 0 .7 0 1 .1V12a3 3 0 1 0 2 2.8V3Z"
        fill="var(--color-primary-600)"
      />
    </svg>
  );
}

const socials = [
  { label: "Facebook", href: "https://www.facebook.com/BillFixrSolutions", icon: <FacebookIcon /> },
  { label: "Instagram", href: "https://www.instagram.com/billfixrsolutions", icon: <InstagramIcon /> },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/billfixr-solutions-llc/", icon: <LinkedInIcon /> },
  { label: "X", href: null, icon: <XIcon /> },
  { label: "TikTok", href: "https://www.tiktok.com/@billfixr", icon: <TikTokIcon /> },
];

const wordmarkTextClass =
  "absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[20vw] font-extrabold leading-none tracking-tight text-white/10";

function WordmarkStrip() {
  return (
    <div className="relative overflow-hidden">
      {/* straight segment, above the glass. Heights/offsets are vw-based
          to stay proportional to the vw-based font size at any viewport. */}
      <div className="relative h-[4vw] overflow-hidden select-none" aria-hidden="true">
        <p className={`${wordmarkTextClass} top-[0.7vw]`}>BILLFIXR</p>
      </div>

      {/* glass segment: the same wordmark continues here, bent by the glass */}
      <div className="relative overflow-hidden border-t border-white/10 bg-white/5 py-[1.7vw] backdrop-blur-sm">
        <p
          aria-hidden="true"
          className={`${wordmarkTextClass} -top-[3.3vw] skew-x-12 select-none [transform-origin:50%_3.3vw]`}
        >
          BILLFIXR
        </p>
        <p className="relative text-center text-sm text-white/80">
          © 2026 BillFixr Technologies. All Rights Reserved.
        </p>
      </div>
    </div>
  );
}

export default function Footer() {
  return (
    <footer id="contact" className="relative overflow-hidden bg-gradient-to-br from-primary-500 to-primary-700 text-white">
      <div className="mx-auto max-w-6xl px-6 pb-8 pt-10 sm:px-10 sm:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-8">
          <div>
            <Logo inverted size={56} className="text-4xl sm:text-5xl" />
            <p className="mt-6 text-sm text-white/80">Join Our Mailing List</p>
            <form className="mt-3 flex w-full max-w-md items-center gap-1 rounded-full border-2 border-white bg-white p-1">
              <input
                type="email"
                placeholder="Email Address"
                className="w-full bg-transparent px-4 py-1.5 text-sm text-gray-600 placeholder:text-gray-400 focus:outline-none"
              />
              <button
                type="submit"
                className="flex shrink-0 items-center gap-2 rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
              >
                ↗ Enter
              </button>
            </form>
          </div>

          <div className="flex gap-20">
            <div className="flex flex-col items-center gap-4">
              {socials.map((s) =>
                s.href ? (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white transition hover:bg-white/80"
                  >
                    {s.icon}
                  </a>
                ) : (
                  <span
                    key={s.label}
                    aria-label={s.label}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
                  >
                    {s.icon}
                  </span>
                ),
              )}
            </div>
            <nav className="flex flex-col justify-between text-lg font-bold leading-none text-white">
              {linkColumns.map((link) => (
                <a key={link.label} href={link.href} className="hover:text-white/80">
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <WordmarkStrip />
    </footer>
  );
}
