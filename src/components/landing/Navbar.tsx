"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useT } from "@/lib/i18n/client";

// Keys, not labels. These used to be the English strings themselves in a
// module-level array, which is evaluated once at import -- so the nav
// froze in whichever language was rendered first and the switcher could
// not move it. The same mistake has been made twice in this codebase; the
// fix is to keep the array as keys and translate at render.
const links = [
  { key: "site.howItWorks", href: "/#how-it-works" },
  { key: "site.whyChooseUs", href: "/#why-choose-us" },
  { key: "site.pricing", href: "/pricing" },
  { key: "site.testimonials", href: "/#testimonials" },
  { key: "site.careers", href: "/careers" },
  { key: "site.contact", href: "/#contact" },
] as const;

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Navbar({ dashboardHref = null }: { dashboardHref?: string | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <header className="relative w-full px-6 py-6 lg:px-16">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-primary-900 md:flex">
          {links.map((link) => (
            <Link key={link.key} href={link.href} className="hover:text-primary-600">
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* The first thing a visitor can choose. chooseLanguage() records
              it as their first-visit language, which becomes the language
              BillFixr writes to them in once they register. */}
          <LanguageSwitcher className="hidden sm:flex" />
          {dashboardHref ? (
            <Link
              href={dashboardHref}
              className="rounded-full bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 sm:px-5"
            >
              {t("site.goToDashboard")}
            </Link>
          ) : (
            <>
              <Link
                href="/signup"
                className="rounded-full bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 sm:px-5"
              >
                {t("site.signUp")}
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-primary-600 px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 sm:px-5"
              >
                {t("site.logIn")}
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? t("site.closeMenu") : t("site.openMenu")}
            aria-expanded={open}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-primary-900 md:hidden"
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="absolute inset-x-6 top-full z-40 mt-2 flex flex-col gap-1 rounded-2xl border border-primary-100 bg-white p-4 text-sm font-medium text-primary-900 shadow-lg md:hidden">
          {links.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-primary-50"
            >
              {t(link.key)}
            </Link>
          ))}

          {/* The switcher in the header row is `hidden sm:flex`, so on a
              phone it is not on screen at all -- which left a Spanish
              speaker on mobile with no way to change the language. It
              lives in the menu too, which is where a phone user looks for
              it anyway. */}
          <div className="mt-2 border-t border-primary-100 pt-3">
            <LanguageSwitcher />
          </div>
        </nav>
      )}
    </header>
  );
}
