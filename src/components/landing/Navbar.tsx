"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

const links = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Why choose us", href: "/#why-choose-us" },
  { label: "Testimonials", href: "/#testimonials" },
  { label: "Careers", href: "/careers" },
  { label: "Contact", href: "/#contact" },
];

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

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative w-full px-6 py-6 lg:px-16">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-primary-900 md:flex">
          {links.map((link) => (
            <Link key={link.label} href={link.href} className="hover:text-primary-600">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/signup"
            className="rounded-full bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 sm:px-5"
          >
            Sign Up
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-primary-600 px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 sm:px-5"
          >
            Log in
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
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
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-primary-50"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
