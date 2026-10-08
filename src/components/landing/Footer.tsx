import Logo from "@/components/Logo";
import NewsletterForm from "./NewsletterForm";
import { SOCIAL_LINKS } from "@/components/socialLinks";
import {
  BUSINESS_NAME,
  BUSINESS_ADDRESS_LINES,
  BUSINESS_PHONE,
  BUSINESS_PHONE_HREF,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_HREF,
} from "@/lib/businessContact";

const linkColumns = [
  { label: "Pricing", href: "/pricing" },
  { label: "Terms of Use", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Govt. Compliance", href: "/compliance" },
  { label: "Service Policies", href: "/policies" },
  { label: "Contact Support", href: "mailto:support@billfixr.com" },
];

const wordmarkTextClass =
  "absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[20vw] font-extrabold leading-none tracking-tight text-white/10";

function WordmarkStrip() {
  return (
    <div className="relative overflow-hidden">
      {/* straight segment, above the glass. Heights/offsets are vw-based
          to stay proportional to the vw-based font size at any viewport. */}
      <div className="relative h-[4vw] overflow-hidden select-none" aria-hidden="true">
        <p className={`${wordmarkTextClass} -top-[1vw]`}>BILLFIXR</p>
      </div>

      {/* glass segment: the same wordmark continues here, bent by the glass */}
      <div className="relative overflow-hidden border-t border-white/10 bg-white/5 py-[1.7vw] backdrop-blur-sm">
        <p
          aria-hidden="true"
          className={`${wordmarkTextClass} -top-[5vw] skew-x-12 select-none [transform-origin:50%_5vw]`}
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
            <NewsletterForm />

            {/* Findable without a form: card processors check the site for
                a real address and a contactable number before approving
                live payments. */}
            <address className="mt-8 not-italic text-sm leading-relaxed text-white/80">
              <span className="font-semibold text-white">{BUSINESS_NAME}</span>
              <br />
              {BUSINESS_ADDRESS_LINES.map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
              <a href={BUSINESS_PHONE_HREF} className="mt-2 inline-block hover:text-white">
                {BUSINESS_PHONE}
              </a>
              <br />
              <a href={SUPPORT_EMAIL_HREF} className="hover:text-white">
                {SUPPORT_EMAIL}
              </a>
            </address>
          </div>

          <div className="flex gap-20">
            <div className="flex flex-col items-center gap-4">
              {SOCIAL_LINKS.map((s) =>
                s.href ? (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-primary-600 transition hover:bg-white/80"
                  >
                    {s.icon}
                  </a>
                ) : (
                  <span
                    key={s.label}
                    aria-label={s.label}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-primary-600"
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
